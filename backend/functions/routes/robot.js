const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPut, restPatch, restPost } = require('../services/firebase');

// ============================================================
// GET USER ROBOT
// ============================================================
router.get('/my-robot', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const robot = await restGet(`users/${uid}/robots/currentRobot`);
        
        if (!robot) {
            return res.status(404).json({ success: false, error: 'No robot found' });
        }
        
        res.json({ success: true, robot });
    } catch (error) {
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
        res.json({ success: true, trades: trades || {} });
    } catch (error) {
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
        
        // Get plan details
        const plan = await restGet(`robotPlans/${planId}`);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found' });
        }
        
        // Check user balance
        const user = await restGet(`users/${uid}`);
        if (!user || user.balance < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
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
        
        res.json({ success: true, message: 'Upgraded successfully', robot: premiumRobot });
        
    } catch (error) {
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
            return res.json({ success: true, expired: true, message: 'No robot found' });
        }
        
        const now = Date.now();
        const expired = robot.expiryDate && now > robot.expiryDate;
        
        if (expired && robot.status !== 'expired') {
            await restPatch(`users/${uid}/robots/currentRobot`, {
                status: 'expired'
            });
        }
        
        res.json({ success: true, expired, robot });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;