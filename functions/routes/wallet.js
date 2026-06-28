// functions/routes/wallet.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');

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
// 1. GET USER BALANCE
// ============================================================
router.get('/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = getDB();
        const snapshot = await db.ref(`users/${userId}`).once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const data = snapshot.val();
        res.json({
            success: true,
            balance: data.balance || 0,
            tradingBalance: data.tradingBalance || 0
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET TRANSACTION HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = getDB();
        const limit = parseInt(req.query.limit) || 50;
        const transactions = [];
        
        // Get deposits
        const depositsSnap = await db.ref(`deposits/${userId}`)
            .orderByChild('createdAt')
            .limitToLast(limit)
            .once('value');
        
        if (depositsSnap.exists()) {
            depositsSnap.forEach(child => {
                const data = child.val();
                transactions.push({
                    id: child.key,
                    type: 'deposit',
                    amount: data.amount,
                    status: data.status || 'completed',
                    timestamp: data.approvedAt || data.createdAt || Date.now(),
                    method: data.method || 'Bank Transfer'
                });
            });
        }
        
        // Get withdrawals
        const withdrawalsSnap = await db.ref(`withdrawals/${userId}`)
            .orderByChild('createdAt')
            .limitToLast(limit)
            .once('value');
        
        if (withdrawalsSnap.exists()) {
            withdrawalsSnap.forEach(child => {
                const data = child.val();
                transactions.push({
                    id: child.key,
                    type: 'withdraw',
                    amount: data.amount,
                    status: data.status || 'pending',
                    timestamp: data.createdAt || Date.now(),
                    method: data.method || 'Bank Transfer'
                });
            });
        }
        
        // Get received transfers
        const receivedSnap = await db.ref(`transfers/received/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');
        
        if (receivedSnap.exists()) {
            receivedSnap.forEach(child => {
                const data = child.val();
                transactions.push({
                    id: child.key,
                    type: 'transfer_received',
                    amount: data.amount,
                    sender: data.senderEmail,
                    status: 'completed',
                    timestamp: data.timestamp || Date.now()
                });
            });
        }
        
        // Get sent transfers
        const sentSnap = await db.ref(`transfers/sent/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');
        
        if (sentSnap.exists()) {
            sentSnap.forEach(child => {
                const data = child.val();
                transactions.push({
                    id: child.key,
                    type: 'transfer_sent',
                    amount: data.amount,
                    recipient: data.recipientEmail,
                    status: data.status || 'completed',
                    timestamp: data.timestamp || Date.now()
                });
            });
        }
        
        // Sort by timestamp (newest first)
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({
            success: true,
            transactions: transactions.slice(0, limit)
        });
    } catch (error) {
        console.error('[WALLET] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. FIND USER BY EMAIL
// ============================================================
router.get('/find-user/:email', verifyToken, async (req, res) => {
    try {
        const { email } = req.params;
        const searchEmail = email.toLowerCase().trim();
        const db = getDB();
        
        const snapshot = await db.ref('users')
            .orderByChild('email')
            .equalTo(searchEmail)
            .once('value');
        
        if (snapshot.exists()) {
            const users = [];
            snapshot.forEach(child => {
                const data = child.val();
                users.push({
                    uid: child.key,
                    email: data.email,
                    name: data.fullName || data.username || data.email
                });
            });
            return res.json({ success: true, user: users[0] });
        }
        
        res.json({ success: false, error: 'User not found' });
    } catch (error) {
        console.error('[WALLET] Find user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. SEND INTERNAL TRANSFER
// ============================================================
router.post('/transfer', verifyToken, async (req, res) => {
    try {
        const { recipientEmail, amount, note } = req.body;
        const senderId = req.user.uid;
        const senderEmail = req.user.email;
        
        if (!recipientEmail || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        if (amount < 1) {
            return res.status(400).json({ success: false, error: 'Minimum amount is $1' });
        }
        
        if (recipientEmail.toLowerCase() === senderEmail.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });
        }
        
        const db = getDB();
        
        // Find recipient
        const usersSnap = await db.ref('users')
            .orderByChild('email')
            .equalTo(recipientEmail.toLowerCase())
            .once('value');
        
        if (!usersSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Recipient not found' });
        }
        
        let recipientId = null;
        let recipientData = null;
        usersSnap.forEach(child => {
            recipientId = child.key;
            recipientData = child.val();
        });
        
        if (!recipientId || !recipientData) {
            return res.status(404).json({ success: false, error: 'Recipient not found' });
        }
        
        // Get sender balance
        const senderSnap = await db.ref(`users/${senderId}`).once('value');
        if (!senderSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Sender not found' });
        }
        
        const senderBalance = senderSnap.val().balance || 0;
        if (senderBalance < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        
        // Perform transaction
        const senderRef = db.ref(`users/${senderId}`);
        const recipientRef = db.ref(`users/${recipientId}`);
        
        await senderRef.transaction((data) => {
            if (data) {
                data.balance = (data.balance || 0) - amount;
            }
            return data;
        });
        
        await recipientRef.transaction((data) => {
            if (data) {
                data.balance = (data.balance || 0) + amount;
            }
            return data;
        });
        
        const transferId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const transferData = {
            id: transferId,
            amount: amount,
            senderId: senderId,
            senderEmail: senderEmail,
            recipientId: recipientId,
            recipientEmail: recipientData.email,
            note: note || '',
            timestamp: Date.now(),
            status: 'completed'
        };
        
        // Save to both paths
        await db.ref(`transfers/sent/${senderId}/${transferId}`).set(transferData);
        await db.ref(`transfers/received/${recipientId}/${transferId}`).set(transferData);
        
        // Add notifications
        const senderNotif = db.ref(`notifications/${senderId}`).push();
        await senderNotif.set({
            title: 'Transfer Sent',
            message: `You sent $${amount.toFixed(2)} to ${recipientData.email}`,
            type: 'info',
            read: false,
            timestamp: Date.now()
        });
        
        const recipientNotif = db.ref(`notifications/${recipientId}`).push();
        await recipientNotif.set({
            title: 'Transfer Received',
            message: `You received $${amount.toFixed(2)} from ${senderEmail}`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });
        
        console.log(`[TRANSFER] ✅ ${senderEmail} sent $${amount} to ${recipientData.email}`);
        
        res.json({
            success: true,
            message: `$${amount.toFixed(2)} sent to ${recipientData.email}`,
            transferId: transferId
        });
        
    } catch (error) {
        console.error('[TRANSFER] Error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;