// backend/functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

// Initialize Firebase Admin
admin.initializeApp();

// Import routes
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trade');
const adminRoutes = require('./routes/admin');
const botRoutes = require('./routes/bot');
const signalRoutes = require('./routes/signals');
const tradeHistoryRoutes = require('./routes/trade-history');
const robotRoutes = require('./routes/robot');

// Import services
const { startScheduler } = require('./scheduler/scheduler');
const { getPriceStream } = require('./streaming/price-stream');
const robotScheduler = require('./scheduler/robot-scheduler');

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/trade-history', tradeHistoryRoutes);
app.use('/api/robot', robotRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.url} not found`
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.stack);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// Export as Firebase Cloud Function
exports.api = functions.https.onRequest(app);

// Start services (for local development)
if (process.env.NODE_ENV !== 'production') {
    try {
        getPriceStream();
        console.log('[DEV] ✅ Price stream started');
    } catch (error) {
        console.error('[DEV] ❌ Price stream failed:', error.message);
    }
    
    try {
        startScheduler();
        console.log('[DEV] ✅ Scheduler started');
    } catch (error) {
        console.error('[DEV] ❌ Scheduler failed:', error.message);
    }
    
    try {
        robotScheduler.start();
        console.log('[DEV] ✅ Robot scheduler started');
    } catch (error) {
        console.error('[DEV] ❌ Robot scheduler failed:', error.message);
    }
}

console.log('[Functions] ✅ ABOTRA-PROAI Cloud Functions loaded');
module.exports = { api };