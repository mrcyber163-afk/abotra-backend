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
// HELPER: Format Price
// ============================================================
function formatPrice(amount) {
    return amount.toFixed(2);
}

// ============================================================
// 1. GET USER ROBOTS
// ============================================================
router.get('/robots', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const robots = [];

        const snapshot = await db.ref(`userRobots/${userId}`).once('value');
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                robots.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        res.json({
            success: true,
            robots: robots
        });

    } catch (error) {
        console.error('[BOT] Get robots error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. START ROBOT
// ============================================================
router.post('/start', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { robotId, robotName, lockAmount, dailyProfit, durationDays, minTrade } = req.body;

        if (!robotId || !lockAmount || lockAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};
        const currentBalance = userData.balance || 0;

        if (currentBalance < lockAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${lockAmount}, have ${currentBalance}` 
            });
        }

        await userRef.update({
            balance: currentBalance - lockAmount
        });

        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        const robotRef = db.ref(`userRobots/${userId}/${robotId}`);
        const robotSnap = await robotRef.once('value');

        if (!robotSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        await robotRef.update({
            status: 'active',
            startTime: Date.now(),
            endTime: endTime,
            lastProfitTime: Date.now(),
            profitDays: 0,
            investedAmount: lockAmount,
            originalAmount: lockAmount,
            minTrade: minTrade || 3,
            durationDays: durationDays || 30,
            tradePercent: 100
        });

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '🚀 Robot Started',
            message: `${robotName} started with ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        // ✅ Add log
        const logRef = db.ref(`tradingLogs/${userId}`).push();
        await logRef.set({
            id: logRef.key,
            robot: robotName,
            message: `🚀 Robot STARTED - ${lockAmount} USDT locked for ${durationDays} days. Daily profit: ${dailyProfit}%`,
            type: 'info',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Robot started successfully'
        });

    } catch (error) {
        console.error('[BOT] Start robot error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. RESTART ROBOT
// ============================================================
router.post('/restart', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { robotId, robotName, lockAmount, dailyProfit, durationDays, minTrade } = req.body;

        if (!robotId || !lockAmount || lockAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};
        const currentBalance = userData.balance || 0;

        if (currentBalance < lockAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${lockAmount}, have ${currentBalance}` 
            });
        }

        await userRef.update({
            balance: currentBalance - lockAmount
        });

        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        const robotRef = db.ref(`userRobots/${userId}/${robotId}`);

        await robotRef.update({
            status: 'active',
            startTime: Date.now(),
            endTime: endTime,
            lastProfitTime: Date.now(),
            profitDays: 0,
            investedAmount: lockAmount,
            originalAmount: lockAmount,
            minTrade: minTrade || 3,
            durationDays: durationDays || 30,
            tradePercent: 100,
            completedAt: null
        });

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '🔄 Robot Restarted',
            message: `${robotName} restarted with ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        // ✅ Add log
        const logRef = db.ref(`tradingLogs/${userId}`).push();
        await logRef.set({
            id: logRef.key,
            robot: robotName,
            message: `🔄 Robot RESTARTED - ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'info',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Robot restarted successfully'
        });

    } catch (error) {
        console.error('[BOT] Restart robot error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. ADD CAPITAL TO ROBOT
// ============================================================
router.post('/add-capital/:robotId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { robotId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};
        const currentBalance = userData.balance || 0;

        if (currentBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${amount}, have ${currentBalance}` 
            });
        }

        const robotRef = db.ref(`userRobots/${userId}/${robotId}`);
        const robotSnap = await robotRef.once('value');
        if (!robotSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        const robot = robotSnap.val();
        const newInvested = (robot.investedAmount || robot.amount || 0) + amount;

        await userRef.update({
            balance: currentBalance - amount
        });

        await robotRef.update({
            investedAmount: newInvested,
            amount: newInvested
        });

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '💰 Capital Added',
            message: `Added ${amount} USDT to ${robot.name || 'Robot'}. New total: ${newInvested} USDT`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        // ✅ Add log
        const logRef = db.ref(`tradingLogs/${userId}`).push();
        await logRef.set({
            id: logRef.key,
            robot: robot.name || 'Robot',
            message: `💰 CAPITAL ADDED: +${formatPrice(amount)} USDT. New total: ${formatPrice(newInvested)} USDT`,
            type: 'profit',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Capital added successfully',
            newInvested: newInvested
        });

    } catch (error) {
        console.error('[BOT] Add capital error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET BOT STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const stats = {};

        const snapshot = await db.ref(`robotStats/${userId}`).once('value');
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                stats[child.key] = child.val();
            });
        }

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[BOT] Get stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET TRADING LOGS
// ============================================================
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const logs = [];

        const snapshot = await db.ref(`tradingLogs/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(parseInt(limit))
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                logs.push(child.val());
            });
        }

        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            logs: logs
        });

    } catch (error) {
        console.error('[BOT] Get logs error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. ADD TRADING LOG
// ============================================================
router.post('/logs', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { robot, message, type, time, timestamp } = req.body;

        if (!robot || !message) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        const logId = Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        const logData = {
            id: logId,
            robot: robot,
            message: message,
            type: type || 'info',
            time: time || new Date().toLocaleTimeString(),
            timestamp: timestamp || Date.now()
        };

        await db.ref(`tradingLogs/${userId}/${logId}`).set(logData);

        // Keep only last 200 logs
        const snapshot = await db.ref(`tradingLogs/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(200)
            .once('value');

        if (snapshot.exists()) {
            const toRemove = [];
            snapshot.forEach(child => {
                toRemove.push(child.key);
            });
            if (toRemove.length > 150) {
                const remove = toRemove.slice(0, toRemove.length - 150);
                for (const key of remove) {
                    await db.ref(`tradingLogs/${userId}/${key}`).remove();
                }
            }
        }

        res.json({
            success: true,
            logId: logId
        });

    } catch (error) {
        console.error('[BOT] Add log error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. CLEAR TRADING LOGS
// ============================================================
router.delete('/logs/clear', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        await db.ref(`tradingLogs/${userId}`).remove();

        res.json({
            success: true,
            message: 'Logs cleared successfully'
        });

    } catch (error) {
        console.error('[BOT] Clear logs error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. PROCESS DAILY PROFIT - FIXED ✅
// ============================================================
router.post('/process-daily', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // ✅ Get all active robots
        const snapshot = await db.ref(`userRobots/${userId}`).once('value');
        
        if (!snapshot.exists()) {
            return res.json({ success: true, processed: 0 });
        }

        let processed = 0;
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};

        const promises = [];
        snapshot.forEach(child => {
            const robot = child.val();
            if (robot.status === 'active') {
                promises.push(processRobotProfit(child, userRef, userId, db));
            }
        });

        // ✅ Wait for all promises and count successful ones
        const results = await Promise.all(promises);
        processed = results.filter(r => r === true).length;

        res.json({
            success: true,
            processed: processed
        });

    } catch (error) {
        console.error('[BOT] Process daily error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// ✅ HELPER: Process a single robot's profit - FIXED
// ============================================================
async function processRobotProfit(child, userRef, userId, db) {
    try {
        const robot = child.val();
        const robotId = child.key;
        const now = Date.now();

        // Check if 24 hours passed since last profit
        const lastProfitTime = robot.lastProfitTime || robot.startTime || now;
        const nextProfitTime = lastProfitTime + (24 * 60 * 60 * 1000);

        if (now < nextProfitTime) return false;

        const investedAmount = robot.investedAmount || robot.amount || 0;
        if (investedAmount <= 0) return false;

        const dailyPercent = robot.dailyProfit || 3;
        const grossProfit = (investedAmount * dailyPercent) / 100;
        const hiddenFee = grossProfit * 0.10;
        const netProfit = grossProfit - hiddenFee;

        const profitDays = robot.profitDays || 0;
        const totalDays = robot.durationDays || 30;
        const isLastDay = (profitDays + 1) >= totalDays;

        let finalNetReturn = netProfit;
        let isCompleted = false;

        if (isLastDay) {
            const totalReturn = investedAmount + netProfit;
            const finalFee = totalReturn * 0.10;
            finalNetReturn = totalReturn - finalFee;
            isCompleted = true;
        }

        // ✅ Update robot
        const robotRef = db.ref(`userRobots/${userId}/${robotId}`);
        
        if (isCompleted) {
            await robotRef.update({
                status: 'completed',
                completedAt: now,
                investedAmount: 0,
                amount: 0
            });
        } else {
            await robotRef.update({
                lastProfitTime: now,
                lastProfitAmount: netProfit,
                profitDays: profitDays + 1
            });
        }

        // ✅ Update user balance with transaction
        await userRef.transaction((current) => {
            if (current) {
                current.balance = (current.balance || 0) + finalNetReturn;
            }
            return current;
        });

        // ✅ Update robot stats
        const statsRef = db.ref(`robotStats/${userId}/${robotId}`);
        await statsRef.transaction((current) => {
            if (!current) current = { profit: 0, trades: 0, wins: 0 };
            current.profit += finalNetReturn;
            current.trades += 1;
            current.wins += 1;
            return current;
        });

        // ✅ Add log
        const logRef = db.ref(`tradingLogs/${userId}`).push();
        await logRef.set({
            id: logRef.key,
            robot: robot.name || 'Robot',
            message: `💰 Daily profit: +${formatPrice(finalNetReturn)} USDT (${dailyPercent}%)`,
            type: 'profit',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        return true;

    } catch (error) {
        console.error('[BOT] Process robot profit error:', error);
        return false;
    }
}

module.exports = router;