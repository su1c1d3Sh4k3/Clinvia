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
    console.log('[SW] Notification clicked:', event.action);

    event.notification.close();

    // If user clicked dismiss, do nothing
    if (event.action === 'dismiss') {
        return;
    }

    const targetUrl = event.notification.data?.url || '/inbox';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Check if app is already open
                for (const client of windowClients) {
                    if (client.url.includes(self.location.origin)) {
                        // App is open, navigate and focus
                        return client.navigate(targetUrl).then(() => client.focus());
                    }
                }
                // App is not open, open new window
                return clients.openWindow(targetUrl);
            })
            .catch((error) => {
                console.error('[SW] Error handling notification click:', error);
                return clients.openWindow(targetUrl);
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
