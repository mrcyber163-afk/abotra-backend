// ============================================================
// USER ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPatch } = require('../firebase');

// ============================================================
// GET USER PROFILE
// ============================================================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const userData = await restGet(`users/${uid}`);
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                uid: uid,
                email: userData.email,
                fullName: userData.fullName,
                username: userData.username,
                balance: userData.balance || 0,
                tradingBalance: userData.tradingBalance || 0,
                performance: userData.performance || {
                    totalProfit: 0,
                    totalLoss: 0,
                    totalTrades: 0,
                    winRate: 0
                },
                createdAt: userData.createdAt
            }
        });
    } catch (error) {
        console.error('[User] Profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// UPDATE USER PROFILE
// ============================================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const { fullName, username } = req.body;
        
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (username) updates.username = username;
        updates.updatedAt = Date.now();
        
        await restPatch(`users/${uid}`, updates);
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('[User] Update profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET USER BALANCE
// ============================================================
router.get('/balance', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const userData = await restGet(`users/${uid}`);
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            balance: userData.balance || 0,
            tradingBalance: userData.tradingBalance || 0
        });
    } catch (error) {
        console.error('[User] Balance error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;