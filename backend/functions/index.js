// ============================================================
// INDEX.JS - WITH AUTH
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ============================================================
// FIREBASE HELPERS
// ============================================================
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM';

async function authGetUser(idToken) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`;
        const response = await axios.post(url, { idToken });
        return response.data;
    } catch (error) {
        return null;
    }
}

// ============================================================
// MIDDLEWARE
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await authGetUser(token);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = { uid: userInfo.users[0].localId };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// HEALTH
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// TRADE ROUTES
// ============================================================
app.get('/api/trades/open', verifyToken, (req, res) => {
    res.json({ success: true, trades: [] });
});

app.post('/api/trades/open', verifyToken, (req, res) => {
    res.json({ 
        success: true, 
        message: 'Trade opened!',
        trade: { id: 'test_' + Date.now(), ...req.body, entryPrice: 65000, status: 'open' }
    });
});

app.post('/api/trades/:tradeId/close', verifyToken, (req, res) => {
    res.json({ success: true, message: 'Trade closed!', pnl: 10.50 });
});

app.get('/api/trades/stats', verifyToken, (req, res) => {
    res.json({ success: true, stats: { total: 0, open: 0, closed: 0, winning: 0, losing: 0, winRate: 0, netPnl: 0 } });
});

app.post('/api/trades/add', verifyToken, (req, res) => {
    res.json({ success: true, message: 'Added!', amount: req.body.amount || 10 });
});

app.post('/api/trades/move', verifyToken, (req, res) => {
    res.json({ success: true, message: 'Moved!', amount: 50 });
});

app.get('/api/trades/history', verifyToken, (req, res) => {
    res.json({ success: true, trades: [] });
});

// ============================================================
// 404
// ============================================================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found', path: req.path });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
});
