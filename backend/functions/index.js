// ============================================================
// INDEX.JS - MAIN ENTRY POINT (NEVER CRASHES)
// ============================================================
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ============================================================
// FIREBASE - SAFE INITIALIZATION
// ============================================================
const { initializeFirebase, getDB, getAuth, testConnection, isInitialized } = require('./firebase');

// Initialize Firebase safely - NEVER crashes the server
let firebaseInitialized = false;

try {
    console.log('[FIREBASE] 🔑 Initializing...');
    const result = initializeFirebase();
    firebaseInitialized = result.initialized || false;
    if (firebaseInitialized) {
        console.log('[FIREBASE] ✅ Initialized successfully');
    } else {
        console.warn('[FIREBASE] ⚠️ Firebase not initialized - server will continue without it');
    }
} catch (error) {
    console.error('[FIREBASE] ❌ Initialization threw error:', error.message);
    firebaseInitialized = false;
}

// Make Firebase available globally (with safe fallback)
global.__firebaseDb = firebaseInitialized ? getDB() : null;
global.__firebaseAuth = firebaseInitialized ? getAuth() : null;
global.__firebaseInitialized = firebaseInitialized;

// ============================================================
// ROUTES - Load safely (if Firebase fails, routes will use null)
// ============================================================
let authRoutes, tradeRoutes, userRoutes, depositRoutes, withdrawRoutes;
let walletRoutes, tradeHistoryRoutes, p2pRoutes, orderRoutes, chatRoutes;
let notificationRoutes, robotRoutes, botRoutes, subscriptionRoutes, signalRoutes;
let affiliateRoutes, marketRoutes, copyTradingRoutes, chartRoutes, kycRoutes;
let leaderboardRoutes, adminRoutes;
let startScheduler, getPriceStream;

