// ============================================================
// BOT ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restDelete, restPatch } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token (REST API Version)
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
        const { authGetUser } = require('../firebase');
        const userInfo = await authGetUser(token);
        
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        
        req.user = {
            uid: userInfo.users[0].localId,
            email: userInfo.users[0].email
        };
        next();
    } catch (error) {
        console.error('[BOT] Token verification error:', error);
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
                robots.push({
                    id: key,
                    ...data[key]
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
        const userId = req.user.uid;
        const { robotId, robotName, lockAmount, dailyProfit, durationDays, minTrade } = req.body;

        if (!robotId || !lockAmount || lockAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        // Check user balance
        const userData = await restGet(`users/${userId}`);
        const currentBalance = userData?.balance || 0;

        if (currentBalance < lockAmount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need ${lockAmount}, have ${currentBalance}` 
            });
        }

        // Deduct balance
        await restPatch(`users/${userId}`, {
            balance: currentBalance - lockAmount
        });

        // Update robot
        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        const robotRef = `userRobots/${userId}/${robotId}`;
        const robotData = await restGet(robotRef);

        if (!robotData) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        await restPatch(robotRef, {
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

        // Add notification
        await restPost(`notifications/${userId}`, {
            title: '🚀 Robot Started',
            message: `${robotName} started with ${lockAmount} USDT locked for ${durationDays} days.`,
            type: 'success',
            read: false,
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

        await restPatch(`users/${userId}`, {
            balance: currentBalance - lockAmount
        });

        const endTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        const robotRef = `userRobots/${userId}/${robotId}`;

        await restPatch(robotRef, {
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

        const robotRef = `userRobots/${userId}/${robotId}`;
        const robotData = await restGet(robotRef);
        if (!robotData) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        const newInvested = (robotData.investedAmount || robotData.amount || 0) + amount;

        await restPatch(`users/${userId}`, {
            balance: currentBalance - amount
        });

        await restPatch(robotRef, {
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
        const userId = req.user.uid;
        const { limit = 50 } = req.query;
        const logs = [];

        const data = await restGet(`tradingLogs/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                logs.push({
                    id: key,
                    ...data[key]
                });
            });
        }

        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const limited = logs.slice(0, parseInt(limit));

        res.json({
            success: true,
            logs: limited
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

        await restPut(`tradingLogs/${userId}/${logId}`, logData);

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
        const userId = req.user.uid;

        await restDelete(`tradingLogs/${userId}`);

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
// 9. PROCESS DAILY PROFIT
// ============================================================
router.post('/process-daily', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        // Get all active robots
        const robotsData = await restGet(`userRobots/${userId}`);
        if (!robotsData) {
            return res.json({ success: true, processed: 0 });
        }

        let processed = 0;
        const userData = await restGet(`users/${userId}`) || {};

        for (const [robotId, robot] of Object.entries(robotsData)) {
            if (robot.status !== 'active') continue;

            const now = Date.now();
            const lastProfitTime = robot.lastProfitTime || robot.startTime || now;
            const nextProfitTime = lastProfitTime + (24 * 60 * 60 * 1000);

            if (now >= nextProfitTime) {
                const investedAmount = robot.investedAmount || robot.amount || 0;
                if (investedAmount <= 0) continue;

                const dailyPercent = robot.dailyProfit || 3;
                const grossProfit = (investedAmount * dailyPercent) / 100;
                const hiddenFee = grossProfit * 0.10;
                const netProfit = grossProfit - hiddenFee;

                const profitDays = robot.profitDays || 0;
                const totalDays = robot.durationDays || 30;
                const isLastDay = (profitDays + 1) >= totalDays;

                let finalNetReturn = netProfit;

                if (isLastDay) {
                    const totalReturn = investedAmount + netProfit;
                    const finalFee = totalReturn * 0.10;
                    finalNetReturn = totalReturn - finalFee;

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

                // Add profit to user balance
                const currentBalance = userData.balance || 0;
                await restPatch(`users/${userId}`, {
                    balance: currentBalance + finalNetReturn
                });

                // Update robot stats
                const statsData = await restGet(`robotStats/${userId}/${robotId}`) || {};
                const currentStats = statsData || { profit: 0, trades: 0, wins: 0 };
                await restPut(`robotStats/${userId}/${robotId}`, {
                    profit: (currentStats.profit || 0) + finalNetReturn,
                    trades: (currentStats.trades || 0) + 1,
                    wins: (currentStats.wins || 0) + 1
                });

                processed++;
            }
        }

        res.json({
            success: true,
            processed: processed
        });

    } catch (error) {
        console.error('[BOT] Process daily error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
