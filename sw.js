// ============================================================
// SERVICE WORKER - ABOTRA-PROAI
// ============================================================
// Location: /sw.js (root folder)

// ============================================================
// ONESIGNAL - Must be first
// ============================================================
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// ============================================================
// CUSTOM SERVICE WORKER
// ============================================================
const CACHE_NAME = 'abotra-v1';

// Install - skip waiting
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(self.skipWaiting());
});

// Activate - claim clients
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'ABOTRA Alert', body: event.data.text() };
        }
    }
    
    const title = data.title || '📢 ABOTRA-PROAI';
    const body = data.body || 'You have a new notification';
    const icon = data.icon || '/assets/images/logo-192.png';
    const badge = data.badge || '/assets/images/logo-192.png';
    const link = data.link || '/dashboard.html';
    
    const options = {
        body: body,
        icon: icon,
        badge: badge,
        vibrate: [200, 100, 200],
        data: { url: link },
        actions: [
            { action: 'open', title: '📱 Open App' },
            { action: 'dismiss', title: '✕ Dismiss' }
        ],
        requireInteraction: true,
        tag: 'abotra_' + Date.now()
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    if (event.action === 'dismiss') return;
    
    const url = event.notification.data?.url || '/dashboard.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});

console.log('[SW] ✅ Service Worker loaded with OneSignal');