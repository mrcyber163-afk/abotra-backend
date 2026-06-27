// functions/routes/withdraw.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header'
        });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const { getAuth } = require('../firebase');
        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('[AUTH] Token verification failed:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token. Please login again.'
        });
    }
}

// ============================================================
// MIDDLEWARE: Check Admin
// ============================================================
async function verifyAdmin(req, res, next) {
    try {
        const db = getDB();
        const adminSnap = await db.ref(`admins/${req.user.uid}`).once('value');
        if (!adminSnap.exists()) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        req.isAdmin = true;
        next();
    } catch (error) {
        console.error('[ADMIN] Check failed:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to verify admin status'
        });
    }
}

// ============================================================
// 1. GET USER WITHDRAWAL HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = getDB();
        const snapshot = await db.ref(`withdrawals/${userId}`)
            .orderByChild('createdAt')
            .limitToLast(50)
            .once('value');

        const withdrawals = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const data = child.val();
                withdrawals.push({
                    id: child.key,
                    ...data
                });
            });
        }

        res.json({
            success: true,
            withdrawals: withdrawals.reverse()
        });
    } catch (error) {
        console.error('[WITHDRAW] History error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 2. GET PENDING WITHDRAWALS (ADMIN ONLY)
// ============================================================
router.get('/pending', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        const snapshot = await db.ref('adminWithdrawals')
            .orderByChild('status')
            .equalTo('pending')
            .once('value');

        const withdrawals = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const data = child.val();
                withdrawals.push({
                    id: child.key,
                    ...data
                });
            });
        }

        res.json({
            success: true,
            withdrawals
        });
    } catch (error) {
        console.error('[WITHDRAW] Pending error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 3. GET ALL WITHDRAWALS (ADMIN ONLY)
// ============================================================
router.get('/all', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const db = getDB();
        const snapshot = await db.ref('adminWithdrawals')
            .orderByChild('createdAt')
            .limitToLast(100)
            .once('value');

        const withdrawals = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const data = child.val();
                withdrawals.push({
                    id: child.key,
                    ...data
                });
            });
        }

        res.json({
            success: true,
            withdrawals: withdrawals.reverse()
        });
    } catch (error) {
        console.error('[WITHDRAW] All error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 4. APPROVE WITHDRAWAL (ADMIN ONLY)
// ============================================================
router.post('/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { withdrawalId } = req.body;
        if (!withdrawalId) {
            return res.status(400).json({
                success: false,
                error: 'withdrawalId is required'
            });
        }

        const db = getDB();

        // Get withdrawal from admin path
        const withdrawalRef = db.ref(`adminWithdrawals/${withdrawalId}`);
        const withdrawalSnap = await withdrawalRef.once('value');

        if (!withdrawalSnap.exists()) {
            return res.status(404).json({
                success: false,
                error: 'Withdrawal not found'
            });
        }

        const withdrawalData = withdrawalSnap.val();

        if (withdrawalData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: `Withdrawal already ${withdrawalData.status}`
            });
        }

        // Update admin withdrawal
        await withdrawalRef.update({
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: req.user.uid,
            approvedByEmail: req.user.email
        });

        // Update user withdrawal
        const userWithdrawalRef = db.ref(`withdrawals/${withdrawalData.uid}/${withdrawalId}`);
        await userWithdrawalRef.update({
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: req.user.uid,
            approvedByEmail: req.user.email
        });

        // Send notification to user
        const notifRef = db.ref(`notifications/${withdrawalData.uid}`).push();
        await notifRef.set({
            title: '✅ Withdrawal Approved!',
            message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} has been approved and processed.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        console.log(`[WITHDRAW] ✅ Approved: ${withdrawalId} for user ${withdrawalData.uid}`);

        res.json({
            success: true,
            message: 'Withdrawal approved successfully',
            withdrawalId: withdrawalId
        });

    } catch (error) {
        console.error('[WITHDRAW] Approve error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 5. REJECT WITHDRAWAL (ADMIN ONLY)
// ============================================================
router.post('/reject', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { withdrawalId, reason } = req.body;
        if (!withdrawalId) {
            return res.status(400).json({
                success: false,
                error: 'withdrawalId is required'
            });
        }

        const db = getDB();

        // Get withdrawal from admin path
        const withdrawalRef = db.ref(`adminWithdrawals/${withdrawalId}`);
        const withdrawalSnap = await withdrawalRef.once('value');

        if (!withdrawalSnap.exists()) {
            return res.status(404).json({
                success: false,
                error: 'Withdrawal not found'
            });
        }

        const withdrawalData = withdrawalSnap.val();

        if (withdrawalData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: `Withdrawal already ${withdrawalData.status}`
            });
        }

        // Return funds to user
        const userRef = db.ref(`users/${withdrawalData.uid}`);
        const userSnap = await userRef.once('value');
        if (userSnap.exists()) {
            const currentBalance = userSnap.val().balance || 0;
            await userRef.update({
                balance: currentBalance + withdrawalData.amount
            });
            console.log(`[WITHDRAW] 🔄 Returned $${withdrawalData.amount} to user ${withdrawalData.uid}`);
        }

        // Update admin withdrawal
        await withdrawalRef.update({
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email,
            rejectionReason: reason || 'No reason provided'
        });

        // Update user withdrawal
        const userWithdrawalRef = db.ref(`withdrawals/${withdrawalData.uid}/${withdrawalId}`);
        await userWithdrawalRef.update({
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email,
            rejectionReason: reason || 'No reason provided'
        });

        // Send notification to user
        const notifRef = db.ref(`notifications/${withdrawalData.uid}`).push();
        await notifRef.set({
            title: '❌ Withdrawal Rejected',
            message: `Your withdrawal of $${withdrawalData.amount.toFixed(2)} was rejected. Reason: ${reason || 'No reason provided'}`,
            type: 'error',
            read: false,
            timestamp: Date.now()
        });

        console.log(`[WITHDRAW] ❌ Rejected: ${withdrawalId} for user ${withdrawalData.uid}`);

        res.json({
            success: true,
            message: 'Withdrawal rejected successfully',
            withdrawalId: withdrawalId
        });

    } catch (error) {
        console.error('[WITHDRAW] Reject error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 6. GET WITHDRAWAL BY ID
// ============================================================
router.get('/:withdrawalId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { withdrawalId } = req.params;
        const db = getDB();

        const snapshot = await db.ref(`withdrawals/${userId}/${withdrawalId}`).once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({
                success: false,
                error: 'Withdrawal not found'
            });
        }

        res.json({
            success: true,
            withdrawal: {
                id: withdrawalId,
                ...snapshot.val()
            }
        });
    } catch (error) {
        console.error('[WITHDRAW] Get error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;