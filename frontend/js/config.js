// ============================================================
// CONFIG.JS - Backend Configuration
// ============================================================
const CONFIG = {
    API_URL: 'https://abotra-backend-production.up.railway.app',
    WS_URL: 'wss://abotra-backend-production.up.railway.app',
    ENVIRONMENT: 'production',
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

// Make it available globally
window.CONFIG = CONFIG;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}