const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch } = require('../firebase');

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

async function verifyAdmin(req, res, next) {
    try {
        const adminList = await restGet('admins');
        const isAdmin = adminList && (adminList[req.user.uid] === true || adminList.includes && adminList.includes(req.user.uid));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin access required' });
        req.isAdmin = true;
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to verify admin status' });
    }
}

router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const withdrawals = [];
        const data = await restGet(`withdrawals/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                withdrawals.push({ id: key, ...data[key] });
            });
        }
        withdrawals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('[WITHDRAW] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/pending', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const withdrawals = [];
        const data = await restGet('adminWithdrawals');
        if (data) {
            Object.keys(data).forEach(key => {
                const w = data[key];
                if (w.status === 'pending') withdrawals.push({ id: key, ...w });
            });
        }
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('[WITHDRAW] Pending error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { withdrawalId } = req.body;
        if (!withdrawalId) return res.status(400).json({ success: false, error: 'withdrawalId required' });

        const withdrawalData = await restGet(`adminWithdrawals/${withdrawalId}`);
        if (!withdrawalData) return res.status(404).json({ success: false, error: 'Withdrawal not found' });
        if (withdrawalData.status !== 'pending') {
            return res.status(400).json({ success: false, error: `Withdrawal already ${withdrawalData.status}` });
        }

        await restPatch(`adminWithdrawals/${withdrawalId}`, {
            status: 'approved', approvedAt: Date.now(), approvedBy: req.user.uid, approvedByEmail: req.user.email
        });
        await restPatch(`withdrawals/${withdrawalData.uid}/${withdrawalId}`, {
            status: 'approved', approvedAt: Date.now(), approvedBy: req.user.uid, approvedByEmail: req.user.email
        });

        await restPost(`notifications/${withdrawalData.uid}`, {
            title: '✅ Withdrawal Approved!',
            message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} has been approved and processed.`,
            type: 'success', read: false, timestamp: Date.now()
        });

        res.json({ success: true, message: 'Withdrawal approved successfully', withdrawalId });
    } catch (error) {
        console.error('[WITHDRAW] Approve error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/reject', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { withdrawalId, reason } = req.body;
        if (!withdrawalId) return res.status(400).json({ success: false, error: 'withdrawalId required' });

        const withdrawalData = await restGet(`adminWithdrawals/${withdrawalId}`);
        if (!withdrawalData) return res.status(404).json({ success: false, error: 'Withdrawal not found' });
        if (withdrawalData.status !== 'pending') {
            return res.status(400).json({ success: false, error: `Withdrawal already ${withdrawalData.status}` });
        }

        const userData = await restGet(`users/${withdrawalData.uid}`);
        const currentBalance = userData?.balance || 0;
        await restPatch(`users/${withdrawalData.uid}`, { balance: currentBalance + withdrawalData.amount });

        await restPatch(`adminWithdrawals/${withdrawalId}`, {
            status: 'rejected', rejectedAt: Date.now(), rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email, rejectionReason: reason || 'No reason provided'
        });
        await restPatch(`withdrawals/${withdrawalData.uid}/${withdrawalId}`, {
            status: 'rejected', rejectedAt: Date.now(), rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email, rejectionReason: reason || 'No reason provided'
        });

        await restPost(`notifications/${withdrawalData.uid}`, {
            title: '❌ Withdrawal Rejected',
            message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} was rejected. Reason: ${reason || 'No reason provided'}`,
            type: 'error', read: false, timestamp: Date.now()
        });

        res.json({ success: true, message: 'Withdrawal rejected successfully', withdrawalId });
    } catch (error) {
        console.error('[WITHDRAW] Reject error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
