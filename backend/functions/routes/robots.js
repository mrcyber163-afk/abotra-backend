// functions/routes/robots.js
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
// 1. GET ALL ROBOTS
// ============================================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const robots = [];

        const snapshot = await db.ref('robots_list').once('value');
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                robots.push({
                    id: parseInt(child.key),
                    ...child.val()
                });
            });
        }

        // Sort by id
        robots.sort((a, b) => a.id - b.id);

        res.json({
            success: true,
            robots: robots
        });

    } catch (error) {
        console.error('[ROBOTS] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET USER'S PURCHASED ROBOTS
// ============================================================
router.get('/my-robots', verifyToken, async (req, res) => {
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
        console.error('[ROBOTS] Get my robots error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. PURCHASE ROBOT
// ============================================================
router.post('/purchase', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { robotId } = req.body;
        const userId = req.user.uid;

        if (robotId === undefined || robotId === null) {
            return res.status(400).json({ success: false, error: 'Robot ID required' });
        }

        // Get robot data
        const robotSnap = await db.ref(`robots_list/${robotId}`).once('value');
        if (!robotSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }
        const robot = robotSnap.val();

        // Check if user already owns this robot
        const userRobotSnap = await db.ref(`userRobots/${userId}/${robotId}`).once('value');
        if (userRobotSnap.exists()) {
            return res.status(400).json({ success: false, error: 'You already own this robot' });
        }

        // Get user data
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        const userData = userSnap.val();
        const userBalance = userData.balance || 0;

        // Check if user has enough balance
        if (userBalance < robot.price) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need $${robot.price}, have $${userBalance}` 
            });
        }

        // Calculate invested amount (50% of price)
        const investedAmount = robot.price / 2;

        // Update user balance
        await userRef.update({
            balance: userBalance - robot.price
        });

        // Save robot to user's collection
        const robotData = {
            robotId: robot.id,
            name: robot.name,
            level: robot.level,
            dailyProfit: robot.dailyProfit,
            price: robot.price,
            minTrade: robot.minTrade || 3,
            purchasedAt: Date.now(),
            date: new Date().toISOString(),
            status: 'active',
            startTime: Date.now(),
            endTime: Date.now() + (30 * 24 * 60 * 60 * 1000),
            lastProfitTime: Date.now(),
            profitDays: 0,
            durationDays: 30,
            tradePercent: 100,
            investedAmount: investedAmount,
            amount: investedAmount,
            originalAmount: investedAmount
        };

        await db.ref(`userRobots/${userId}/${robotId}`).set(robotData);

        // Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '🤖 Robot Purchased!',
            message: `You purchased ${robot.name}! $${investedAmount.toFixed(2)} invested for trading.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: `Robot purchased successfully!`,
            robot: robotData
        });

    } catch (error) {
        console.error('[ROBOTS] Purchase error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET ROBOT BY ID
// ============================================================
router.get('/:robotId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { robotId } = req.params;

        const snapshot = await db.ref(`robots_list/${robotId}`).once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        res.json({
            success: true,
            robot: {
                id: parseInt(robotId),
                ...snapshot.val()
            }
        });

    } catch (error) {
        console.error('[ROBOTS] Get robot error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET ROBOT STATS (Admin only - for dashboard)
// ============================================================
router.get('/stats/all', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const stats = {
            totalRobots: 0,
            totalUsers: 0,
            totalPurchases: 0,
            totalInvested: 0,
            mostPopular: null,
            robots: {}
        };

        // Get all robots
        const robotsSnap = await db.ref('robots_list').once('value');
        if (robotsSnap.exists()) {
            robotsSnap.forEach(child => {
                stats.totalRobots++;
                const robot = child.val();
                stats.robots[child.key] = {
                    name: robot.name,
                    price: robot.price,
                    purchases: 0,
                    totalInvested: 0
                };
            });
        }

        // Get all user robots
        const userRobotsSnap = await db.ref('userRobots').once('value');
        if (userRobotsSnap.exists()) {
            userRobotsSnap.forEach(userChild => {
                stats.totalUsers++;
                userChild.forEach(robotChild => {
                    const robot = robotChild.val();
                    stats.totalPurchases++;
                    stats.totalInvested += robot.investedAmount || 0;
                    
                    const robotId = robot.robotId;
                    if (stats.robots[robotId]) {
                        stats.robots[robotId].purchases++;
                        stats.robots[robotId].totalInvested += robot.investedAmount || 0;
                    }
                });
            });
        }

        // Find most popular robot
        let mostPopular = null;
        let maxPurchases = 0;
        for (const [id, data] of Object.entries(stats.robots)) {
            if (data.purchases > maxPurchases) {
                maxPurchases = data.purchases;
                mostPopular = {
                    id: id,
                    ...data
                };
            }
        }
        stats.mostPopular = mostPopular;

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[ROBOTS] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. UPDATE ROBOT (Admin only)
// ============================================================
router.put('/:robotId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { robotId } = req.params;
        const userId = req.user.uid;
        const { name, price, dailyProfit, description, minTrade, hot } = req.body;

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const robotRef = db.ref(`robots_list/${robotId}`);
        const robotSnap = await robotRef.once('value');
        if (!robotSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Robot not found' });
        }

        const updates = {};
        if (name) updates.name = name;
        if (price) updates.price = price;
        if (dailyProfit) updates.dailyProfit = dailyProfit;
        if (description) updates.description = description;
        if (minTrade) updates.minTrade = minTrade;
        if (hot !== undefined) updates.hot = hot;
        updates.updatedAt = Date.now();

        await robotRef.update(updates);

        res.json({
            success: true,
            message: 'Robot updated successfully',
            updates: updates
        });

    } catch (error) {
        console.error('[ROBOTS] Update error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;