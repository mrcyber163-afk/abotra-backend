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

router.get('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({
            success: true,
            user: {
                id: userId, email: userData.email || req.user.email,
                name: userData.name || userData.fullName || userData.username || '',
                username: userData.username || '',
                phone: userData.phone || '',
                country: userData.country || 'Tanzania',
                balance: userData.balance || 0,
                tradingBalance: userData.tradingBalance || 0,
                isMerchant: userData.isMerchant || false,
                isOnline: userData.isOnline || false,
                lastSeen: userData.lastSeen || null,
                createdAt: userData.createdAt || Date.now(),
                profilePicture: userData.profilePicture || '',
                referralCode: userData.referralCode || '',
                referralCount: userData.referralCount || 0,
                commissionEarned: userData.commissionEarned || 0,
                isVerified: userData.isVerified || false,
                phoneVerified: userData.phoneVerified || false,
                kycStatus: userData.kycStatus || 'none',
                privacyAcknowledged: userData.privacyAcknowledged || false,
                termsAccepted: userData.termsAccepted || false,
                subscriptionMultiplier: userData.subscriptionMultiplier || 1,
                subscriptionExpiry: userData.subscriptionExpiry || 0,
                affiliateWithdrawn: userData.affiliateWithdrawn || 0
            }
        });
    } catch (error) {
        console.error('[USER] Profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { name, username, phone, country } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (username) updates.username = username;
        if (phone) updates.phone = phone;
        if (country) updates.country = country;
        updates.updatedAt = Date.now();
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        await restPatch(`users/${userId}`, updates);
        res.json({ success: true, message: 'Profile updated successfully', updates });
    } catch (error) {
        console.error('[USER] Update profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/balance', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { amount, operation } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Invalid amount' });

        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });

        const currentBalance = userData.balance || 0;
        let newBalance;
        if (operation === 'subtract') {
            if (currentBalance < amount) {
                return res.status(400).json({ success: false, error: `Insufficient balance. Need ${amount}, have ${currentBalance}` });
            }
            newBalance = currentBalance - amount;
        } else {
            newBalance = currentBalance + amount;
        }
        await restPatch(`users/${userId}`, { balance: newBalance });
        res.json({ success: true, newBalance, amount, operation });
    } catch (error) {
        console.error('[USER] Update balance error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/subscription', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.json({ success: true, subscription: null });
        const sub = userData.subscription;
        if (sub && sub.expiry > Date.now()) {
            return res.json({ success: true, subscription: { plan: sub.plan, multiplier: sub.multiplier, expiry: sub.expiry } });
        }
        res.json({ success: true, subscription: null });
    } catch (error) {
        console.error('[USER] Subscription error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/subscription', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { plan, price, multiplier, status, expiry, paymentMethod } = req.body;
        if (!plan || !price || !multiplier) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        const subscriptionData = {
            plan, price, multiplier, status: status || 'active',
            expiry: expiry || Date.now() + (30 * 24 * 60 * 60 * 1000),
            purchasedAt: Date.now(), date: new Date().toISOString(), paymentMethod: paymentMethod || 'balance'
        };
        await restPatch(`users/${userId}`, {
            subscription: subscriptionData, subscriptionMultiplier: multiplier, subscriptionExpiry: subscriptionData.expiry
        });
        await restPut(`subscriptions/${userId}`, subscriptionData);
        await restPost(`notifications/${userId}`, {
            title: '📋 Subscription Activated',
            message: `${plan} plan activated! ${multiplier}x profit multiplier applied for 30 days.`,
            type: 'success', read: false, timestamp: Date.now()
        });
        res.json({ success: true, subscription: subscriptionData });
    } catch (error) {
        console.error('[USER] Update subscription error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/status', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { isOnline } = req.body;
        await restPatch(`users/${userId}`, { isOnline: isOnline || false, lastSeen: Date.now() });
        res.json({ success: true, isOnline });
    } catch (error) {
        console.error('[USER] Status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({
            success: true,
            user: {
                id: userId, name: userData.name || userData.username || '',
                username: userData.username || '', country: userData.country || '',
                isOnline: userData.isOnline || false, lastSeen: userData.lastSeen || null,
                profilePicture: userData.profilePicture || '', isVerified: userData.isVerified || false
            }
        });
    } catch (error) {
        console.error('[USER] Get user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
