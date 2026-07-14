// ============================================================
// ROBOT ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPut, restPatch } = require('../firebase');
const robotService = require('../services/robot-service');

// ============================================================
// GET USER ROBOT
// ============================================================
router.get('/my-robot', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const robot = await robotService.getRobot(uid);
        
        if (!robot) {
            return res.status(404).json({ success: false, error: 'No robot found' });
        }
        
        const expiryCheck = await robotService.checkExpiry(uid);
        if (expiryCheck) {
            robot.status = expiryCheck.expired ? 'expired' : robot.status;
        }
        
        res.json({ success: true, robot });
    } catch (error) {
        console.error('[Robot] GET error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET ROBOT STATUS
// ============================================================
router.get('/status', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const robot = await robotService.getRobot(uid);
        const plans = await restGet('robotPlans');
        const trades = await restGet(`robotTrades/${uid}`);
        const performance = await restGet(`robotPerformance/${uid}`);
        
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
        const existing = await robotService.getRobot(uid);
        if (existing) {
            return res.status(400).json({ success: false, error: 'Robot already exists' });
        }
        const robot = await robotService.createTrialRobot(uid);
        res.json({ success: true, robot });
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
            return res.status(400).json({ success: false, error: 'Plan ID and amount required' });
        }
        
        const robot = await robotService.upgradeRobot(uid, planId, amount);
        res.json({ success: true, robot });
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
        await robotService.pauseRobot(uid);
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
        await robotService.activateRobot(uid);
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
        const result = await robotService.checkExpiry(uid);
        res.json({ success: true, ...result });
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
        const subscription = require('../services/subscription-service');
        const sub = await subscription.getSubscription(uid);
        res.json({ success: true, subscription: sub || null });
    } catch (error) {
        console.error('[Robot] Subscription error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;