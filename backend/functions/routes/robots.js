// ============================================================
// ROBOTS - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete } = require('../firebase');
const { authGetUser } = require('../firebase');

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
        req.user = { uid: userInfo.users[0].localId, email: userInfo.users[0].email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

router.get('/', verifyToken, async (req, res) => {
    try {
        const robots = [];
        const data = await restGet('robots_list');
        if (data) {
            Object.keys(data).forEach(key => {
                robots.push({ id: parseInt(key), ...data[key] });
            });
        }
        robots.sort((a, b) => a.id - b.id);
        res.json({ success: true, robots });
    } catch (error) {
        console.error('[ROBOTS] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/my-robots', verifyToken, async (req, res) => {
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
        console.error('[ROBOTS] Get my robots error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/purchase', verifyToken, async (req, res) => {
    try {
        const { robotId } = req.body;
        const userId = req.user.uid;
        if (robotId === undefined || robotId === null) {
            return res.status(400).json({ success: false, error: 'Robot ID required' });
        }

        const robotData = await restGet(`robots_list/${robotId}`);
        if (!robotData) return res.status(404).json({ success: false, error: 'Robot not found' });

        const existingRobot = await restGet(`userRobots/${userId}/${robotId}`);
        if (existingRobot) return res.status(400).json({ success: false, error: 'You already own this robot' });

        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });

        const userBalance = userData.balance || 0;
        if (userBalance < robotData.price) {
            return res.status(400).json({ success: false, error: `Insufficient balance. Need $${robotData.price}, have $${userBalance}` });
        }

        const investedAmount = robotData.price / 2;
        await restPatch(`users/${userId}`, { balance: userBalance - robotData.price });

        const newRobotData = {
            robotId: robotId, name: robotData.name, level: robotData.level,
            dailyProfit: robotData.dailyProfit, price: robotData.price,
            minTrade: robotData.minTrade || 3, purchasedAt: Date.now(),
            date: new Date().toISOString(), status: 'active',
            startTime: Date.now(), endTime: Date.now() + (30 * 24 * 60 * 60 * 1000),
            lastProfitTime: Date.now(), profitDays: 0, durationDays: 30,
            tradePercent: 100, investedAmount, amount: investedAmount, originalAmount: investedAmount
        };

        await restPut(`userRobots/${userId}/${robotId}`, newRobotData);

        await restPost(`notifications/${userId}`, {
            title: '🤖 Robot Purchased!',
            message: `You purchased ${robotData.name}! $${investedAmount.toFixed(2)} invested for trading.`,
            type: 'success', read: false, timestamp: Date.now()
        });

        res.json({ success: true, message: 'Robot purchased successfully!', robot: newRobotData });
    } catch (error) {
        console.error('[ROBOTS] Purchase error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/:robotId', verifyToken, async (req, res) => {
    try {
        const { robotId } = req.params;
        const robotData = await restGet(`robots_list/${robotId}`);
        if (!robotData) return res.status(404).json({ success: false, error: 'Robot not found' });
        res.json({ success: true, robot: { id: parseInt(robotId), ...robotData } });
    } catch (error) {
        console.error('[ROBOTS] Get robot error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/:robotId', verifyToken, async (req, res) => {
    try {
        const { robotId } = req.params;
        const userId = req.user.uid;
        const { name, price, dailyProfit, description, minTrade, hot } = req.body;

        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || (adminList.includes && adminList.includes(userId)));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });

        const robotData = await restGet(`robots_list/${robotId}`);
        if (!robotData) return res.status(404).json({ success: false, error: 'Robot not found' });

        const updates = {};
        if (name) updates.name = name;
        if (price) updates.price = price;
        if (dailyProfit) updates.dailyProfit = dailyProfit;
        if (description) updates.description = description;
        if (minTrade) updates.minTrade = minTrade;
        if (hot !== undefined) updates.hot = hot;
        updates.updatedAt = Date.now();

        await restPatch(`robots_list/${robotId}`, updates);
        res.json({ success: true, message: 'Robot updated successfully', updates });
    } catch (error) {
        console.error('[ROBOTS] Update error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
