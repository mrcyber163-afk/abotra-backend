// ============================================================
// SIGNAL ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPut, restPost, restPatch } = require('../firebase');

const SIGNAL_FEE_PERCENT = 0.0001;

// ============================================================
// SAVE SIGNAL
// ============================================================
router.post('/save', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { signal, price, confidence, rsi, macd, movingAverage } = req.body;
        
        if (!signal || !price) {
            return res.status(400).json({ success: false, error: 'Missing signal data' });
        }
        
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const balance = userData.balance || 0;
        const feeAmount = price * SIGNAL_FEE_PERCENT;
        
        if (balance < feeAmount) {
            return res.status(400).json({
                success: false,
                error: `Insufficient balance! Need $${feeAmount.toFixed(4)} for signal fee`
            });
        }
        
        await restPatch(`users/${userId}`, { balance: balance - feeAmount });
        
        const signalId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        const signalData = {
            id: signalId,
            userId: userId,
            signal: signal,
            price: price,
            confidence: confidence || 0,
            rsi: rsi || 0,
            macd: macd || 0,
            movingAverage: movingAverage || 0,
            feeCharged: feeAmount,
            timestamp: Date.now(),
            date: new Date().toISOString()
        };
        
        await restPut(`signals/${userId}/${signalId}`, signalData);
        
        const globalSignalId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        await restPut(`globalSignals/${globalSignalId}`, {
            id: globalSignalId,
            userId: userId,
            signal: signal,
            price: price,
            confidence: confidence || 0,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });
        
        res.json({
            success: true,
            signalId: signalId,
            feeCharged: feeAmount,
            message: `Signal saved. Fee: $${feeAmount.toFixed(4)}`
        });
    } catch (error) {
        console.error('[SIGNAL] Save error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET USER SIGNALS
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const signals = [];
        
        const data = await restGet(`signals/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                signals.push(data[key]);
            });
        }
        
        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ success: true, signals: signals.slice(0, parseInt(limit)) });
    } catch (error) {
        console.error('[SIGNAL] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET LATEST SIGNAL
// ============================================================
router.get('/latest', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const data = await restGet(`signals/${userId}`);
        let latest = null;
        
        if (data) {
            const keys = Object.keys(data).sort((a, b) => (data[b].timestamp || 0) - (data[a].timestamp || 0));
            if (keys.length > 0) {
                latest = data[keys[0]];
            }
        }
        
        res.json({ success: true, signal: latest });
    } catch (error) {
        console.error('[SIGNAL] Latest error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;