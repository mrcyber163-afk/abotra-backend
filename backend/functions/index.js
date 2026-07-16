// ============================================================
// ABOTRA-PROAI BACKEND - MAIN ENTRY POINT
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// ============================================================
// IMPORT ALL ROUTES
// ============================================================
const authRoutes = require('./routes/auth');
const robotRoutes = require('./routes/robot');
const brokerRoutes = require('./routes/broker');
const tradeRoutes = require('./routes/trade');
const adminRoutes = require('./routes/admin');
const botRoutes = require('./routes/bot');
const signalRoutes = require('./routes/signals');
const tradeHistoryRoutes = require('./routes/trade-history');
const userRoutes = require('./routes/user');

// ============================================================
// IMPORT SERVICES
// ============================================================
const robotScheduler = require('./scheduler/robot-scheduler');

const app = express();
const PORT = process.env.PORT || 5001;

// ============================================================
// CORS CONFIGURATION
// ============================================================
const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'https://abotraproai.surge.sh',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// REQUEST LOGGING
// ============================================================
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        domain: process.env.CORS_ORIGIN || 'https://abotraproai.surge.sh',
        routes: {
            auth: '/api/auth',
            robot: '/api/robot',
            broker: '/api/broker',
            trade: '/api/trade',
            admin: '/api/admin',
            bot: '/api/bot',
            signals: '/api/signals',
            tradeHistory: '/api/trade-history',
            user: '/api/user'
        }
    });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/robot', robotRoutes);
app.use('/api/broker', brokerRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/trade-history', tradeHistoryRoutes);
app.use('/api/user', userRoutes);

// Also add without /api for compatibility
app.use('/robot', robotRoutes);
app.use('/broker', brokerRoutes);

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
app.listen(PORT, () => {
    console.log('========================================');
    console.log('🤖 ABOTRA-PROAI Backend');
    console.log('========================================');
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN || 'https://abotraproai.surge.sh'}`);
    console.log('========================================');
    console.log('📋 Available Routes:');
    console.log('   POST   /api/auth/login');
    console.log('   POST   /api/auth/register');
    console.log('   POST   /api/auth/verify');
    console.log('   GET    /api/robot/my-robot');
    console.log('   GET    /api/robot/status');
    console.log('   GET    /api/robot/plans');
    console.log('   GET    /api/robot/trades');
    console.log('   GET    /api/robot/performance');
    console.log('   POST   /api/robot/create-trial');
    console.log('   POST   /api/robot/upgrade');
    console.log('   POST   /api/robot/pause');
    console.log('   POST   /api/robot/activate');
    console.log('   GET    /api/robot/check-expiry');
    console.log('   GET    /api/robot/subscription');
    console.log('   POST   /api/broker/test');
    console.log('   POST   /api/broker/connect');
    console.log('   GET    /api/broker/status');
    console.log('   POST   /api/broker/disconnect');
    console.log('   GET    /api/trade/open');
    console.log('   GET    /api/trade/history');
    console.log('   GET    /api/trades/open');
    console.log('   GET    /api/trades/history');
    console.log('   GET    /api/admin/users');
    console.log('   GET    /api/admin/stats');
    console.log('   GET    /api/bot/status');
    console.log('   POST   /api/bot/start');
    console.log('   POST   /api/bot/stop');
    console.log('   GET    /api/signals/latest');
    console.log('   GET    /api/signals/history');
    console.log('   GET    /api/trade-history/all');
    console.log('   GET    /api/user/profile');
    console.log('   PUT    /api/user/profile');
    console.log('========================================');
});

// ============================================================
// START SCHEDULER
// ============================================================
try {
    robotScheduler.start();
    console.log('✅ Robot scheduler started');
} catch (error) {
    console.error('❌ Robot scheduler failed:', error.message);
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGINT', () => {
    console.log('🛑 Shutting down...');
    robotScheduler.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down...');
    robotScheduler.stop();
    process.exit(0);
});

module.exports = app;