// functions/routes/leaderboard.js
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
// 1. GET LEADERBOARD
// ============================================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { period = 'daily', limit = 50 } = req.query;
        const userId = req.user.uid;

        // Get period start time
        const periodStart = getPeriodStart(period);

        // Get all users
        const usersSnap = await db.ref('users').once('value');
        if (!usersSnap.exists()) {
            return res.json({
                success: true,
                traders: [],
                stats: {
                    total: 0,
                    totalProfit: 0,
                    avgProfit: 0,
                    bestStreak: 0
                }
            });
        }

        const traders = [];
        const usersData = usersSnap.val();

        // Process each user
        for (const uid in usersData) {
            if (uid === userId) continue; // Skip current user for now

            const user = usersData[uid];
            const userProfit = await calculateUserProfit(db, uid, periodStart);

            if (userProfit.profit !== 0) {
                const level = getTraderLevel(userProfit.profit);
                traders.push({
                    uid: uid,
                    username: user.username || user.fullName || user.name || user.email?.split('@')[0] || 'Trader',
                    email: user.email || '',
                    profit: userProfit.profit,
                    winRate: userProfit.winRate,
                    bestStreak: userProfit.bestStreak,
                    isVerified: user.isMerchant || user.isVerified || false,
                    isOnline: user.isOnline || false,
                    level: level,
                    trades: userProfit.trades || 0
                });
            }
        }

        // Add current user
        const currentUserProfit = await calculateUserProfit(db, userId, periodStart);
        if (currentUserProfit.profit !== 0) {
            const level = getTraderLevel(currentUserProfit.profit);
            traders.push({
                uid: userId,
                username: 'You',
                email: req.user.email,
                profit: currentUserProfit.profit,
                winRate: currentUserProfit.winRate,
                bestStreak: currentUserProfit.bestStreak,
                isVerified: false,
                isOnline: true,
                isCurrentUser: true,
                level: level,
                trades: currentUserProfit.trades || 0
            });
        }

        // Sort by profit descending
        traders.sort((a, b) => b.profit - a.profit);

        // Calculate stats
        const totalTraders = traders.length;
        const totalProfit = traders.reduce((sum, t) => sum + t.profit, 0);
        const avgProfit = totalTraders > 0 ? totalProfit / totalTraders : 0;
        const bestStreak = Math.max(...traders.map(t => t.bestStreak), 0);

        // Get top 3 for podium
        const topThree = traders.slice(0, 3);

        // Get followers count for each trader
        for (const trader of traders) {
            const followersSnap = await db.ref(`followers/${trader.uid}`).once('value');
            trader.followers = followersSnap.exists() ? followersSnap.numChildren() : 0;
        }

        res.json({
            success: true,
            traders: traders.slice(0, parseInt(limit)),
            total: totalTraders,
            stats: {
                total: totalTraders,
                totalProfit: totalProfit,
                avgProfit: avgProfit,
                bestStreak: bestStreak
            },
            podium: topThree
        });

    } catch (error) {
        console.error('[LEADERBOARD] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET TRADER PROFILE
// ============================================================
router.get('/trader/:uid', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { uid } = req.params;
        const userId = req.user.uid;

        // Get user data
        const userSnap = await db.ref(`users/${uid}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Trader not found' });
        }

        const user = userSnap.val();

        // Get trader stats
        const statsRef = db.ref(`robotStats/${uid}`);
        const statsSnap = await statsRef.once('value');
        const stats = statsSnap.exists() ? statsSnap.val() : {};

        // Calculate total profit from stats
        let totalProfit = 0;
        let totalTrades = 0;
        let totalWins = 0;
        let totalLosses = 0;

        for (const robotId in stats) {
            const robot = stats[robotId];
            totalProfit += robot.profit || 0;
            totalTrades += robot.trades || 0;
            totalWins += robot.wins || 0;
            totalLosses += robot.losses || 0;
        }

        const winRate = (totalTrades > 0) ? (totalWins / totalTrades * 100) : 0;

        // Get follower count
        const followersSnap = await db.ref(`followers/${uid}`).once('value');
        const followerCount = followersSnap.exists() ? followersSnap.numChildren() : 0;

        // Check if current user follows this trader
        const followCheck = await db.ref(`followers/${uid}/${userId}`).once('value');
        const isFollowing = followCheck.exists();

        // Get trader's robots
        const robotsSnap = await db.ref(`userRobots/${uid}`).once('value');
        const robots = [];
        if (robotsSnap.exists()) {
            robotsSnap.forEach(child => {
                robots.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        const level = getTraderLevel(totalProfit);

        res.json({
            success: true,
            trader: {
                uid: uid,
                username: user.username || user.fullName || user.name || user.email?.split('@')[0] || 'Trader',
                email: user.email || '',
                fullName: user.fullName || user.name || '',
                country: user.country || '',
                profilePicture: user.profilePicture || '',
                isVerified: user.isMerchant || user.isVerified || false,
                isOnline: user.isOnline || false,
                joinedAt: user.createdAt || Date.now(),
                level: level,
                stats: {
                    totalProfit: totalProfit,
                    totalTrades: totalTrades,
                    winRate: winRate,
                    totalWins: totalWins,
                    totalLosses: totalLosses,
                    bestStreak: Math.max(...Object.values(stats).map(s => s.bestStreak || 0), 0)
                },
                followers: followerCount,
                isFollowing: isFollowing,
                robots: robots.slice(0, 5)
            }
        });

    } catch (error) {
        console.error('[LEADERBOARD] Trader profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. FOLLOW TRADER
// ============================================================
router.post('/follow', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { traderId } = req.body;

        if (!traderId) {
            return res.status(400).json({ success: false, error: 'Trader ID required' });
        }

        if (traderId === userId) {
            return res.status(400).json({ success: false, error: 'You cannot follow yourself' });
        }

        // Check if trader exists
        const traderSnap = await db.ref(`users/${traderId}`).once('value');
        if (!traderSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Trader not found' });
        }

        // Check if already following
        const followRef = db.ref(`followers/${traderId}/${userId}`);
        const followSnap = await followRef.once('value');

        if (followSnap.exists()) {
            return res.status(400).json({ success: false, error: 'Already following this trader' });
        }

        // Add follower
        await followRef.set({
            followerId: userId,
            followerName: req.user.email?.split('@')[0] || 'User',
            followedAt: Date.now()
        });

        // Get follower's name for notification
        const userSnap = await db.ref(`users/${userId}`).once('value');
        const userName = userSnap.exists() ? (userSnap.val().username || userSnap.val().fullName || req.user.email?.split('@')[0] || 'User') : 'User';

        // Add notification
        const notifRef = db.ref(`notifications/${traderId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: '👤 New Follower',
            message: `${userName} started following you!`,
            type: 'info',
            read: false,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Successfully followed trader'
        });

    } catch (error) {
        console.error('[LEADERBOARD] Follow error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. UNFOLLOW TRADER
// ============================================================
router.delete('/follow/:traderId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { traderId } = req.params;

        if (!traderId) {
            return res.status(400).json({ success: false, error: 'Trader ID required' });
        }

        const followRef = db.ref(`followers/${traderId}/${userId}`);
        const followSnap = await followRef.once('value');

        if (!followSnap.exists()) {
            return res.status(400).json({ success: false, error: 'Not following this trader' });
        }

        await followRef.remove();

        res.json({
            success: true,
            message: 'Successfully unfollowed trader'
        });

    } catch (error) {
        console.error('[LEADERBOARD] Unfollow error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. TOGGLE TRADE NOTIFICATIONS
// ============================================================
router.post('/notifications/toggle', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { traderId, enabled } = req.body;

        if (!traderId) {
            return res.status(400).json({ success: false, error: 'Trader ID required' });
        }

        const notifRef = db.ref(`tradeNotifications/${userId}/${traderId}`);

        if (enabled) {
            await notifRef.set({
                traderId: traderId,
                enabled: true,
                createdAt: Date.now()
            });
            return res.json({ success: true, message: 'Notifications enabled' });
        } else {
            await notifRef.remove();
            return res.json({ success: true, message: 'Notifications disabled' });
        }

    } catch (error) {
        console.error('[LEADERBOARD] Toggle notifications error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getPeriodStart(period) {
    const now = new Date();
    switch(period) {
        case 'daily':
            return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        case 'weekly':
            const startOfWeek = new Date(now);
            const day = now.getDay();
            startOfWeek.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
            startOfWeek.setHours(0, 0, 0, 0);
            return startOfWeek.getTime();
        case 'monthly':
            return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        case 'all':
        default:
            return 0;
    }
}

async function calculateUserProfit(db, uid, periodStart) {
    let profit = 0;
    let winCount = 0;
    let lossCount = 0;
    let streak = 0;
    let maxStreak = 0;
    let totalTrades = 0;

    try {
        const tradesRef = db.ref(`trades/${uid}`);
        const snapshot = await tradesRef.once('value');

        if (snapshot.exists()) {
            const trades = [];
            snapshot.forEach(child => {
                const trade = child.val();
                if (trade.status === 'closed') {
                    const closedAt = trade.closedAt || trade.timestamp || 0;
                    if (closedAt >= periodStart || periodStart === 0) {
                        const profitValue = trade.closedProfit || trade.pnl || trade.netReturn || 0;
                        trades.push({
                            profit: profitValue,
                            timestamp: closedAt
                        });
                    }
                }
            });

            trades.sort((a, b) => a.timestamp - b.timestamp);

            trades.forEach(trade => {
                totalTrades++;
                profit += trade.profit;
                if (trade.profit > 0) {
                    winCount++;
                    streak++;
                    maxStreak = Math.max(maxStreak, streak);
                } else if (trade.profit < 0) {
                    lossCount++;
                    streak = 0;
                }
            });
        }
    } catch (error) {
        console.error(`Error calculating profit for ${uid}:`, error);
    }

    const winRate = (winCount + lossCount) > 0 ? (winCount / (winCount + lossCount) * 100) : 0;

    return {
        profit: profit,
        winRate: winRate,
        bestStreak: maxStreak,
        trades: totalTrades,
        wins: winCount,
        losses: lossCount
    };
}

function getTraderLevel(profit) {
    if (profit >= 50000) return { name: 'Legendary', class: 'level-legendary' };
    if (profit >= 20000) return { name: 'Diamond', class: 'level-diamond' };
    if (profit >= 5000) return { name: 'Gold', class: 'level-gold' };
    if (profit >= 1000) return { name: 'Silver', class: 'level-silver' };
    return { name: 'Bronze', class: 'level-bronze' };
}

// ============================================================
// 6. GET FOLLOWING LIST
// ============================================================
router.get('/following', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const following = [];
        const snapshot = await db.ref(`followers`).once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const traderId = child.key;
                const followers = child.val();
                if (followers && followers[userId]) {
                    following.push({
                        traderId: traderId,
                        followedAt: followers[userId].followedAt || Date.now()
                    });
                }
            });
        }

        // Get trader details
        const traders = [];
        for (const follow of following) {
            const userSnap = await db.ref(`users/${follow.traderId}`).once('value');
            if (userSnap.exists()) {
                const user = userSnap.val();
                traders.push({
                    uid: follow.traderId,
                    username: user.username || user.fullName || user.name || user.email?.split('@')[0] || 'Trader',
                    email: user.email || '',
                    isOnline: user.isOnline || false,
                    isVerified: user.isMerchant || user.isVerified || false,
                    followedAt: follow.followedAt
                });
            }
        }

        traders.sort((a, b) => (b.followedAt || 0) - (a.followedAt || 0));

        res.json({
            success: true,
            following: traders
        });

    } catch (error) {
        console.error('[LEADERBOARD] Following list error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;