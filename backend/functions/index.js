// ============================================================
// INDEX.JS - MAIN ENTRY POINT
// ============================================================
// Location: backend/functions/index.js
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ============================================================
// FIREBASE INITIALIZATION - Workload Identity
// ============================================================
const { initializeFirebase, getDB, getAuth, testConnection, isInitialized } = require('./firebase');

let db, auth;
let firebaseInitialized = false;

try {
    console.log('[FIREBASE] 🔑 Initializing...');
    const firebase = initializeFirebase();
    db = firebase.db;
    auth = firebase.auth;
    firebaseInitialized = true;
    console.log('[FIREBASE] ✅ Initialized successfully');
} catch (error) {
    console.error('[FIREBASE] ❌ Initialization failed:', error.message);
    console.error('[FIREBASE] ❌ Please check your environment variables');
    firebaseInitialized = false;
}

// ============================================================
// EXPOSE FIREBASE INSTANCES FOR ROUTES
// ============================================================
global.__firebaseDb = db;
global.__firebaseAuth = auth;
global.__firebaseInitialized = firebaseInitialized;

// ============================================================
// ROUTES
// ============================================================
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const userRoutes = require('./routes/user');
const depositRoutes = require('./routes/deposit');
const withdrawRoutes = require('./routes/withdraw');
const walletRoutes = require('./routes/wallet');
const tradeHistoryRoutes = require('./routes/trade-history');
const p2pRoutes = require('./routes/p2p');
const orderRoutes = require('./routes/orders');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications');
const robotRoutes = require('./routes/robots');
const botRoutes = require('./routes/bots');
const subscriptionRoutes = require('./routes/subscription');
const signalRoutes = require('./routes/signals');
const affiliateRoutes = require('./routes/affiliate');
const marketRoutes = require('./routes/market');
const copyTradingRoutes = require('./routes/copy-trading');
const chartRoutes = require('./routes/chart');
const kycRoutes = require('./routes/kyc');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

// ============================================================
// SCHEDULER & PRICE STREAM
// ============================================================
const { startScheduler } = require('./scheduler/scheduler');
const { getPriceStream } = require('./streaming/price-stream');

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
// HEALTH CHECK
// ============================================================
app.get('/health', async (req, res) => {
    let firebaseStatus = 'unknown';
    
    if (global.__firebaseInitialized) {
        try {
            const connected = await testConnection();
            firebaseStatus = connected ? 'connected' : 'disconnected';
        } catch (error) {
            firebaseStatus = 'error';
        }
    } else {
        firebaseStatus = 'not_initialized';
    }
    
    res.json({
        status: firebaseStatus === 'connected' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        firebase: {
            status: firebaseStatus,
            initialized: global.__firebaseInitialized
        }
    });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', requireFirebase, authRoutes);
app.use('/api/trade', requireFirebase, tradeRoutes);
app.use('/api/trades', requireFirebase, tradeRoutes);
app.use('/api/user', requireFirebase, userRoutes);
app.use('/api/deposit', requireFirebase, depositRoutes);
app.use('/api/withdraw', requireFirebase, withdrawRoutes);
app.use('/api/wallet', requireFirebase, walletRoutes);
app.use('/api/trade-history', requireFirebase, tradeHistoryRoutes);
app.use('/api/p2p', requireFirebase, p2pRoutes);
app.use('/api/orders', requireFirebase, orderRoutes);
app.use('/api/chat', requireFirebase, chatRoutes);
app.use('/api/notifications', requireFirebase, notificationRoutes);
app.use('/api/robots', requireFirebase, robotRoutes);
app.use('/api/bot', requireFirebase, botRoutes);
app.use('/api/subscription', requireFirebase, subscriptionRoutes);
app.use('/api/signals', requireFirebase, signalRoutes);
app.use('/api/affiliate', requireFirebase, affiliateRoutes);
app.use('/api/market', requireFirebase, marketRoutes);
app.use('/api/copy', requireFirebase, copyTradingRoutes);
app.use('/api/chart', requireFirebase, chartRoutes);
app.use('/api/kyc', requireFirebase, kycRoutes);
app.use('/api/leaderboard', requireFirebase, leaderboardRoutes);
app.use('/api/admin', requireFirebase, adminRoutes);

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
    console.error('[ERROR]', err.stack);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 5001;

app.listen(PORT, async () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SERVER] Firebase initialized: ${global.__firebaseInitialized ? '✅ YES' : '❌ NO'}`);
    
    if (!global.__firebaseInitialized) {
        console.warn('[SERVER] ⚠️ Firebase is NOT initialized. Please check:');
        console.warn('[SERVER]   - FIREBASE_PROJECT_ID');
        console.warn('[SERVER]   - FIREBASE_DATABASE_URL');
    }
    
    console.log(`[SERVER] Routes loaded:`);
    console.log(`  - /api/auth   (Auth routes)`);
    console.log(`  - /api/trade  (Trade routes)`);
    console.log(`  - /api/user   (User routes)`);
    console.log(`  - /api/deposit (Deposit routes)`);
    console.log(`  - /api/withdraw (Withdraw routes)`);
    
    // Test Firebase connection if initialized
    if (global.__firebaseInitialized) {
        try {
            const connected = await testConnection();
            console.log(`[FIREBASE] Connection test: ${connected ? '✅ PASSED' : '❌ FAILED'}`);
        } catch (error) {
            console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        }
    }
    
    // Start Price Stream
    try {
        const priceStream = getPriceStream();
        console.log('[SERVER] ✅ Price stream started');
    } catch (error) {
        console.error('[SERVER] ❌ Price stream failed:', error.message);
    }
    
    // Start Scheduler
    try {
        startScheduler();
        console.log('[SERVER] ✅ Scheduler started');
    } catch (error) {
        console.error('[SERVER] ❌ Scheduler failed:', error.message);
    }
    
    // Update active symbols after 5 seconds
    setTimeout(async () => {
        try {
            const priceStream = getPriceStream();
            await priceStream.updateActiveSymbols();
            console.log('[SERVER] ✅ Active symbols updated');
        } catch (error) {
            console.error('[SERVER] ❌ Symbol update failed:', error.message);
        }
    }, 5000);
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGINT', () => {
    console.log('[SERVER] Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('[SERVER] Shutting down gracefully...');
    process.exit(0);
});

// ============================================================
// EXPORT
// ============================================================
module.exports = {
    app,
    getDb: () => global.__firebaseDb,
    getAuth: () => global.__firebaseAuth,
    isFirebaseInitialized: () => global.__firebaseInitialized
};