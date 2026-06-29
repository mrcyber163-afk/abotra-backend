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

router.get('/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, balance: userData.balance || 0, tradingBalance: userData.tradingBalance || 0 });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const transactions = [];
        const deposits = await restGet(`deposits/${userId}`);
        if (deposits) {
            Object.keys(deposits).forEach(key => {
                const d = deposits[key];
                transactions.push({ id: key, type: 'deposit', amount: d.amount, status: d.status || 'completed', timestamp: d.approvedAt || d.createdAt || Date.now(), method: d.method || 'Bank Transfer' });
            });
        }
        const withdrawals = await restGet(`withdrawals/${userId}`);
        if (withdrawals) {
            Object.keys(withdrawals).forEach(key => {
                const w = withdrawals[key];
                transactions.push({ id: key, type: 'withdraw', amount: w.amount, status: w.status || 'pending', timestamp: w.createdAt || Date.now(), method: w.method || 'Bank Transfer' });
            });
        }
        transactions.sort((a, b) => b.timestamp - a.timestamp);
        res.json({ success: true, transactions: transactions.slice(0, 50) });
    } catch (error) {
        console.error('[WALLET] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/transfer', verifyToken, async (req, res) => {
    try {
        const { recipientEmail, amount, note } = req.body;
        const senderId = req.user.uid;
        const senderEmail = req.user.email;

        if (!recipientEmail || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        if (amount < 1) return res.status(400).json({ success: false, error: 'Minimum amount is $1' });
        if (recipientEmail.toLowerCase() === senderEmail.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Cannot transfer to yourself' });
        }

        const usersData = await restGet('users');
        let recipientId = null;
        let recipientData = null;
        if (usersData) {
            for (const [uid, user] of Object.entries(usersData)) {
                if (user.email && user.email.toLowerCase() === recipientEmail.toLowerCase()) {
                    recipientId = uid;
                    recipientData = user;
                    break;
                }
            }
        }
        if (!recipientId) return res.status(404).json({ success: false, error: 'Recipient not found' });

        const senderData = await restGet(`users/${senderId}`);
        const senderBalance = senderData?.balance || 0;
        if (senderBalance < amount) return res.status(400).json({ success: false, error: 'Insufficient balance' });

        await restPatch(`users/${senderId}`, { balance: senderBalance - amount });
        await restPatch(`users/${recipientId}`, { balance: (recipientData?.balance || 0) + amount });

        const transferId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const transferData = {
            id: transferId, amount, senderId, senderEmail, recipientId,
            recipientEmail: recipientData.email, note: note || '', timestamp: Date.now(), status: 'completed'
        };
        await restPut(`transfers/sent/${senderId}/${transferId}`, transferData);
        await restPut(`transfers/received/${recipientId}/${transferId}`, transferData);

        await restPost(`notifications/${senderId}`, {
            title: 'Transfer Sent', message: `You sent $${amount.toFixed(2)} to ${recipientData.email}`,
            type: 'info', read: false, timestamp: Date.now()
        });
        await restPost(`notifications/${recipientId}`, {
            title: 'Transfer Received', message: `You received $${amount.toFixed(2)} from ${senderEmail}`,
            type: 'success', read: false, timestamp: Date.now()
        });

        res.json({ success: true, message: `$${amount.toFixed(2)} sent to ${recipientData.email}`, transferId });
    } catch (error) {
        console.error('[TRANSFER] Error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
