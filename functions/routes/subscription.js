// functions/routes/subscription.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

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
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET USER SUBSCRIPTION
// ============================================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.json({ success: true, subscription: null });
        }

        const userData = userSnap.val();
        const sub = userData.subscription;

        if (sub && sub.expiry > Date.now()) {
            return res.json({
                success: true,
                subscription: {
                    plan: sub.plan,
                    multiplier: sub.multiplier,
                    expiry: sub.expiry
                }
            });
        }

        res.json({
            success: true,
            subscription: null
        });

    } catch (error) {
        console.error('[SUBSCRIPTION] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. CREATE/UPDATE SUBSCRIPTION
// ============================================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { plan, price, multiplier, status, expiry, paymentMethod } = req.body;

        if (!plan || !price || !multiplier) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const subscriptionData = {
            plan: plan,
            price: price,
            multiplier: multiplier,
            status: status || 'active',
            expiry: expiry || Date.now() + (30 * 24 * 60 * 60 * 1000),
            purchasedAt: Date.now(),
            date: new Date().toISOString(),
            paymentMethod: paymentMethod || 'balance'
        };

        // Update user in RTDB
        const userRef = db.ref(`users/${userId}`);
        await userRef.update({
            subscription: subscriptionData,
            subscriptionMultiplier: multiplier,
            subscriptionExpiry: subscriptionData.expiry
        });

        // Save to subscriptions collection
        const subRef = db.ref(`subscriptions/${userId}`);
        await subRef.set(subscriptionData);

        // Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '📋 Subscription Activated',
            message: `${plan} plan activated! ${multiplier}x profit multiplier applied to all your AI robots for 30 days.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            subscription: subscriptionData
        });

    } catch (error) {
        console.error('[SUBSCRIPTION] Create error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. CANCEL SUBSCRIPTION
// ============================================================
router.delete('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userRef = db.ref(`users/${userId}`);
        await userRef.update({
            subscription: null,
            subscriptionMultiplier: 1,
            subscriptionExpiry: null
        });

        await db.ref(`subscriptions/${userId}`).remove();

        res.json({
            success: true,
            message: 'Subscription cancelled'
        });

    } catch (error) {
        console.error('[SUBSCRIPTION] Cancel error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET ALL PLANS (Public)
// ============================================================
router.get('/plans', async (req, res) => {
    try {
        const plans = [
            { id: 1, name: "BASIC", price: 10, multiplier: 1.5, features: ["Up to $10,000 monthly volume", "1 AI Robot active", "Basic support", "2% trading fee", "1.5x profit multiplier"], popular: false },
            { id: 2, name: "PRO", price: 30, multiplier: 3, features: ["Up to $50,000 monthly volume", "3 AI Robots active", "Priority support", "1% trading fee", "3x profit multiplier", "Advanced analytics", "API access"], popular: true },
            { id: 3, name: "VIP", price: 100, multiplier: 5, features: ["Unlimited monthly volume", "7 AI Robots active", "24/7 Dedicated support", "0.5% trading fee", "5x profit multiplier", "Advanced analytics + AI predictions", "Full API access + Webhooks", "Early access to new features", "Monthly consultation call"], popular: false }
        ];

        res.json({
            success: true,
            plans: plans
        });

    } catch (error) {
        console.error('[SUBSCRIPTION] Plans error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET SUBSCRIPTION STATS (Admin only)
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Check if admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const stats = {
            totalSubscriptions: 0,
            activeSubscriptions: 0,
            revenue: 0,
            plans: {}
        };

        const snapshot = await db.ref('subscriptions').once('value');
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const sub = child.val();
                stats.totalSubscriptions++;
                if (sub.expiry > Date.now()) {
                    stats.activeSubscriptions++;
                }
                stats.revenue += sub.price || 0;
                
                if (!stats.plans[sub.plan]) {
                    stats.plans[sub.plan] = { count: 0, revenue: 0 };
                }
                stats.plans[sub.plan].count++;
                stats.plans[sub.plan].revenue += sub.price || 0;
            });
        }

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[SUBSCRIPTION] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;