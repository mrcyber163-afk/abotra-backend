const API_URL = process.env.API_URL || process.env.VITE_API_URL || 'https://abotra-backend-production.up.railway.app';

const CONFIG = {
    API_URL: API_URL,
    WS_URL: API_URL.replace('https://', 'wss://'),
    ENVIRONMENT: process.env.NODE_ENV || 'production',
    VERSION: '2.0.0',
    FIREBASE: {
        apiKey: "AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM",
        authDomain: "abotra-proa1.firebaseapp.com",
        databaseURL: "https://abotra-proa1-default-rtdb.firebaseio.com",
        projectId: "abotra-proa1",
        storageBucket: "abotra-proa1.firebasestorage.app",
        messagingSenderId: "510401455603",
        appId: "1:510401455603:web:8efa0a186a90dea7c0de86"
    }
};

window.CONFIG = CONFIG;
if (typeof module !== 'undefined' && module.exports) { module.exports = CONFIG; }
console.log('[CONFIG] ✅ API_URL:', CONFIG.API_URL);
