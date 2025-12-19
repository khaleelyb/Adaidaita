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
        body: payload.notification.body,
        icon: '/favicon.ico'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
