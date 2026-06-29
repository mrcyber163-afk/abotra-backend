// ============================================================
// SUBSCRIPTION - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch } = require('../firebase');
const { authGetUser } = require('../firebase');

async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '')) {
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

router.get('/', verifyToken, async (req, res) => {
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
        console.error('[SUBSCRIPTION] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { plan, price, multiplier, status, expiry, paymentMethod } = req.body;
        if (!plan || !price || !multiplier) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const subscriptionData = {
            plan, price, multiplier,
            status: status || 'active',
            expiry: expiry || Date.now() + (30 * 24 * 60 * 60 * 1000),
            purchasedAt: Date.now(),
            date: new Date().toISOString(),
            paymentMethod: paymentMethod || 'balance'
        };

        await restPatch(`users/${userId}`, {
            subscription: subscriptionData,
            subscriptionMultiplier: multiplier,
            subscriptionExpiry: subscriptionData.expiry
        });
        await restPut(`subscriptions/${userId}`, subscriptionData);

        await restPost(`notifications/${userId}`, {
            title: '📋 Subscription Activated',
            message: `${plan} plan activated! ${multiplier}x profit multiplier applied for 30 days.`,
            type: 'success', read: false, timestamp: Date.now()
        });

        res.json({ success: true, subscription: subscriptionData });
    } catch (error) {
        console.error('[SUBSCRIPTION] Create error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.delete('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        await restPatch(`users/${userId}`, { subscription: null, subscriptionMultiplier: 1, subscriptionExpiry: null });
        await restDelete(`subscriptions/${userId}`);
        res.json({ success: true, message: 'Subscription cancelled' });
    } catch (error) {
        console.error('[SUBSCRIPTION] Cancel error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/plans', async (req, res) => {
    try {
        const plans = [
            { id: 1, name: "BASIC", price: 10, multiplier: 1.5, features: ["Up to $10,000 monthly volume", "1 AI Robot active", "Basic support", "2% trading fee", "1.5x profit multiplier"], popular: false },
            { id: 2, name: "PRO", price: 30, multiplier: 3, features: ["Up to $50,000 monthly volume", "3 AI Robots active", "Priority support", "1% trading fee", "3x profit multiplier", "Advanced analytics", "API access"], popular: true },
            { id: 3, name: "VIP", price: 100, multiplier: 5, features: ["Unlimited monthly volume", "7 AI Robots active", "24/7 Dedicated support", "0.5% trading fee", "5x profit multiplier", "Advanced analytics + AI predictions", "Full API access + Webhooks", "Early access to new features", "Monthly consultation call"], popular: false }
        ];
        res.json({ success: true, plans });
    } catch (error) {
        console.error('[SUBSCRIPTION] Plans error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || (adminList.includes && adminList.includes(userId)));
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });

        const stats = { totalSubscriptions: 0, activeSubscriptions: 0, revenue: 0, plans: {} };
        const data = await restGet('subscriptions');
        if (data) {
            Object.values(data).forEach(sub => {
                stats.totalSubscriptions++;
                if (sub.expiry > Date.now()) stats.activeSubscriptions++;
                stats.revenue += sub.price || 0;
                if (!stats.plans[sub.plan]) stats.plans[sub.plan] = { count: 0, revenue: 0 };
                stats.plans[sub.plan].count++;
                stats.plans[sub.plan].revenue += sub.price || 0;
            });
        }
        res.json({ success: true, stats });
    } catch (error) {
        console.error('[SUBSCRIPTION] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
