// ============================================================
// ADMIN ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPatch, restDelete } = require('../firebase');

// ============================================================
// MIDDLEWARE: Check Admin
// ============================================================
async function checkAdmin(req, res, next) {
    try {
        const { uid } = req.user;
        const userData = await restGet(`users/${uid}`);
        if (!userData || userData.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// 1. GET ALL USERS
// ============================================================
router.get('/users', verifyToken, checkAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, search = '' } = req.query;
        const users = [];

        const data = await restGet('users');
        if (data) {
            for (const [uid, user] of Object.entries(data)) {
                const searchable = (user.email || '').toLowerCase() + 
                                  (user.fullName || '').toLowerCase() + 
                                  (user.username || '').toLowerCase();
                if (search && !searchable.includes(search.toLowerCase())) continue;

                users.push({
                    uid: uid,
                    email: user.email || '',
                    fullName: user.fullName || user.username || '',
                    username: user.username || '',
                    phone: user.phone || '',
                    country: user.country || 'Tanzania',
                    balance: user.balance || 0,
                    tradingBalance: user.tradingBalance || 0,
                    status: user.status || 'active',
                    isVerified: user.isVerified || false,
                    isOnline: user.isOnline || false,
                    kycStatus: user.kycStatus || 'none',
                    createdAt: user.createdAt || Date.now(),
                    referralCode: user.referralCode || ''
                });
            }
        }

        users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const paginatedUsers = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({ success: true, users: paginatedUsers, total: users.length });
    } catch (error) {
        console.error('[ADMIN] Get users error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET SYSTEM STATS
// ============================================================
router.get('/stats', verifyToken, checkAdmin, async (req, res) => {
    try {
        const users = await restGet('users');
        const trades = await restGet('trades');
        
        let totalTrades = 0, totalProfit = 0;
        if (trades) {
            Object.values(trades).forEach(userTrades => {
                if (userTrades && typeof userTrades === 'object') {
                    Object.values(userTrades).forEach(trade => {
                        totalTrades++;
                        if (trade.profit) totalProfit += trade.profit;
                    });
                }
            });
        }

        res.json({
            success: true,
            stats: {
                totalUsers: users ? Object.keys(users).length : 0,
                totalTrades: totalTrades,
                totalProfit: totalProfit,
                uptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('[ADMIN] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. SUSPEND/ACTIVATE USER
// ============================================================
router.put('/users/:uid/status', verifyToken, checkAdmin, async (req, res) => {
    try {
        const { uid } = req.params;
        const { status } = req.body;

        if (!uid || !status || !['active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid request' });
        }

        await restPatch(`users/${uid}`, {
            status: status,
            statusUpdatedAt: Date.now()
        });

        res.json({ success: true, message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully` });
    } catch (error) {
        console.error('[ADMIN] Update user status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;