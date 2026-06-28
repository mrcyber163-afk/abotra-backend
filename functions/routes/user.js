// functions/routes/user.js
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
// 1. GET USER PROFILE
// ============================================================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = userSnap.val();

        res.json({
            success: true,
            user: {
                id: userId,
                email: user.email || req.user.email,
                name: user.name || user.fullName || user.username || '',
                username: user.username || '',
                phone: user.phone || '',
                country: user.country || 'Tanzania',
                balance: user.balance || 0,
                tradingBalance: user.tradingBalance || 0,
                isMerchant: user.isMerchant || false,
                isOnline: user.isOnline || false,
                lastSeen: user.lastSeen || null,
                totalOrders: user.totalOrders || 0,
                totalP2POrders: user.totalP2POrders || 0,
                createdAt: user.createdAt || Date.now(),
                profilePicture: user.profilePicture || '',
                referralCode: user.referralCode || '',
                referralCount: user.referralCount || 0,
                commissionEarned: user.commissionEarned || 0,
                isVerified: user.isVerified || false,
                phoneVerified: user.phoneVerified || false,
                kycStatus: user.kycStatus || 'none',
                privacyAcknowledged: user.privacyAcknowledged || false,
                termsAccepted: user.termsAccepted || false
            }
        });

    } catch (error) {
        console.error('[USER] Profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. UPDATE USER PROFILE
// ============================================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const db = getDB();
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

        await db.ref(`users/${userId}`).update(updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            updates: updates
        });

    } catch (error) {
        console.error('[USER] Update profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. UPDATE USER BALANCE
// ============================================================
router.put('/balance', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { amount, operation } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = userSnap.val();
        const currentBalance = userData.balance || 0;

        let newBalance;
        if (operation === 'subtract') {
            if (currentBalance < amount) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Insufficient balance. Need ${amount}, have ${currentBalance}` 
                });
            }
            newBalance = currentBalance - amount;
        } else {
            newBalance = currentBalance + amount;
        }

        await userRef.update({ balance: newBalance });

        res.json({
            success: true,
            newBalance: newBalance,
            amount: amount,
            operation: operation
        });

    } catch (error) {
        console.error('[USER] Update balance error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET USER SUBSCRIPTION
// ============================================================
router.get('/subscription', verifyToken, async (req, res) => {
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
        console.error('[USER] Subscription error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. UPDATE USER SUBSCRIPTION
// ============================================================
router.post('/subscription', verifyToken, async (req, res) => {
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

        const userRef = db.ref(`users/${userId}`);
        await userRef.update({
            subscription: subscriptionData,
            subscriptionMultiplier: multiplier,
            subscriptionExpiry: subscriptionData.expiry
        });

        const subRef = db.ref(`subscriptions/${userId}`);
        await subRef.set(subscriptionData);

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
        console.error('[USER] Update subscription error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. UPDATE ONLINE STATUS
// ============================================================
router.put('/status', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { isOnline } = req.body;

        await db.ref(`users/${userId}`).update({
            isOnline: isOnline || false,
            lastSeen: Date.now()
        });

        res.json({
            success: true,
            isOnline: isOnline
        });

    } catch (error) {
        console.error('[USER] Status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. GET USER BY ID (Public)
// ============================================================
router.get('/:userId', async (req, res) => {
    try {
        const db = getDB();
        const { userId } = req.params;

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = userSnap.val();

        res.json({
            success: true,
            user: {
                id: userId,
                name: user.name || user.username || '',
                username: user.username || '',
                country: user.country || '',
                isOnline: user.isOnline || false,
                lastSeen: user.lastSeen || null,
                profilePicture: user.profilePicture || '',
                isVerified: user.isVerified || false
            }
        });

    } catch (error) {
        console.error('[USER] Get user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. GET REFERRAL STATS
// ============================================================
router.get('/referral/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.json({ success: true, referrals: [], total: 0, commission: 0 });
        }

        const userData = userSnap.val();
        const referrals = userData.referrals || [];
        const totalCommission = userData.commissionEarned || 0;

        const referralDetails = [];
        for (const refId of referrals) {
            const refSnap = await db.ref(`users/${refId}`).once('value');
            if (refSnap.exists()) {
                const refData = refSnap.val();
                referralDetails.push({
                    id: refId,
                    name: refData.name || refData.username || '',
                    email: refData.email || '',
                    joinedAt: refData.createdAt || Date.now(),
                    commission: refData.commissionEarned || 0
                });
            }
        }

        res.json({
            success: true,
            referrals: referralDetails,
            total: referralDetails.length,
            commission: totalCommission
        });

    } catch (error) {
        console.error('[USER] Referral stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. CHECK PRIVACY ACKNOWLEDGMENT
// ============================================================
router.get('/privacy-status', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const privacySnap = await db.ref(`userPrivacy/${userId}`).once('value');
        
        if (privacySnap.exists()) {
            const data = privacySnap.val();
            return res.json({
                success: true,
                acknowledged: data.acknowledged === true,
                version: data.version || '1.0',
                acknowledgedAt: data.acknowledgedAt || null
            });
        }

        res.json({
            success: true,
            acknowledged: false,
            version: null,
            acknowledgedAt: null
        });

    } catch (error) {
        console.error('[USER] Privacy status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 10. ACKNOWLEDGE PRIVACY
// ============================================================
router.post('/acknowledge-privacy', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        await db.ref(`userPrivacy/${userId}`).set({
            acknowledged: true,
            acknowledgedAt: Date.now(),
            version: '2.0',
            userId: userId,
            email: req.user.email
        });

        // Update user profile
        await db.ref(`users/${userId}`).update({
            privacyAcknowledged: true,
            privacyAcknowledgedAt: Date.now()
        });

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: 'Privacy Policy Acknowledged',
            message: 'You have acknowledged the Privacy Policy.',
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Privacy policy acknowledged'
        });

    } catch (error) {
        console.error('[USER] Acknowledge privacy error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 11. CHECK TERMS ACCEPTANCE
// ============================================================
router.get('/terms-status', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const termsSnap = await db.ref(`userTerms/${userId}`).once('value');
        
        if (termsSnap.exists()) {
            const data = termsSnap.val();
            return res.json({
                success: true,
                accepted: data.accepted === true,
                version: data.version || '1.0',
                acceptedAt: data.acceptedAt || null
            });
        }

        res.json({
            success: true,
            accepted: false,
            version: null,
            acceptedAt: null
        });

    } catch (error) {
        console.error('[USER] Terms status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 12. ACCEPT TERMS
// ============================================================
router.post('/accept-terms', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        await db.ref(`userTerms/${userId}`).set({
            accepted: true,
            acceptedAt: Date.now(),
            version: '2.0',
            userId: userId,
            email: req.user.email
        });

        // Update user profile
        await db.ref(`users/${userId}`).update({
            termsAccepted: true,
            termsAcceptedAt: Date.now()
        });

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: 'Terms Accepted',
            message: 'You have accepted the Terms & Conditions.',
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Terms accepted'
        });

    } catch (error) {
        console.error('[USER] Accept terms error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;