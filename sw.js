// ============================================================
// ABOTRA-PROAI Service Worker
// Version: 2.0.0
// ============================================================

const CACHE_NAME = 'abotra-cache-v2.0.0';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/login.html',
  '/register.html',
  '/deposit.html',
  '/withdraw.html',
  '/market.html',
  '/trade.html',
  '/p2p-order.html',
  '/p2p-market.html',
  '/auto-bot.html',
  '/robots.html',
  '/affiliate.html',
  '/subscriptions.html',
  '/copy-trading.html',
  '/wallet.html',
  '/leaderboard.html',
  '/account.html',
  '/notifications.html',
  '/offline.html',
  '/manifest.json',
  '/assets/images/logo.png',
  '/assets/images/logo-192.png',
  '/assets/images/logo-512.png',
  '/assets/images/background.png',
  '/assets/images/background-light.png',
  '/assets/images/favicon.ico'
];

// Google Fonts and CDN assets (cache on demand)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
];

// ============================================================
// INSTALL
// ============================================================
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// ============================================================
// ACTIVATE
// ============================================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated successfully');
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH - Network First Strategy
// ============================================================
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip Firebase, Analytics, and external APIs
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('coingecko') ||
      url.hostname.includes('railway.app')) {
    // Network only for API calls
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip admin pages from caching (admin should always get fresh)
  if (url.pathname.includes('/admin/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // For HTML pages - Network first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone response and cache it
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // If network fails, try cache
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If not in cache, return offline page
              return caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }
  
  // For static assets - Cache first, network fallback
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Return cached response and update cache in background
            fetch(request)
              .then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, networkResponse);
                  });
                }
              })
              .catch(() => {});
            return cachedResponse;
          }
          // If not in cache, fetch from network
          return fetch(request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseClone);
                });
              }
              return response;
            });
        })
    );
    return;
  }
  
  // For everything else - Network first
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for future use
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: 'ABOTRA-PROAI',
    body: 'New update available!',
    icon: '/assets/images/logo-192.png',
    badge: '/assets/images/logo-192.png',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: {
      url: '/dashboard.html'
    }
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: data.vibrate,
      requireInteraction: data.requireInteraction,
      data: data.data,
      actions: [
        {
          action: 'open',
          title: 'Open App'
        },
        {
          action: 'close',
          title: 'Dismiss'
        }
      ]
    })
  );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/dashboard.html';
  
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(clientList => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// ============================================================
// MESSAGE HANDLING
// ============================================================
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
  }
});

// ============================================================
// BACKGROUND SYNC (Optional)
// ============================================================
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPendingPosts());
  }
});

async function syncPendingPosts() {
  console.log('[SW] Syncing pending posts...');
  // Implement background sync logic here
}