// Import and configure the Firebase SDK
// These scripts are made available when the app is served or through CDN
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDpj-5viH0tc53bdTc-Cso332pGc4xZQIc",
    authDomain: "adaidaita-2a42b.firebaseapp.com",
    projectId: "adaidaita-2a42b",
    storageBucket: "adaidaita-2a42b.firebasestorage.app",
    messagingSenderId: "989109823458",
    appId: "1:989109823458:web:12806be6da6bbc36f1fbbb",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification.title || 'Adaidaita';
    const notificationOptions = {
        body: payload.notification.body || '',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: payload.data?.type || 'notification',
        requireInteraction: payload.data?.type === 'new_trip' || payload.data?.type === 'incoming_call',
        data: payload.data || {},
        actions: [
            {
                action: 'open',
                title: 'Open App'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event.notification);
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // Check if app window is already open
            for (let client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not open, open the app
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

