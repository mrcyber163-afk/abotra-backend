// ============================================================
// DEPOSIT ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch } = require('../firebase');
const { authGetUser } = require('../firebase');

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
        console.error('[DEPOSIT] Token verification error:', error);
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// MIDDLEWARE: Check Admin
// ============================================================
async function verifyAdmin(req, res, next) {
    try {
        const adminList = await restGet('admins');
        const isAdmin = adminList && (adminList[req.user.uid] === true || 
                       (adminList.includes && adminList.includes(req.user.uid)));
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        req.isAdmin = true;
        next();
    } catch (error) {
        console.error('[DEPOSIT] Admin check error:', error);
        return res.status(500).json({ success: false, error: 'Failed to verify admin status' });
    }
}

// ============================================================
// 1. GET USER DEPOSITS
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const deposits = [];

        const data = await restGet(`deposits/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                deposits.push({
                    id: key,
                    ...data[key]
                });
            });
        }

        // Sort by newest first
        deposits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            deposits: deposits.slice(0, 50)
        });
    } catch (error) {
        console.error('[DEPOSIT] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET PENDING DEPOSITS (ADMIN ONLY)
// ============================================================
router.get('/pending', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const deposits = [];

        const data = await restGet('deposits');
        if (data) {
            // Check all user deposits
            for (const [userId, userDeposits] of Object.entries(data)) {
                if (typeof userDeposits === 'object') {
                    for (const [depositId, deposit] of Object.entries(userDeposits)) {
                        if (deposit.status === 'pending' || deposit.status === 'pending_verification') {
                            deposits.push({
                                id: depositId,
                                userId: userId,
                                ...deposit
                            });
                        }
                    }
                }
            }
        }

        // Sort by newest first
        deposits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            deposits: deposits
        });
    } catch (error) {
        console.error('[DEPOSIT] Pending error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. APPROVE DEPOSIT (ADMIN ONLY)
// ============================================================
router.post('/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { depositId, userId } = req.body;

        if (!depositId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'depositId and userId are required'
            });
        }

        // Get deposit data
        const depositData = await restGet(`deposits/${userId}/${depositId}`);
        if (!depositData) {
            return res.status(404).json({
                success: false,
                error: 'Deposit not found'
            });
        }

        // Check if already processed
        if (depositData.status !== 'pending' && depositData.status !== 'pending_verification') {
            return res.status(400).json({
                success: false,
                error: `Deposit already ${depositData.status}`
            });
        }

        // Update deposit status
        await restPatch(`deposits/${userId}/${depositId}`, {
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: req.user.uid,
            approvedByEmail: req.user.email
        });

        // Update user balance
        const userData = await restGet(`users/${userId}`);
        if (userData) {
            const currentBalance = userData.balance || 0;
            const totalDeposited = userData.totalDeposited || 0;
            await restPatch(`users/${userId}`, {
                balance: currentBalance + depositData.amount,
                totalDeposited: totalDeposited + depositData.amount
            });
        }

        // Add notification
        await restPost(`notifications/${userId}`, {
            title: '✅ Deposit Approved!',
            message: `Your deposit of $${depositData.amount.toFixed(2)} has been approved and credited to your balance.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        console.log(`[DEPOSIT] ✅ Approved: ${depositId} for user ${userId} - $${depositData.amount}`);

        res.json({
            success: true,
            message: 'Deposit approved successfully'
        });

    } catch (error) {
        console.error('[DEPOSIT] Approve error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 4. REJECT DEPOSIT (ADMIN ONLY)
// ============================================================
router.post('/reject', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { depositId, userId, reason } = req.body;

        if (!depositId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'depositId and userId are required'
            });
        }

        // Get deposit data
        const depositData = await restGet(`deposits/${userId}/${depositId}`);
        if (!depositData) {
            return res.status(404).json({
                success: false,
                error: 'Deposit not found'
            });
        }

        // Check if already processed
        if (depositData.status !== 'pending' && depositData.status !== 'pending_verification') {
            return res.status(400).json({
                success: false,
                error: `Deposit already ${depositData.status}`
            });
        }

        // Update deposit status
        await restPatch(`deposits/${userId}/${depositId}`, {
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email,
            rejectionReason: reason || 'No reason provided'
        });

        // Add notification
        await restPost(`notifications/${userId}`, {
            title: '❌ Deposit Rejected',
            message: `Your deposit of $${depositData.amount.toFixed(2)} was rejected. Reason: ${reason || 'No reason provided'}`,
            type: 'error',
            read: false,
            timestamp: Date.now()
        });

        console.log(`[DEPOSIT] ❌ Rejected: ${depositId} for user ${userId}`);

        res.json({
            success: true,
            message: 'Deposit rejected successfully'
        });

    } catch (error) {
        console.error('[DEPOSIT] Reject error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 5. CREATE DEPOSIT REQUEST (User)
// ============================================================
router.post('/create', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { amount, method, phone, accountName, reference } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount'
            });
        }

        if (amount < 5) {
            return res.status(400).json({
                success: false,
                error: 'Minimum deposit is $5'
            });
        }

        // Get user data for email
        const userData = await restGet(`users/${userId}`);

        const depositData = {
            userId: userId,
            userEmail: userData?.email || req.user.email,
            amount: amount,
            method: method || 'Bank Transfer',
            phone: phone || '',
            accountName: accountName || '',
            reference: reference || '',
            status: 'pending',
            createdAt: Date.now(),
            date: new Date().toISOString()
        };

        // Save deposit
        const depositRef = await restPost(`deposits/${userId}`, depositData);
        const depositId = depositRef.name;

        // Add notification
        await restPost(`notifications/${userId}`, {
            title: '📋 Deposit Request Submitted',
            message: `Your deposit of $${amount.toFixed(2)} has been submitted and is pending approval.`,
            type: 'info',
            read: false,
            timestamp: Date.now()
        });

        // Add admin notification
        await restPost(`adminNotifications`, {
            type: 'deposit_pending',
            userId: userId,
            userEmail: userData?.email || req.user.email,
            amount: amount,
            timestamp: Date.now(),
            read: false
        });

        res.json({
            success: true,
            message: 'Deposit request submitted successfully',
            depositId: depositId
        });

    } catch (error) {
        console.error('[DEPOSIT] Create error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
