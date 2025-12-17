import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// VAPID public key for push notifications
// Generated at: https://vapidkeys.com/
const VAPID_PUBLIC_KEY = 'BEZGCrwPQ7Sqe17Gxa-HJowZ3zYSox-ZEApRyRCLoG72aLeQfQDOY-5vXcrD9URzLq3X6IL56BrWKNFWGh_CQqk';

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
        // Check if push notifications are supported
        const checkSupport = async () => {
            const supported = 'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window;
            setIsSupported(supported);

            if (supported) {
                setPermission(Notification.permission);

                // Check if already subscribed
                if ('serviceWorker' in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.getSubscription();
                    setIsSubscribed(!!subscription);
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
        if (!isSupported) return false;

        setLoading(true);
        try {
            // Request permission if not granted
            if (Notification.permission !== 'granted') {
                const result = await requestPermission();
                if (result !== 'granted') {
                    setLoading(false);
                    return false;
                }
            }

            // Get service worker registration
            const registration = await navigator.serviceWorker.ready;

            // Check if VAPID key is configured
            if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') {
                console.warn('Push notifications not configured: VAPID key missing');
                setLoading(false);
                return false;
            }

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            // Get subscription details
            const json = subscription.toJSON();
            const subscriptionData: PushSubscriptionData = {
                endpoint: json.endpoint!,
                p256dh: json.keys!.p256dh,
                auth: json.keys!.auth,
                device_type: getDeviceType()
            };

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.error('User not authenticated');
                setLoading(false);
                return false;
            }

            // Save to database
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
                console.error('Error saving push subscription:', error);
                setLoading(false);
                return false;
            }

            setIsSubscribed(true);
            setLoading(false);
            return true;
        } catch (error) {
            console.error('Error subscribing to push:', error);
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
