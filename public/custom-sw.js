import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { createHandlerBoundToURL } from 'workbox-precaching';

// Take control immediately
self.skipWaiting();
clientsClaim();

// Precache assets injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Navigation route - serve index.html for all navigation requests
const navigationRoute = new NavigationRoute(createHandlerBoundToURL('index.html'), {
    allowlist: [/^\/$/]
});
registerRoute(navigationRoute);

// ===== PUSH NOTIFICATION HANDLERS =====

/**
 * Handle incoming push notifications
 * Triggered when the server sends a push message
 */
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received');

    let data = {
        title: 'Clinvia',
        body: 'Nova mensagem recebida',
        icon: '/pwa-icon.png',
        badge: '/pwa-icon.png',
        data: { url: '/inbox' }
    };

    // Parse push data if available
    if (event.data) {
        try {
            const payload = event.data.json();
            data = {
                title: payload.title || data.title,
                body: payload.body || data.body,
                icon: payload.icon || data.icon,
                badge: payload.badge || data.badge,
                data: payload.data || data.data
            };
        } catch (e) {
            console.warn('[SW] Failed to parse push data as JSON:', e);
            data.body = event.data.text() || data.body;
        }
    }

    console.log('[SW] Showing notification:', data.title, data.body);

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.data?.tag || 'clinvia-message',
        data: data.data,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'dismiss', title: 'Dispensar' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

/**
 * Handle notification click events
 * Opens the app and navigates to the relevant page
 */
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action, event.notification.data);

    event.notification.close();

    // If user clicked dismiss, do nothing
    if (event.action === 'dismiss') {
        return;
    }

    // Build the full URL
    const targetPath = event.notification.data?.url || '/inbox';
    const fullUrl = new URL(targetPath, self.location.origin).href;

    console.log('[SW] Opening URL:', fullUrl);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                console.log('[SW] Found', windowClients.length, 'window clients');

                // Try to find an existing app window
                for (const client of windowClients) {
                    console.log('[SW] Checking client:', client.url);
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        // Focus the existing window and navigate
                        return client.focus().then((focusedClient) => {
                            // Send message to navigate (more reliable than navigate())
                            if (focusedClient) {
                                focusedClient.postMessage({
                                    type: 'NOTIFICATION_CLICK',
                                    url: targetPath
                                });
                            }
                            return focusedClient;
                        });
                    }
                }

                // No existing window, open new one
                console.log('[SW] Opening new window:', fullUrl);
                return clients.openWindow(fullUrl);
            })
            .catch((error) => {
                console.error('[SW] Error handling notification click:', error);
                // Fallback: try to open new window
                return clients.openWindow(fullUrl);
            })
    );
});

/**
 * Handle notification close events (dismissed without clicking)
 */
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification dismissed:', event.notification.tag);
});

console.log('[SW] Custom Service Worker loaded with push support');
