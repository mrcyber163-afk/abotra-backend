// ============================================================
// INDEX.JS - SIMPLE WORKING VERSION
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    console.log('[HEALTH] Health check called');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        message: 'Backend is running!',
        version: '2.0.0'
    });
});

// Root
app.get('/', (req, res) => {
    res.json({
        name: 'ABOTRA-PROAI Backend',
        status: 'running',
        version: '2.0.0'
    });
});

// Register test
app.post('/api/auth/register', (req, res) => {
    console.log('[REGISTER] Request:', req.body);
    res.json({
        success: true,
        message: 'Registration successful (test)',
        data: {
            uid: 'test_' + Date.now(),
            email: req.body.email,
            username: req.body.username || 'User'
        }
    });
});

// 404 handler
app.use((req, res) => {
    console.log('[404] Not found:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ✅ Running on port ${PORT}`);
    console.log(`[SERVER] 🔗 Health: http://0.0.0.0:${PORT}/api/health`);
});
