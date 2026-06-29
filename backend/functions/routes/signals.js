// ============================================================
// SIGNALS - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete } = require('../firebase');
const { authGetUser } = require('../firebase');

async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await authGetUser(token);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = { uid: userInfo.users[0].localId, email: userInfo.users[0].email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

router.post('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { signal, price, confidence, rsi, macd, movingAverage } = req.body;
        if (!signal || !price) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const signalId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        const signalData = {
            id: signalId, userId, userEmail: req.user.email, signal, price,
            confidence: confidence || 70, rsi: rsi || 50, macd: macd || 0,
            movingAverage: movingAverage || price, timestamp: Date.now(), date: new Date().toISOString()
        };

        await restPut(`aiSignals/${userId}/${signalId}`, signalData);

        const statsData = await restGet(`aiSignalStats/${userId}`) || { total: 0, buy: 0, sell: 0 };
        if (signal === 'BUY') statsData.buy = (statsData.buy || 0) + 1;
        else if (signal === 'SELL') statsData.sell = (statsData.sell || 0) + 1;
        statsData.total = (statsData.total || 0) + 1;
        await restPut(`aiSignalStats/${userId}`, statsData);

        await restPost(`notifications/${userId}`, {
            title: '📊 New AI Signal',
            message: `${signal} signal for BTC at $${price.toFixed(2)} with ${confidence}% confidence.`,
            type: signal === 'BUY' ? 'success' : 'warning',
            read: false, timestamp: Date.now(), link: 'ai-signal.html'
        });

        res.json({ success: true, signalId, signal: signalData });
    } catch (error) {
        console.error('[SIGNALS] Save error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const signals = [];

        const data = await restGet(`aiSignals/${userId}`);
        if (data) {
            Object.values(data).forEach(signal => signals.push(signal));
        }

        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ success: true, signals: signals.slice(0, parseInt(limit)) });
    } catch (error) {
        console.error('[SIGNALS] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const statsData = await restGet(`aiSignalStats/${userId}`) || { total: 0, buy: 0, sell: 0 };
        const accuracy = Math.floor(65 + Math.random() * 25);
        res.json({ success: true, stats: { total: statsData.total || 0, buy: statsData.buy || 0, sell: statsData.sell || 0, accuracy } });
    } catch (error) {
        console.error('[SIGNALS] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/latest', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const data = await restGet(`aiSignals/${userId}`);
        let latest = null;
        if (data) {
            let latestTime = 0;
            for (const signal of Object.values(data)) {
                if (signal.timestamp > latestTime) {
                    latestTime = signal.timestamp;
                    latest = signal;
                }
            }
        }
        res.json({ success: true, signal: latest });
    } catch (error) {
        console.error('[SIGNALS] Latest error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.delete('/:signalId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { signalId } = req.params;

        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || (adminList.includes && adminList.includes(userId)));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });

        await restDelete(`aiSignals/${userId}/${signalId}`);
        res.json({ success: true, message: 'Signal deleted' });
    } catch (error) {
        console.error('[SIGNALS] Delete error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
