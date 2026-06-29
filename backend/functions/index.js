// ============================================================
// INDEX.JS - MINIMAL VERSION
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ============================================================
// HEALTH CHECK - MUST WORK
// ============================================================
app.get('/api/health', (req, res) => {
    console.log('[HEALTH] ✅ Health check');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Backend is running!'
    });
});

// ============================================================
// SIMPLE TRADE ROUTES - DIRECT IMPLEMENTATION
// ============================================================

// GET open trades
app.get('/api/trades/open', (req, res) => {
    console.log('[TRADES] GET /open');
    res.json({ success: true, trades: [] });
});

// POST open trade
app.post('/api/trades/open', (req, res) => {
    console.log('[TRADES] POST /open', req.body);
    res.json({ 
        success: true, 
        message: 'Trade opened!',
        trade: { 
            id: 'test_' + Date.now(), 
            ...req.body,
            entryPrice: 65000,
            status: 'open',
            openTime: Date.now()
        }
    });
});

// POST close trade
app.post('/api/trades/:tradeId/close', (req, res) => {
    console.log('[TRADES] POST /close', req.params.tradeId);
    res.json({ 
        success: true, 
        message: 'Trade closed!',
        pnl: 10.50,
        newBalance: 100.50
    });
});

// GET stats
app.get('/api/trades/stats', (req, res) => {
    console.log('[TRADES] GET /stats');
    res.json({ 
        success: true, 
        stats: { 
            total: 0, 
            open: 0, 
            closed: 0, 
            winning: 0, 
            losing: 0, 
            winRate: 0, 
            netPnl: 0 
        }
    });
});

// POST add
app.post('/api/trades/add', (req, res) => {
    console.log('[TRADES] POST /add', req.body);
    res.json({ 
        success: true, 
        message: 'Added to trading balance!',
        amount: req.body.amount || 10,
        newTradingBalance: 100
    });
});

// POST move
app.post('/api/trades/move', (req, res) => {
    console.log('[TRADES] POST /move');
    res.json({ 
        success: true, 
        message: 'Moved to main balance!',
        amount: 50,
        newMainBalance: 150
    });
});

// GET history
app.get('/api/trades/history', (req, res) => {
    console.log('[TRADES] GET /history');
    res.json({ success: true, trades: [] });
});

// ============================================================
// 404
// ============================================================
app.use((req, res) => {
    console.log('[404] Not found:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
    });
});

// ============================================================
// START
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
    console.log(`[SERVER] 🔗 Health: http://0.0.0.0:${PORT}/api/health`);
});