try {
    authRoutes = require('./routes/auth');
    tradeRoutes = require('./routes/trades');
    userRoutes = require('./routes/user');
    depositRoutes = require('./routes/deposit');
    withdrawRoutes = require('./routes/withdraw');
    walletRoutes = require('./routes/wallet');
    tradeHistoryRoutes = require('./routes/trade-history');
    p2pRoutes = require('./routes/p2p');
    orderRoutes = require('./routes/orders');
    chatRoutes = require('./routes/chat');
    notificationRoutes = require('./routes/notifications');
    robotRoutes = require('./routes/robots');
    botRoutes = require('./routes/bots');
    subscriptionRoutes = require('./routes/subscription');
    signalRoutes = require('./routes/signals');
    affiliateRoutes = require('./routes/affiliate');
    marketRoutes = require('./routes/market');
    copyTradingRoutes = require('./routes/copy-trading');
    chartRoutes = require('./routes/chart');
    kycRoutes = require('./routes/kyc');
    leaderboardRoutes = require('./routes/leaderboard');
    adminRoutes = require('./routes/admin');
    
    const scheduler = require('./scheduler/scheduler');
    startScheduler = scheduler.startScheduler;
    
    const priceStream = require('./streaming/price-stream');
    getPriceStream = priceStream.getPriceStream;
    
    console.log('[SERVER] ✅ All routes loaded successfully');
} catch (error) {
    console.error('[SERVER] ❌ Error loading routes:', error.message);
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// MIDDLEWARE: Inject Firebase into req
// ============================================================
app.use((req, res, next) => {
    req.firebase = {
        db: global.__firebaseDb,
        auth: global.__firebaseAuth,
        initialized: global.__firebaseInitialized
    };
    next();
});

// ============================================================
// MIDDLEWARE: Check Firebase connection for protected routes
// ============================================================
const requireFirebase = (req, res, next) => {
    if (!global.__firebaseInitialized) {
        return res.status(503).json({
            success: false,
            error: 'Firebase is not initialized. Please check server configuration.'
        });
    }
    next();
};

// ============================================================
// HEALTH CHECK - ALWAYS WORKS
// ============================================================
app.get('/health', async (req, res) => {
    let firebaseStatus = 'unknown';
    let connected = false;
    
    if (global.__firebaseInitialized) {
        try {
            connected = await testConnection();
            firebaseStatus = connected ? 'connected' : 'disconnected';
        } catch (error) {
            console.warn('[HEALTH] Firebase test error:', error.message);
            firebaseStatus = 'error';
        }
    } else {
        firebaseStatus = 'not_initialized';
    }
    
    // ============================================================
    // ALWAYS returns 200 OK - even if Firebase fails
    // ============================================================
    res.status(200).json({
        status: firebaseStatus === 'connected' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        firebase: {
            status: firebaseStatus,
            initialized: global.__firebaseInitialized || false,
            connected: connected
        },
        environment: process.env.NODE_ENV || 'development'
    });
});

// ============================================================
// API ROUTES (only if routes loaded successfully)
// ============================================================
if (authRoutes) app.use('/api/auth', requireFirebase, authRoutes);
if (tradeRoutes) app.use('/api/trade', requireFirebase, tradeRoutes);
if (tradeRoutes) app.use('/api/trades', requireFirebase, tradeRoutes);
if (userRoutes) app.use('/api/user', requireFirebase, userRoutes);
if (depositRoutes) app.use('/api/deposit', requireFirebase, depositRoutes);
if (withdrawRoutes) app.use('/api/withdraw', requireFirebase, withdrawRoutes);
if (walletRoutes) app.use('/api/wallet', requireFirebase, walletRoutes);
if (tradeHistoryRoutes) app.use('/api/trade-history', requireFirebase, tradeHistoryRoutes);
if (p2pRoutes) app.use('/api/p2p', requireFirebase, p2pRoutes);
if (orderRoutes) app.use('/api/orders', requireFirebase, orderRoutes);
if (chatRoutes) app.use('/api/chat', requireFirebase, chatRoutes);
if (notificationRoutes) app.use('/api/notifications', requireFirebase, notificationRoutes);
if (robotRoutes) app.use('/api/robots', requireFirebase, robotRoutes);
if (botRoutes) app.use('/api/bot', requireFirebase, botRoutes);
if (subscriptionRoutes) app.use('/api/subscription', requireFirebase, subscriptionRoutes);
if (signalRoutes) app.use('/api/signals', requireFirebase, signalRoutes);
if (affiliateRoutes) app.use('/api/affiliate', requireFirebase, affiliateRoutes);
if (marketRoutes) app.use('/api/market', requireFirebase, marketRoutes);
if (copyTradingRoutes) app.use('/api/copy', requireFirebase, copyTradingRoutes);
if (chartRoutes) app.use('/api/chart', requireFirebase, chartRoutes);
if (kycRoutes) app.use('/api/kyc', requireFirebase, kycRoutes);
if (leaderboardRoutes) app.use('/api/leaderboard', requireFirebase, leaderboardRoutes);
if (adminRoutes) app.use('/api/admin', requireFirebase, adminRoutes);

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.url} not found`
    });
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack || err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// START SERVER - ALWAYS RUNS
// ============================================================
const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, async () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SERVER] Firebase initialized: ${global.__firebaseInitialized ? '✅ YES' : '❌ NO'}`);
    console.log(`[SERVER] Routes loaded: ${authRoutes ? '✅' : '❌'}`);
    
    if (!global.__firebaseInitialized) {
        console.warn('[SERVER] ⚠️ Running without Firebase. Some features may not work.');
        console.warn('[SERVER] 📝 To enable Firebase, set FIREBASE_DATABASE_URL environment variable.');
    }
    
    // Test Firebase connection if initialized
    if (global.__firebaseInitialized) {
        try {
            const connected = await testConnection();
            console.log(`[FIREBASE] Connection test: ${connected ? '✅ PASSED' : '❌ FAILED'}`);
        } catch (error) {
            console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        }
    }
    
    // Start Price Stream (if available)
    try {
        if (getPriceStream) {
            const priceStream = getPriceStream();
            console.log('[SERVER] ✅ Price stream started');
        }
    } catch (error) {
        console.warn('[SERVER] ⚠️ Price stream failed (non-critical):', error.message);
    }
    
    // Start Scheduler (if available)
    try {
        if (startScheduler) {
            startScheduler();
            console.log('[SERVER] ✅ Scheduler started');
        }
    } catch (error) {
        console.warn('[SERVER] ⚠️ Scheduler failed (non-critical):', error.message);
    }
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGINT', () => {
    console.log('[SERVER] Shutting down gracefully...');
    server.close(() => {
        console.log('[SERVER] Closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('[SERVER] Shutting down gracefully...');
    server.close(() => {
        console.log('[SERVER] Closed');
        process.exit(0);
    });
});

// ============================================================
// EXPORT
// ============================================================
module.exports = {
    app,
    server,
    getDb: () => global.__firebaseDb,
    getAuth: () => global.__firebaseAuth,
    isFirebaseInitialized: () => global.__firebaseInitialized
};