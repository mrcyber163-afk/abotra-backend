// functions/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ============================================================
// INIT FIREBASE
// ============================================================
const { initializeFirebase } = require('./firebase');
initializeFirebase();

// ============================================================
// ROUTES - ZILIZOPO TU
// ============================================================
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trade');
const adminRoutes = require('./routes/admin');
const botRoutes = require('./routes/bot');
const signalRoutes = require('./routes/signals');
const tradeHistoryRoutes = require('./routes/trade-history');

// NOTE: user route imeondolewa (haipo kwenye folder yako)

// ============================================================
// SCHEDULER & PRICE STREAM
// ============================================================
const { startScheduler } = require('./scheduler/scheduler');
const { getPriceStream } = require('./streaming/price-stream');

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '2.0.0'
  });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/trade-history', tradeHistoryRoutes);

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
  console.log(`  - /api/auth`);
  console.log(`  - /api/trade`);
  console.log(`  - /api/admin`);
  console.log(`  - /api/bot`);
  console.log(`  - /api/signals`);
  console.log(`  - /api/trade-history`);

  try {
    getPriceStream();
    console.log('[SERVER] ✅ Price stream started');
  } catch (error) {
    console.error('[SERVER] ❌ Price stream failed:', error.message);
  }

  try {
    startScheduler();
    console.log('[SERVER] ✅ Scheduler started');
  } catch (error) {
    console.error('[SERVER] ❌ Scheduler failed:', error.message);
  }
});

process.on('SIGINT', () => {
  console.log('[SERVER] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[SERVER] Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
