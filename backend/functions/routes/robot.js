// ============================================================
// ROBOT ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPut, restPatch, restPost, restDelete } = require('../firebase');

// ============================================================
// GET ROBOT STATUS (Full status with plans and trades)
// ============================================================
router.get('/status', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        
        // Get robot
        const robot = await restGet(`users/${uid}/robots/currentRobot`);
        
        // Get plans
        const plans = await restGet('robotPlans');
        
        // Get trades
        const trades = await restGet(`robotTrades/${uid}`);
        
        // Get performance
        const performance = await restGet(`robotPerformance/${uid}`);
        
        // Convert trades to array
        let tradeArray = [];
        if (trades) {
            Object.keys(trades).forEach(key => {
                tradeArray.push({ id: key, ...trades[key] });
            });
            tradeArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
        
        res.json({
            success: true,
            robot: robot || null,
            plans: plans || {},
            trades: tradeArray,
            performance: performance || null
        });
    } catch (error) {
        console.error('[Robot] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET MY ROBOT
// ============================================================
router.get('/my-robot', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const robot = await restGet(`users/${uid}/robots/currentRobot`);
        
        if (!robot) {
            return res.status(404).json({
                success: false,
                error: 'No robot found'
            });
        }
        
        // Check expiry
        if (robot.expiryDate && Date.now() > robot.expiryDate && robot.status !== 'expired') {
            robot.status = 'expired';
            await restPatch(`users/${uid}/robots/currentRobot`, { status: 'expired' });
        }
        
        res.json({ success: true, robot });
    } catch (error) {
        console.error('[Robot] GET error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET ROBOT PLANS
// ============================================================
router.get('/plans', verifyToken, async (req, res) => {
    try {
        const plans = await restGet('robotPlans');
        res.json({ success: true, plans: plans || {} });
    } catch (error) {
        console.error('[Robot] Plans error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET ROBOT TRADES
// ============================================================
router.get('/trades', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const trades = await restGet(`robotTrades/${uid}`);
        
        let tradeArray = [];
        if (trades) {
            Object.keys(trades).forEach(key => {
                tradeArray.push({ id: key, ...trades[key] });
            });
            tradeArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        }
        
        res.json({ success: true, trades: tradeArray });
    } catch (error) {
        console.error('[Robot] Trades error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET ROBOT PERFORMANCE
// ============================================================
router.get('/performance', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const performance = await restGet(`robotPerformance/${uid}`);
        res.json({ success: true, performance: performance || null });
    } catch (error) {
        console.error('[Robot] Performance error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// CREATE TRIAL ROBOT
// ============================================================
router.post('/create-trial', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        
        // Check if robot already exists
        const existing = await restGet(`users/${uid}/robots/currentRobot`);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Robot already exists'
            });
        }
        
        const startDate = Date.now();
        const expiryDate = startDate + (15 * 24 * 60 * 60 * 1000);
        
        const trialRobot = {
            name: 'ABOTRA Starter AI',
            type: 'trial',
            premium: false,
            status: 'active',
            startDate: startDate,
            expiryDate: expiryDate,
            investment: 0,
            balance: 0,
            totalProfit: 0,
            tradesCount: 0,
            winRate: 0,
            createdAt: startDate
        };
        
        await restPut(`users/${uid}/robots/currentRobot`, trialRobot);
        
        res.json({ success: true, robot: trialRobot });
    } catch (error) {
        console.error('[Robot] Create trial error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// UPGRADE ROBOT
// ============================================================
router.post('/upgrade', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const { planId, amount } = req.body;
        
        if (!planId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Plan ID and amount required'
            });
        }
        
        // Get plan details
        const plan = await restGet(`robotPlans/${planId}`);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found' });
        }
        
        // Check user balance
        const user = await restGet(`users/${uid}`);
        if (!user || user.balance < amount) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient balance'
            });
        }
        
        // Deduct balance
        await restPatch(`users/${uid}`, {
            balance: user.balance - amount
        });
        
        // Create premium robot
        const startDate = Date.now();
        const expiryDate = startDate + (plan.duration * 24 * 60 * 60 * 1000);
        
        const premiumRobot = {
            name: plan.name || 'Premium Robot',
            type: 'premium',
            premium: true,
            status: 'active',
            duration: plan.duration,
            startDate: startDate,
            expiryDate: expiryDate,
            investment: amount,
            balance: amount,
            totalProfit: 0,
            tradesCount: 0,
            winRate: 0,
            planId: planId,
            upgradedAt: Date.now()
        };
        
        await restPut(`users/${uid}/robots/currentRobot`, premiumRobot);
        
        res.json({ success: true, robot: premiumRobot });
    } catch (error) {
        console.error('[Robot] Upgrade error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// PAUSE ROBOT
// ============================================================
router.post('/pause', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        await restPatch(`users/${uid}/robots/currentRobot`, {
            status: 'paused',
            pausedAt: Date.now()
        });
        res.json({ success: true, message: 'Robot paused' });
    } catch (error) {
        console.error('[Robot] Pause error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ACTIVATE ROBOT
// ============================================================
router.post('/activate', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        await restPatch(`users/${uid}/robots/currentRobot`, {
            status: 'active',
            activatedAt: Date.now()
        });
        res.json({ success: true, message: 'Robot activated' });
    } catch (error) {
        console.error('[Robot] Activate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// CHECK EXPIRY
// ============================================================
router.get('/check-expiry', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const robot = await restGet(`users/${uid}/robots/currentRobot`);
        
        if (!robot) {
            return res.json({ success: true, expired: true, robot: null });
        }
        
        const now = Date.now();
        const expired = robot.expiryDate && now > robot.expiryDate;
        
        if (expired && robot.status !== 'expired') {
            await restPatch(`users/${uid}/robots/currentRobot`, {
                status: 'expired'
            });
        }
        
        const daysRemaining = expired ? 0 : Math.ceil((robot.expiryDate - now) / (1000 * 60 * 60 * 24));
        
        res.json({
            success: true,
            expired,
            robot,
            daysRemaining: Math.max(0, daysRemaining)
        });
    } catch (error) {
        console.error('[Robot] Expiry check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET SUBSCRIPTION
// ============================================================
router.get('/subscription', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const subscription = await restGet(`subscriptions/${uid}`);
        res.json({ success: true, subscription: subscription || null });
    } catch (error) {
        console.error('[Robot] Subscription error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;