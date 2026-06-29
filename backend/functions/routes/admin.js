// functions/routes/admin.js
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
// MIDDLEWARE: Check Admin
// ============================================================
async function checkAdmin(req, res, next) {
    try {
        const db = getDB();
        const adminSnap = await db.ref('admins').once('value');
        const adminList = adminSnap.val() || [];
        
        // Check both formats: admins/uid: true OR admins/uid: { email: "..." }
        let isAdmin = false;
        for (const key in adminList) {
            const adminEntry = adminList[key];
            if (adminEntry === true && key === req.user.uid) {
                isAdmin = true;
                break;
            }
            if (typeof adminEntry === 'object' && (adminEntry.email === req.user.email || adminEntry.uid === req.user.uid)) {
                isAdmin = true;
                break;
            }
        }
        
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

// ============================================================
// 1. GET DASHBOARD STATS
// ============================================================
router.get('/dashboard-stats', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const stats = {
            totalUsers: 0,
            totalDeposits: 0,
            pendingDeposits: 0,
            totalWithdrawals: 0,
            pendingWithdrawals: 0,
            totalBalance: 0,
            totalVolume: 0,
            activeRobots: 0,
            totalTrades: 0,
            platformProfit: 0,
            totalKYC: 0,
            pendingKYC: 0
        };

        // Get users
        const usersSnap = await db.ref('users').once('value');
        if (usersSnap.exists()) {
            let totalBalance = 0;
            usersSnap.forEach(child => {
                stats.totalUsers++;
                totalBalance += child.val().balance || 0;
            });
            stats.totalBalance = totalBalance;
        }

        // Get deposits
        const depositsSnap = await db.ref('adminDeposits').once('value');
        if (depositsSnap.exists()) {
            depositsSnap.forEach(child => {
                const dep = child.val();
                if (dep.status === 'approved' || dep.status === 'completed' || dep.status === 'verified') {
                    stats.totalDeposits += dep.amount || 0;
                }
                if (dep.status === 'pending') {
                    stats.pendingDeposits++;
                }
            });
        }

        // Get withdrawals
        const withdrawalsSnap = await db.ref('adminWithdrawals').once('value');
        if (withdrawalsSnap.exists()) {
            withdrawalsSnap.forEach(child => {
                const w = child.val();
                if (w.status === 'approved' || w.status === 'completed') {
                    stats.totalWithdrawals += w.amount || 0;
                }
                if (w.status === 'pending') {
                    stats.pendingWithdrawals++;
                }
            });
        }

        // Get KYC
        const kycSnap = await db.ref('kyc').once('value');
        if (kycSnap.exists()) {
            kycSnap.forEach(child => {
                const kyc = child.val();
                stats.totalKYC++;
                if (kyc.status === 'pending') {
                    stats.pendingKYC++;
                }
            });
        }

        // Get pending KYC from pendingKyc node
        const pendingKycSnap = await db.ref('pendingKyc').once('value');
        if (pendingKycSnap.exists()) {
            // Override pendingKYC count with actual pending submissions
            let pendingCount = 0;
            pendingKycSnap.forEach(() => pendingCount++);
            stats.pendingKYC = pendingCount;
        }

        // Get platform profit
        const profitSnap = await db.ref('platformProfit').once('value');
        if (profitSnap.exists()) {
            stats.platformProfit = profitSnap.val() || 0;
        }

        // Get platform stats
        const platformStatsSnap = await db.ref('platformStats').once('value');
        if (platformStatsSnap.exists()) {
            const ps = platformStatsSnap.val();
            stats.totalFeesCollected = ps.totalFeesCollected || 0;
            stats.totalPerformanceFees = ps.totalPerformanceFees || 0;
        }

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[ADMIN] Dashboard stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET ALL USERS (With pagination)
// ============================================================
router.get('/users', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { limit = 50, offset = 0, search = '', status = 'all' } = req.query;
        const users = [];

        const snapshot = await db.ref('users').once('value');
        
        if (snapshot.exists()) {
            const usersData = snapshot.val();
            
            for (const [uid, user] of Object.entries(usersData)) {
                // Get KYC status
                const kycSnap = await db.ref(`kyc/${uid}`).once('value');
                let kycStatus = 'none';
                if (kycSnap.exists()) {
                    kycStatus = kycSnap.val().status || 'none';
                }
                
                // Check if user is merchant
                const merchantSnap = await db.ref(`merchants`).orderByChild('userId').equalTo(uid).once('value');
                let isMerchant = false;
                if (merchantSnap.exists()) {
                    merchantSnap.forEach(() => { isMerchant = true; });
                }
                
                const searchable = (user.email || '').toLowerCase() + 
                                  (user.name || '').toLowerCase() + 
                                  (user.username || '').toLowerCase();
                
                if (search && !searchable.includes(search.toLowerCase())) continue;
                
                if (status === 'active' && user.status === 'suspended') continue;
                if (status === 'suspended' && user.status !== 'suspended') continue;
                
                users.push({
                    uid: uid,
                    email: user.email || '',
                    name: user.name || user.username || user.fullName || '',
                    username: user.username || '',
                    phone: user.phone || '',
                    country: user.country || 'Tanzania',
                    balance: user.balance || 0,
                    tradingBalance: user.tradingBalance || 0,
                    status: user.status || 'active',
                    isVerified: user.isVerified || false,
                    isMerchant: isMerchant || user.isMerchant || false,
                    isOnline: user.isOnline || false,
                    kycStatus: kycStatus,
                    createdAt: user.createdAt || Date.now(),
                    lastActive: user.lastActive || null,
                    totalDeposited: user.totalDeposited || 0,
                    totalWithdrawn: user.totalWithdrawn || 0,
                    referralCode: user.referralCode || '',
                    referralCount: user.referralCount || 0
                });
            }
        }

        // Sort by createdAt descending
        users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const paginatedUsers = users.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            success: true,
            users: paginatedUsers,
            total: users.length,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });

    } catch (error) {
        console.error('[ADMIN] Get users error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. SUSPEND/ACTIVATE USER
// ============================================================
router.put('/users/:uid/status', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { uid } = req.params;
        const { status } = req.body;

        if (!uid || !status) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (status !== 'active' && status !== 'suspended') {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const userRef = db.ref(`users/${uid}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await userRef.update({
            status: status,
            statusUpdatedAt: Date.now(),
            statusUpdatedBy: req.user.email
        });

        // Add notification
        const notifRef = db.ref(`notifications/${uid}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: status === 'active' ? '✅ Account Activated' : '⛔ Account Suspended',
            message: status === 'active' 
                ? 'Your account has been reactivated. You can now trade again.' 
                : 'Your account has been suspended. Please contact support for more information.',
            type: status === 'active' ? 'success' : 'error',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: `User ${status === 'active' ? 'activated' : 'suspended'} successfully`
        });

    } catch (error) {
        console.error('[ADMIN] Update user status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. DELETE USER
// ============================================================
router.delete('/users/:uid', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { uid } = req.params;

        const userRef = db.ref(`users/${uid}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Delete user data from all nodes
        const deletePaths = [
            `users/${uid}`,
            `trades/${uid}`,
            `user_trades/${uid}`,
            `userRobots/${uid}`,
            `robotStats/${uid}`,
            `tradingLogs/${uid}`,
            `notifications/${uid}`,
            `kyc/${uid}`,
            `pendingKyc/${uid}`,
            `deposits/${uid}`,
            `user_deposits/${uid}`,
            `withdrawals/${uid}`,
            `subscriptions/${uid}`,
            `userPrivacy/${uid}`,
            `userTerms/${uid}`,
            `watchlist/${uid}`,
            `biometric/${uid}`,
            `copiedTrades/${uid}`,
            `affiliateCommission/${uid}`,
            `performanceFees/${uid}`,
            `tradeNotifications/${uid}`
        ];

        for (const path of deletePaths) {
            await db.ref(path).remove().catch(() => {});
        }

        // Delete from merchants if exists
        const merchantSnap = await db.ref('merchants').orderByChild('userId').equalTo(uid).once('value');
        if (merchantSnap.exists()) {
            merchantSnap.forEach(child => {
                db.ref(`merchants/${child.key}`).remove().catch(() => {});
            });
        }

        // Delete from admin list if exists
        const adminSnap = await db.ref('admins').once('value');
        if (adminSnap.exists()) {
            const admins = adminSnap.val();
            for (const key in admins) {
                const admin = admins[key];
                if (admin === true && key === uid) {
                    await db.ref(`admins/${key}`).remove().catch(() => {});
                }
                if (typeof admin === 'object' && admin.uid === uid) {
                    await db.ref(`admins/${key}`).remove().catch(() => {});
                }
            }
        }

        res.json({
            success: true,
            message: 'User and all associated data deleted successfully'
        });

    } catch (error) {
        console.error('[ADMIN] Delete user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GRANT/REMOVE VERIFIED BADGE
// ============================================================
router.put('/users/:uid/verify', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { uid } = req.params;
        const { isVerified } = req.body;

        if (!uid) {
            return res.status(400).json({ success: false, error: 'User ID required' });
        }

        const userRef = db.ref(`users/${uid}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await userRef.update({
            isVerified: isVerified === true,
            verifiedAt: isVerified ? Date.now() : null,
            verifiedBy: req.user.email
        });

        const notifRef = db.ref(`notifications/${uid}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: isVerified ? '✅ Blue Tick Badge Granted!' : '❌ Blue Tick Badge Removed',
            message: isVerified 
                ? 'Congratulations! You have been awarded the verified blue tick badge.' 
                : 'Your verified badge has been removed.',
            type: isVerified ? 'success' : 'error',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: `User ${isVerified ? 'verified' : 'unverified'} successfully`
        });

    } catch (error) {
        console.error('[ADMIN] Verify user error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET SYSTEM LOGS
// ============================================================
router.get('/logs', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { limit = 100, type = 'all' } = req.query;
        const logs = [];

        // Get error logs
        if (type === 'all' || type === 'error') {
            const errorSnap = await db.ref('error_logs')
                .orderByChild('timestamp')
                .limitToLast(parseInt(limit))
                .once('value');
            
            if (errorSnap.exists()) {
                errorSnap.forEach(child => {
                    logs.push({
                        id: child.key,
                        ...child.val(),
                        logType: 'error'
                    });
                });
            }
        }

        // Sort by timestamp
        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            logs: logs.slice(0, parseInt(limit))
        });

    } catch (error) {
        console.error('[ADMIN] Get logs error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. GET SYSTEM STATS (Detailed)
// ============================================================
router.get('/system-stats', verifyToken, checkAdmin, async (req, res) => {
    try {
        const db = getDB();
        const stats = {};

        // Get all nodes
        const nodes = ['users', 'trades', 'p2p_offers', 'p2p_orders', 'masterTrades', 'robots_list'];
        
        for (const node of nodes) {
            const snap = await db.ref(node).once('value');
            stats[node] = snap.exists() ? snap.numChildren() : 0;
        }

        // Get platform profit
        const profitSnap = await db.ref('platformProfit').once('value');
        stats.platformProfit = profitSnap.exists() ? profitSnap.val() : 0;

        // Get total fees
        const feesSnap = await db.ref('platformStats').once('value');
        if (feesSnap.exists()) {
            const fees = feesSnap.val();
            stats.totalFeesCollected = fees.totalFeesCollected || 0;
            stats.totalPerformanceFees = fees.totalPerformanceFees || 0;
            stats.totalOpenFees = fees.totalOpenFees || 0;
            stats.totalCloseFees = fees.totalCloseFees || 0;
            stats.totalLeverageFees = fees.totalLeverageFees || 0;
        }

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[ADMIN] System stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;