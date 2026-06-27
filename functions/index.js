// functions/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initializeFirebase } = require('./firebase');
initializeFirebase();

// ============================================================
// ROUTES
// ============================================================
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trade');
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
const botRoutes = require('./routes/bot');
const subscriptionRoutes = require('./routes/subscription');
const signalRoutes = require('./routes/signals');
const affiliateRoutes = require('./routes/affiliate');
const marketRoutes = require('./routes/market');
const copyTradingRoutes = require('./routes/copy-trading');
const chartRoutes = require('./routes/chart');
const kycRoutes = require('./routes/kyc');
const leaderboardRoutes = require('./routes/leaderboard');

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
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/user', userRoutes);
app.use('/api/deposit', depositRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/trade-history', tradeHistoryRoutes);
app.use('/api/p2p', p2pRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/robots', robotRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/copy', copyTradingRoutes);
app.use('/api/chart', chartRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

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

app.listen(PORT, () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SERVER] Routes loaded:`);
    console.log(`  - /api/auth   (Auth routes)`);
    console.log(`  - /api/trade  (Trade routes)`);
    console.log(`  - /api/user   (User routes)`);
    console.log(`  - /api/deposit (Deposit routes)`);
    console.log(`  - /api/withdraw (Withdraw routes)`);
    
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

module.exports = app;