import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// VAPID public key for push notifications
// Generated at: https://vapidkeys.com/
const VAPID_PUBLIC_KEY = 'BG74bafeznjsNaKj0NrS-OsyKcGrhCXl9P703jOQScEe0Xq5yRZq8V88fCggLqcRnTEKytWNCe3MiExvorIm0-w';

interface PushSubscriptionData {
    endpoint: string;
    p256dh: string;
    auth: string;
    device_type: 'desktop' | 'mobile' | 'tablet';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function getDeviceType(): 'desktop' | 'mobile' | 'tablet' {
    const ua = navigator.userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
    return 'desktop';
}

export function usePushNotifications() {
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Check if push notifications are supported and if device is registered in DB
        const checkSupport = async () => {
            const supported = 'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window;
            setIsSupported(supported);

            if (supported) {
                setPermission(Notification.permission);

                // Check if already subscribed in browser
                if ('serviceWorker' in navigator) {
                    try {
                        const registration = await navigator.serviceWorker.ready;
                        const subscription = await registration.pushManager.getSubscription();

                        if (subscription) {
                            // Check if this endpoint exists in the database
                            const { data: { user } } = await supabase.auth.getUser();
                            if (user) {
                                const { data, error } = await supabase
                                    .from('push_subscriptions' as any)
                                    .select('id')
                                    .eq('user_id', user.id)
                                    .eq('endpoint', subscription.endpoint)
                                    .maybeSingle();

                                // Only mark as subscribed if exists in DB
                                setIsSubscribed(!error && !!data);
                                console.log('[Push] DB check:', !error && !!data ? 'Found' : 'Not found');
                            } else {
                                setIsSubscribed(false);
                            }
                        } else {
                            setIsSubscribed(false);
                        }
                    } catch (err) {
                        console.error('[Push] Error checking subscription:', err);
                        setIsSubscribed(false);
                    }
                }
            }
        };

        checkSupport();
    }, []);

    const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
        if (!isSupported) return 'denied';

        const result = await Notification.requestPermission();
        setPermission(result);
        return result;
    }, [isSupported]);

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            console.warn('[Push] Not supported');
            return false;
        }

        setLoading(true);
        console.log('[Push] Starting subscription process...');

        try {
            // Request permission if not granted
            if (Notification.permission !== 'granted') {
                console.log('[Push] Requesting notification permission...');
                const result = await requestPermission();
                if (result !== 'granted') {
                    console.warn('[Push] Permission denied');
                    setLoading(false);
                    return false;
                }
            }
            console.log('[Push] Permission granted');

            // Check if VAPID key is configured
            if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') {
                console.error('[Push] VAPID key not configured');
                setLoading(false);
                return false;
            }

            // Get service worker registration with timeout
            console.log('[Push] Waiting for service worker...');
            let registration: ServiceWorkerRegistration;
            try {
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Service Worker timeout')), 10000)
                );
                registration = await Promise.race([
                    navigator.serviceWorker.ready,
                    timeoutPromise
                ]) as ServiceWorkerRegistration;
            } catch (err) {
                console.error('[Push] Service Worker not ready:', err);
                setLoading(false);
                return false;
            }
            console.log('[Push] Service worker ready');

            // Subscribe to push
            console.log('[Push] Subscribing to push manager...');
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            console.log('[Push] Push subscription created:', subscription.endpoint.substring(0, 50));

            // Get subscription details
            const json = subscription.toJSON();
            const subscriptionData: PushSubscriptionData = {
                endpoint: json.endpoint!,
                p256dh: json.keys!.p256dh,
                auth: json.keys!.auth,
                device_type: getDeviceType()
            };

            // Get current user
            console.log('[Push] Getting current user...');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('[Push] User not authenticated');
                setLoading(false);
                return false;
            }
            console.log('[Push] User:', user.id);

            // Save to database
            console.log('[Push] Saving to database...');
            const { error } = await supabase
                .from('push_subscriptions' as any)
                .upsert({
                    user_id: user.id,
                    endpoint: subscriptionData.endpoint,
                    p256dh: subscriptionData.p256dh,
                    auth: subscriptionData.auth,
                    device_type: subscriptionData.device_type
                }, {
                    onConflict: 'endpoint'
                });

            if (error) {
                console.error('[Push] Error saving subscription:', error);
                setLoading(false);
                return false;
            }

            console.log('[Push] Subscription saved successfully!');
            setIsSubscribed(true);
            setLoading(false);
            return true;
        } catch (error) {
            console.error('[Push] Error subscribing:', error);
            setLoading(false);
            return false;
        }
    }, [isSupported, requestPermission]);

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) return false;

        setLoading(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();

                // Remove from database
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase
                        .from('push_subscriptions' as any)
                        .delete()
                        .eq('user_id', user.id)
                        .eq('endpoint', subscription.endpoint);
                }
            }

            setIsSubscribed(false);
            setLoading(false);
            return true;
        } catch (error) {
            console.error('Error unsubscribing from push:', error);
            setLoading(false);
            return false;
        }
    }, [isSupported]);

    return {
        isSupported,
        isSubscribed,
        permission,
        loading,
        requestPermission,
        subscribe,
        unsubscribe
    };
}
