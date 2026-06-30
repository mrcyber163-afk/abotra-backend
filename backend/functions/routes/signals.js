// functions/routes/signals.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

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
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// SIGNAL FEE (0.01%)
// ============================================================
const SIGNAL_FEE_PERCENT = 0.0001; // 0.01%

// ============================================================
// 1. SAVE SIGNAL - With Fee Deduction
// ============================================================
router.post('/save', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { signal, price, confidence, rsi, macd, movingAverage } = req.body;

        if (!signal || !price) {
            return res.status(400).json({ success: false, error: 'Missing signal data' });
        }

        // ✅ Check if user has enough balance for fee
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = userSnap.val();
        const balance = userData.balance || 0;
        const feeAmount = price * SIGNAL_FEE_PERCENT;

        if (balance < feeAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance! Need $${feeAmount.toFixed(4)} for signal fee`,
                feeRequired: feeAmount
            });
        }

        // ✅ Deduct fee from balance
        await userRef.update({
            balance: balance - feeAmount
        });

        // ✅ Save signal to Firebase
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

        await db.ref(`signals/${userId}/${signalId}`).set(signalData);

        // ✅ Add to global signals for others to see
        const globalSignalRef = db.ref('globalSignals').push();
        await globalSignalRef.set({
            id: globalSignalRef.key,
            userId: userId,
            signal: signal,
            price: price,
            confidence: confidence || 0,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });

        // ✅ Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '📊 AI Signal Generated',
            message: `${signal} signal at $${price.toFixed(2)} with ${confidence}% confidence. Fee: $${feeAmount.toFixed(4)} charged.`,
            type: 'info',
            read: false,
            timestamp: Date.now(),
            link: 'ai-signal.html'
        });

        // ✅ Update signal stats
        const statsRef = db.ref(`signalStats/${userId}`);
        await statsRef.transaction((current) => {
            if (!current) current = { total: 0, buy: 0, sell: 0, fees: 0 };
            current.total = (current.total || 0) + 1;
            if (signal === 'BUY') current.buy = (current.buy || 0) + 1;
            else if (signal === 'SELL') current.sell = (current.sell || 0) + 1;
            current.fees = (current.fees || 0) + feeAmount;
            return current;
        });

        // ✅ Update platform stats
        const platformRef = db.ref('platformStats');
        await platformRef.transaction((current) => {
            if (!current) current = { totalSignalFees: 0, signalsGenerated: 0 };
            current.totalSignalFees = (current.totalSignalFees || 0) + feeAmount;
            current.signalsGenerated = (current.signalsGenerated || 0) + 1;
            return current;
        });

        console.log(`[SIGNAL] ${signal} saved for ${userId} at $${price} (fee: $${feeAmount.toFixed(4)})`);

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
        const db = getDB();
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const signals = [];

        const snapshot = await db.ref(`signals/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(parseInt(limit))
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                signals.push(child.val());
            });
        }

        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Get stats
        const statsSnap = await db.ref(`signalStats/${userId}`).once('value');
        const stats = statsSnap.exists() ? statsSnap.val() : { total: 0, buy: 0, sell: 0, fees: 0 };

        res.json({
            success: true,
            signals: signals,
            stats: stats
        });

    } catch (error) {
        console.error('[SIGNAL] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET GLOBAL SIGNALS (Real-time)
// ============================================================
router.get('/global', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { limit = 20 } = req.query;
        const signals = [];

        const snapshot = await db.ref('globalSignals')
            .orderByChild('timestamp')
            .limitToLast(parseInt(limit))
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                signals.push({ id: child.key, ...child.val() });
            });
        }

        signals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            signals: signals
        });

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
        const db = getDB();
        const userId = req.user.uid;

        const statsSnap = await db.ref(`signalStats/${userId}`).once('value');
        const stats = statsSnap.exists() ? statsSnap.val() : { total: 0, buy: 0, sell: 0, fees: 0 };

        // Calculate accuracy (simplified)
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
        const db = getDB();
        const userId = req.user.uid;

        const snapshot = await db.ref(`signals/${userId}`)
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
        console.error('[SIGNAL] Latest error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. CHECK BALANCE FOR SIGNAL FEE
// ============================================================
router.get('/balance-check', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = userSnap.val();
        const balance = userData.balance || 0;
        const feeRequired = 0.01; // Minimum fee (0.01% of $100)

        res.json({
            success: true,
            balance: balance,
            feeRequired: feeRequired,
            hasEnoughBalance: balance >= feeRequired
        });

    } catch (error) {
        console.error('[SIGNAL] Balance check error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;