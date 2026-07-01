// ============================================================
// SERVICE WORKER - ABOTRA-PROAI
// ============================================================
// Location: /sw.js (root folder)

const CACHE_NAME = 'abotra-v1';

// ✅ Notifications are handled by the service worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(clients.claim());
});

// ✅ Handle push notifications
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
        data: {
            url: link,
            timestamp: data.timestamp || Date.now()
        },
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

// ✅ Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    
    event.notification.close();
    
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

// ✅ Handle notification action buttons
self.addEventListener('notificationclick', (event) => {
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then((clientList) => {
                    for (const client of clientList) {
                        if (client.url.includes('/dashboard.html') && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    return clients.openWindow('/dashboard.html');
                })
        );
    }
    event.notification.close();
});

console.log('[SW] ✅ Service Worker loaded');