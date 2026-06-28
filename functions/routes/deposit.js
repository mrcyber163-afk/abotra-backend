// functions/routes/deposit.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');

// Middleware: Verify Firebase Token
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const { getAuth } = require('../firebase');
        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// GET USER DEPOSITS
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = getDB();
        const snapshot = await db.ref(`user_deposits/${userId}`)
            .orderByChild('createdAt')
            .limitToLast(50)
            .once('value');
        
        const deposits = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                deposits.push({ id: child.key, ...child.val() });
            });
        }
        res.json({ success: true, deposits: deposits.reverse() });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET PENDING DEPOSITS (ADMIN ONLY)
// ============================================================
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const { getAuth } = require('../firebase');
        const auth = getAuth();
        const adminSnap = await getDB().ref(`admins/${req.user.uid}`).once('value');
        if (!adminSnap.exists()) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        const db = getDB();
        const snapshot = await db.ref('deposits')
            .orderByChild('status')
            .equalTo('pending')
            .once('value');
        
        const deposits = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                deposits.push({ id: child.key, ...child.val() });
            });
        }
        res.json({ success: true, deposits });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// APPROVE DEPOSIT (ADMIN ONLY)
// ============================================================
router.post('/approve', verifyToken, async (req, res) => {
    try {
        const { depositId, userId } = req.body;
        if (!depositId || !userId) {
            return res.status(400).json({ success: false, error: 'depositId and userId required' });
        }
        
        const db = getDB();
        const adminSnap = await db.ref(`admins/${req.user.uid}`).once('value');
        if (!adminSnap.exists()) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        // Get deposit data
        const depositRef = db.ref(`deposits/${userId}/${depositId}`);
        const depositSnap = await depositRef.once('value');
        if (!depositSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Deposit not found' });
        }
        const depositData = depositSnap.val();
        
        if (depositData.status !== 'pending' && depositData.status !== 'pending_verification') {
            return res.status(400).json({ success: false, error: 'Deposit already processed' });
        }
        
        // Update deposit status
        await depositRef.update({
            status: 'approved',
            approvedAt: Date.now(),
            approvedBy: req.user.uid,
            approvedByEmail: req.user.email
        });
        
        // Update user balance
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (userSnap.exists()) {
            const currentBalance = userSnap.val().balance || 0;
            await userRef.update({
                balance: currentBalance + depositData.amount,
                totalDeposited: (userSnap.val().totalDeposited || 0) + depositData.amount
            });
        }
        
        // Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '✅ Deposit Approved!',
            message: `Your deposit of $${depositData.amount} has been approved and credited to your balance.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });
        
        res.json({ success: true, message: 'Deposit approved successfully' });
    } catch (error) {
        console.error('Approve deposit error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// REJECT DEPOSIT (ADMIN ONLY)
// ============================================================
router.post('/reject', verifyToken, async (req, res) => {
    try {
        const { depositId, userId, reason } = req.body;
        if (!depositId || !userId) {
            return res.status(400).json({ success: false, error: 'depositId and userId required' });
        }
        
        const db = getDB();
        const adminSnap = await db.ref(`admins/${req.user.uid}`).once('value');
        if (!adminSnap.exists()) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        
        const depositRef = db.ref(`deposits/${userId}/${depositId}`);
        const depositSnap = await depositRef.once('value');
        if (!depositSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Deposit not found' });
        }
        const depositData = depositSnap.val();
        
        if (depositData.status !== 'pending' && depositData.status !== 'pending_verification') {
            return res.status(400).json({ success: false, error: 'Deposit already processed' });
        }
        
        await depositRef.update({
            status: 'rejected',
            rejectedAt: Date.now(),
            rejectedBy: req.user.uid,
            rejectedByEmail: req.user.email,
            rejectionReason: reason || 'No reason provided'
        });
        
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '❌ Deposit Rejected',
            message: `Your deposit of $${depositData.amount} was rejected. Reason: ${reason || 'No reason provided'}`,
            type: 'error',
            read: false,
            timestamp: Date.now()
        });
        
        res.json({ success: true, message: 'Deposit rejected' });
    } catch (error) {
        console.error('Reject deposit error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;