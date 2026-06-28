// ============================================================
// INDEX.JS - MAIN ENTRY POINT (REST API Mode)
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// FIREBASE - REST API Mode
// ============================================================

const { initializeFirebase, getDB, getAuth, isInitialized, testConnection } = require('./firebase');

let firebaseInitialized = false;

try {
    console.log('[FIREBASE] 🔑 Initializing REST API mode...');
    const result = initializeFirebase();
    firebaseInitialized = result.initialized || false;
    if (firebaseInitialized) {
        console.log('[FIREBASE] ✅ Initialized successfully (REST API mode)');
    } else {
        console.warn('[FIREBASE] ⚠️ Firebase not initialized - server will continue');
    }
} catch (error) {
    console.error('[FIREBASE] ❌ Init error:', error.message);
    firebaseInitialized = false;
}

// Make Firebase available globally
global.__firebaseDb = firebaseInitialized ? getDB() : null;
global.__firebaseAuth = firebaseInitialized ? getAuth() : null;
global.__firebaseInitialized = firebaseInitialized;

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'connected' : 'disconnected',
        mode: 'REST API',
        version: '2.0.0'
    });
});

// ============================================================
// TEST FIREBASE CONNECTION
// ============================================================

app.get('/api/test-firebase', async (req, res) => {
    const result = await testConnection();
    res.json({
        success: result.success,
        mode: 'REST API',
        firebaseInitialized,
        ...result
    });
});

// ============================================================
// ROUTES
// ============================================================

try {
    // Auth routes
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);

    // User routes
    const userRoutes = require('./routes/user');
    app.use('/api/user', userRoutes);

    // Trade routes
    const tradeRoutes = require('./routes/trades');
    app.use('/api/trades', tradeRoutes);

    // Deposit routes
    const depositRoutes = require('./routes/deposit');
    app.use('/api/deposit', depositRoutes);

    // Withdraw routes
    const withdrawRoutes = require('./routes/withdraw');
    app.use('/api/withdraw', withdrawRoutes);

    // Wallet routes
    const walletRoutes = require('./routes/wallet');
    app.use('/api/wallet', walletRoutes);

    // P2P routes
    const p2pRoutes = require('./routes/p2p');
    app.use('/api/p2p', p2pRoutes);

    // Market routes
    const marketRoutes = require('./routes/market');
    app.use('/api/market', marketRoutes);

    // Leaderboard routes
    const leaderboardRoutes = require('./routes/leaderboard');
    app.use('/api/leaderboard', leaderboardRoutes);

    // Admin routes
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes);

    console.log('[ROUTES] ✅ All routes loaded successfully');
} catch (error) {
    console.error('[ROUTES] ❌ Error loading routes:', error.message);
}

// ============================================================
// 404 & ERROR HANDLING
// ============================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

app.use((err, req, res, next) => {
    console.error('[SERVER] Error:', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`[SERVER] 🚀 Running on port ${PORT}`);
    console.log(`[SERVER] 🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`[SERVER] 🔥 Firebase mode: ${firebaseInitialized ? 'REST API ✅' : 'DISABLED ❌'}`);
});

// ============================================================
// NOTIFICATION ROUTES
// ============================================================
try {
    const notificationRoutes = require('./routes/send-push');
    app.use('/api/notifications', notificationRoutes);
    console.log('[ROUTES] ✅ /api/notifications loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/notifications error:', error.message);
}

// ============================================================
// PASSWORD CHANGE ROUTES
// ============================================================
try {
    const passwordRoutes = require('./routes/change-password');
    app.use('/api/admin', passwordRoutes);
    console.log('[ROUTES] ✅ /api/admin/change-password loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/admin/change-password error:', error.message);
}

// ============================================================
// TRADE ROUTES
// ============================================================
try {
    const tradeRoutes = require('./routes/trade');
    app.use('/api/trading', tradeRoutes);
    console.log('[ROUTES] ✅ /api/trading loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/trading error:', error.message);
}

// ============================================================
// LEADERBOARD ROUTES
// ============================================================
try {
    const leaderboardRoutes = require('./routes/leaderboard');
    app.use('/api/leaderboard', leaderboardRoutes);
    console.log('[ROUTES] ✅ /api/leaderboard loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/leaderboard error:', error.message);
}

// ============================================================
// COPY TRADING ROUTES
// ============================================================
try {
    const copyTradingRoutes = require('./routes/copy-trading');
    app.use('/api/copy-trading', copyTradingRoutes);
    console.log('[ROUTES] ✅ /api/copy-trading loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/copy-trading error:', error.message);
}
