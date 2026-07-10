// ============================================================
// SIGNALS - REST API Version
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, verifyIdToken } = require('../firebase');

const SIGNAL_FEE_PERCENT = 0.0001;

// ============================================================
// MIDDLEWARE: Verify Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await verifyIdToken(token);
        req.user = { uid: userInfo.uid, email: userInfo.email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. SAVE SIGNAL
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
                error: `Insufficient balance! Need $${feeAmount.toFixed(4)} for signal fee`,
                feeRequired: feeAmount
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
            feePercent: SIGNAL_FEE_PERCENT * 100,
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
        
        await restPost(`notifications/${userId}`, {
            title: '📊 AI Signal Generated',
            message: `${signal} signal at $${price.toFixed(2)} with ${confidence}% confidence. Fee: $${feeAmount.toFixed(4)} charged.`,
            type: 'info',
            read: false,
            timestamp: Date.now(),
            link: 'ai-signal.html'
        });
        
        const currentStats = await restGet(`signalStats/${userId}`) || { total: 0, buy: 0, sell: 0, fees: 0 };
        currentStats.total = (currentStats.total || 0) + 1;
        if (signal === 'BUY') currentStats.buy = (currentStats.buy || 0) + 1;
        else if (signal === 'SELL') currentStats.sell = (currentStats.sell || 0) + 1;
        currentStats.fees = (currentStats.fees || 0) + feeAmount;
        await restPut(`signalStats/${userId}`, currentStats);
        
        const platformStats = await restGet('platformStats') || { totalSignalFees: 0, signalsGenerated: 0 };
        platformStats.totalSignalFees = (platformStats.totalSignalFees || 0) + feeAmount;
        platformStats.signalsGenerated = (platformStats.signalsGenerated || 0) + 1;
        await restPut('platformStats', platformStats);
        
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
// 2. GET USER SIGNALS
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
        const stats = await restGet(`signalStats/${userId}`) || { total: 0, buy: 0, sell: 0, fees: 0 };
        
        res.json({
            success: true,
            signals: signals.slice(0, parseInt(limit)),
            stats: stats
        });
        
    } catch (error) {
        console.error('[SIGNAL] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET GLOBAL SIGNALS
// ============================================================
router.get('/global', verifyToken, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const signals = [];
        
        const data = await restGet('globalSignals');
        if (data) {
            Object.keys(data).forEach(key => {
                signals.push({ id: key, ...data[key] });
            });
        }
        
        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ success: true, signals: signals.slice(0, parseInt(limit)) });
        
    } catch (error) {
        console.error('[SIGNAL] Global error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET SIGNAL STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const stats = await restGet(`signalStats/${userId}`) || { total: 0, buy: 0, sell: 0, fees: 0 };
        const total = stats.total || 0;
        const accuracy = total > 0 ? Math.round((stats.buy / total) * 100) : 0;
        
        res.json({
            success: true,
            stats: {
                total: stats.total || 0,
                buy: stats.buy || 0,
                sell: stats.sell || 0,
                fees: stats.fees || 0,
                accuracy: accuracy
            }
        });
        
    } catch (error) {
        console.error('[SIGNAL] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET LATEST SIGNAL
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

// ============================================================
// 6. CHECK BALANCE FOR SIGNAL FEE
// ============================================================
router.get('/balance-check', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            balance: userData.balance || 0,
            feeRequired: 0.01,
            hasEnoughBalance: (userData.balance || 0) >= 0.01
        });
        
    } catch (error) {
        console.error('[SIGNAL] Balance check error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;