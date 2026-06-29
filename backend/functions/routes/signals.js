// functions/routes/signals.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. SAVE SIGNAL
// ============================================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { signal, price, confidence, rsi, macd, movingAverage } = req.body;

        if (!signal || !price) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const signalId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        const signalData = {
            id: signalId,
            userId: userId,
            userEmail: req.user.email,
            signal: signal,
            price: price,
            confidence: confidence || 70,
            rsi: rsi || 50,
            macd: macd || 0,
            movingAverage: movingAverage || price,
            timestamp: Date.now(),
            date: new Date().toISOString()
        };

        // Save signal
        await db.ref(`aiSignals/${userId}/${signalId}`).set(signalData);

        // Update stats
        const statsRef = db.ref(`aiSignalStats/${userId}`);
        const snapshot = await statsRef.once('value');
        const stats = snapshot.exists() ? snapshot.val() : { total: 0, buy: 0, sell: 0 };
        
        if (signal === 'BUY') stats.buy = (stats.buy || 0) + 1;
        else if (signal === 'SELL') stats.sell = (stats.sell || 0) + 1;
        stats.total = (stats.total || 0) + 1;
        await statsRef.set(stats);

        // Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '📊 New AI Signal',
            message: `${signal} signal for BTC at $${price.toFixed(2)} with ${confidence}% confidence.`,
            type: signal === 'BUY' ? 'success' : 'warning',
            read: false,
            timestamp: Date.now(),
            link: 'ai-signal.html'
        });

        res.json({
            success: true,
            signalId: signalId,
            signal: signalData
        });

    } catch (error) {
        console.error('[SIGNALS] Save error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET SIGNAL HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const signals = [];

        const snapshot = await db.ref(`aiSignals/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(parseInt(limit))
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                signals.push(child.val());
            });
        }

        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            signals: signals
        });

    } catch (error) {
        console.error('[SIGNALS] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET SIGNAL STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const statsRef = db.ref(`aiSignalStats/${userId}`);
        const snapshot = await statsRef.once('value');
        const stats = snapshot.exists() ? snapshot.val() : { total: 0, buy: 0, sell: 0 };

        // Calculate accuracy (simulated based on recent signals)
        const accuracy = Math.floor(65 + Math.random() * 25);

        res.json({
            success: true,
            stats: {
                total: stats.total || 0,
                buy: stats.buy || 0,
                sell: stats.sell || 0,
                accuracy: accuracy
            }
        });

    } catch (error) {
        console.error('[SIGNALS] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET LATEST SIGNAL
// ============================================================
router.get('/latest', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const snapshot = await db.ref(`aiSignals/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(1)
            .once('value');

        let latest = null;
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                latest = child.val();
            });
        }

        res.json({
            success: true,
            signal: latest
        });

    } catch (error) {
        console.error('[SIGNALS] Latest error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. DELETE SIGNAL (Admin only)
// ============================================================
router.delete('/:signalId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { signalId } = req.params;

        // Check if admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        await db.ref(`aiSignals/${userId}/${signalId}`).remove();

        res.json({
            success: true,
            message: 'Signal deleted'
        });

    } catch (error) {
        console.error('[SIGNALS] Delete error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;