// ============================================================
// BOT ROUTES - REST API Version
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete, verifyIdToken } = require('../firebase');

function formatPrice(amount) {
    return amount.toFixed(2);
}

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
// 1. GET USER ROBOTS
// ============================================================
router.get('/robots', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const robots = [];

        const data = await restGet(`userRobots/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                robots.push({ id: key, ...data[key] });
            });
        }

        res.json({ success: true, robots });
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
        const userId = req.user.uid;
        const { robotId, robotName, lockAmount, dailyProfit, durationDays, minTrade } = req.body;

        if (!robotId || !lockAmount || lockAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const userData = await restGet(`users/${userId}`);
        const currentBalance = userData?.balance || 0;

        if (currentBalance < lockAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${lockAmount}, have ${currentBalance}` 
            });
        }

        await restPatch(`users/${userId}`, { balance: currentBalance - lockAmount });

        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        await restPatch(`userRobots/${userId}/${robotId}`, {
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

        await restPost(`notifications/${userId}`, {
            title: '🚀 Robot Started',
            message: `${robotName} started with ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        await restPost(`tradingLogs/${userId}`, {
            robot: robotName,
            message: `🚀 Robot STARTED - ${lockAmount} USDT locked for ${durationDays} days. Daily profit: ${dailyProfit}%`,
            type: 'info',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Robot started successfully' });

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
        const userId = req.user.uid;
        const { robotId, robotName, lockAmount, dailyProfit, durationDays, minTrade } = req.body;

        if (!robotId || !lockAmount || lockAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        const userData = await restGet(`users/${userId}`);
        const currentBalance = userData?.balance || 0;

        if (currentBalance < lockAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${lockAmount}, have ${currentBalance}` 
            });
        }

        await restPatch(`users/${userId}`, { balance: currentBalance - lockAmount });

        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        await restPatch(`userRobots/${userId}/${robotId}`, {
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

        await restPost(`notifications/${userId}`, {
            title: '🔄 Robot Restarted',
            message: `${robotName} restarted with ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        await restPost(`tradingLogs/${userId}`, {
            robot: robotName,
            message: `🔄 Robot RESTARTED - ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'info',
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        });

        res.json({ success: true, message: 'Robot restarted successfully' });

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
        const userId = req.user.uid;
        const { robotId } = req.params;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userData = await restGet(`users/${userId}`);
        const currentBalance = userData?.balance || 0;

        if (currentBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${amount}, have ${currentBalance}` 
            });
        }

        const robotData = await restGet(`userRobots/${userId}/${robotId}`);
        if (!robotData) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        const newInvested = (robotData.investedAmount || robotData.amount || 0) + amount;

        await restPatch(`users/${userId}`, { balance: currentBalance - amount });
        await restPatch(`userRobots/${userId}/${robotId}`, {
            investedAmount: newInvested,
            amount: newInvested
        });

        await restPost(`notifications/${userId}`, {
            title: '💰 Capital Added',
            message: `Added ${amount} USDT to ${robotData.name || 'Robot'}. New total: ${newInvested} USDT`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        await restPost(`tradingLogs/${userId}`, {
            robot: robotData.name || 'Robot',
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
        const userId = req.user.uid;
        const stats = {};
        const data = await restGet(`robotStats/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                stats[key] = data[key];
            });
        }
        res.json({ success: true, stats });
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
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const logs = [];

        const data = await restGet(`tradingLogs/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                logs.push(data[key]);
            });
        }

        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ success: true, logs: logs.slice(0, parseInt(limit)) });

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
        const userId = req.user.uid;
        const { robot, message, type, time, timestamp } = req.body;

        if (!robot || !message) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        const logId = Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        await restPut(`tradingLogs/${userId}/${logId}`, {
            id: logId,
            robot: robot,
            message: message,
            type: type || 'info',
            time: time || new Date().toLocaleTimeString(),
            timestamp: timestamp || Date.now()
        });

        // Clean up old logs (keep last 150)
        const data = await restGet(`tradingLogs/${userId}`);
        if (data) {
            const keys = Object.keys(data).sort((a, b) => (data[b].timestamp || 0) - (data[a].timestamp || 0));
            if (keys.length > 150) {
                const toRemove = keys.slice(150);
                for (const key of toRemove) {
                    await restDelete(`tradingLogs/${userId}/${key}`);
                }
            }
        }

        res.json({ success: true, logId: logId });

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
        const userId = req.user.uid;
        await restDelete(`tradingLogs/${userId}`);
        res.json({ success: true, message: 'Logs cleared successfully' });
    } catch (error) {
        console.error('[BOT] Clear logs error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. PROCESS DAILY PROFIT
// ============================================================
router.post('/process-daily', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const data = await restGet(`userRobots/${userId}`);
        
        if (!data) {
            return res.json({ success: true, processed: 0 });
        }

        let processed = 0;
        const userData = await restGet(`users/${userId}`) || {};

        for (const [key, robot] of Object.entries(data)) {
            if (robot.status === 'active') {
                const result = await processRobotProfit(key, robot, userId, userData);
                if (result) processed++;
            }
        }

        res.json({ success: true, processed });
    } catch (error) {
        console.error('[BOT] Process daily error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// HELPER: Process Robot Profit
// ============================================================
async function processRobotProfit(robotId, robot, userId, userData) {
    try {
        const now = Date.now();
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

        if (isCompleted) {
            await restPatch(`userRobots/${userId}/${robotId}`, {
                status: 'completed',
                completedAt: now,
                investedAmount: 0,
                amount: 0
            });
        } else {
            await restPatch(`userRobots/${userId}/${robotId}`, {
                lastProfitTime: now,
                lastProfitAmount: netProfit,
                profitDays: profitDays + 1
            });
        }

        const currentBalance = userData.balance || 0;
        await restPatch(`users/${userId}`, { balance: currentBalance + finalNetReturn });

        const currentStats = await restGet(`robotStats/${userId}/${robotId}`) || { profit: 0, trades: 0, wins: 0 };
        currentStats.profit += finalNetReturn;
        currentStats.trades += 1;
        currentStats.wins += 1;
        await restPut(`robotStats/${userId}/${robotId}`, currentStats);

        await restPost(`tradingLogs/${userId}`, {
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