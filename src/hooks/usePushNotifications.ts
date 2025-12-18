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
            alert('[Push] Not supported on this device');
            return false;
        }

        setLoading(true);

        try {
            alert('[Push] Step 1: Checking permission...');

            // Request permission if not granted
            if (Notification.permission !== 'granted') {
                const result = await requestPermission();
                if (result !== 'granted') {
                    alert('[Push] Permission denied by user');
                    setLoading(false);
                    return false;
                }
            }
            alert('[Push] Step 2: Permission OK - ' + Notification.permission);

            // Check if VAPID key is configured
            if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') {
                alert('[Push] Error: VAPID key not configured');
                setLoading(false);
                return false;
            }
            alert('[Push] Step 3: VAPID key OK');

            // Get service worker registration with timeout
            alert('[Push] Step 4: Waiting for Service Worker...');
            let registration: ServiceWorkerRegistration;
            try {
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Service Worker timeout - 10s')), 10000)
                );
                registration = await Promise.race([
                    navigator.serviceWorker.ready,
                    timeoutPromise
                ]) as ServiceWorkerRegistration;
            } catch (err: any) {
                alert('[Push] Error: Service Worker failed - ' + (err?.message || err));
                setLoading(false);
                return false;
            }
            alert('[Push] Step 5: Service Worker ready - ' + (registration.active?.state || 'unknown'));

            // Subscribe to push
            alert('[Push] Step 6: Subscribing to Push Manager...');
            let subscription;
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
            } catch (err: any) {
                alert('[Push] Error: Push subscribe failed - ' + (err?.message || err));
                setLoading(false);
                return false;
            }
            alert('[Push] Step 7: Push subscription created');

            // Get subscription details
            const json = subscription.toJSON();
            const subscriptionData: PushSubscriptionData = {
                endpoint: json.endpoint!,
                p256dh: json.keys!.p256dh,
                auth: json.keys!.auth,
                device_type: getDeviceType()
            };

            // Get current user
            alert('[Push] Step 8: Getting user...');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert('[Push] Error: User not authenticated');
                setLoading(false);
                return false;
            }
            alert('[Push] Step 9: User OK - ' + user.id.substring(0, 8));

            // Save to database
            alert('[Push] Step 10: Saving to database...');
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
                alert('[Push] Error: DB save failed - ' + error.message);
                setLoading(false);
                return false;
            }

            alert('[Push] SUCCESS! Device registered!');
            setIsSubscribed(true);
            setLoading(false);
            return true;
        } catch (error: any) {
            alert('[Push] Unexpected error: ' + (error?.message || error));
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
