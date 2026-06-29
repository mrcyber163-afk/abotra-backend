// ============================================================
// AFFILIATE ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete } = require('../firebase');

async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
        const { authGetUser } = require('../firebase');
        const userInfo = await authGetUser(token);
        
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        
        req.user = {
            uid: userInfo.users[0].localId,
            email: userInfo.users[0].email
        };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET REFERRALS
// ============================================================
router.get('/referrals', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const referrals = [];
        let depositCommission = 0;
        let botCommission = 0;

        const usersData = await restGet('users');
        if (usersData) {
            for (const uid in usersData) {
                const user = usersData[uid];
                if (user.referredBy === userId) {
                    const totalDeposit = user.totalDeposited || 0;
                    const depositComm = totalDeposit * 0.05;
                    const botDailyProfit = user.dailyBotProfitToday || 0;
                    const botComm = botDailyProfit * 0.01;
                    
                    depositCommission += depositComm;
                    botCommission += botComm;
                    
                    referrals.push({
                        id: uid,
                        name: user.username || user.fullName || user.email?.split('@')[0] || 'User',
                        email: user.email,
                        totalDeposit: totalDeposit,
                        depositCommission: depositComm,
                        botDailyProfit: botDailyProfit,
                        botCommission: botComm,
                        joinedAt: user.createdAt || Date.now(),
                        isVerified: user.isVerified || false,
                        commission: depositComm + botComm
                    });
                }
            }
        }

        referrals.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

        res.json({
            success: true,
            referrals: referrals,
            total: referrals.length,
            depositCommission: depositCommission,
            botCommission: botCommission,
            commission: depositCommission + botCommission
        });

    } catch (error) {
        console.error('[AFFILIATE] Referrals error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET TEAM STRUCTURE
// ============================================================
router.get('/team', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const members = [];
        let level1Count = 0, level2Count = 0, level3Count = 0;

        const usersData = await restGet('users');
        if (!usersData) {
            return res.json({ success: true, members: [], level1: 0, level2: 0, level3: 0 });
        }

        const userMap = new Map();
        for (const uid in usersData) {
            const user = usersData[uid];
            userMap.set(uid, {
                uid: uid,
                name: user.username || user.fullName || user.email?.split('@')[0] || 'User',
                referredBy: user.referredBy,
                totalDeposit: user.totalDeposited || 0,
                isVerified: user.isVerified || false,
                botDailyProfit: user.dailyBotProfitToday || 0
            });
        }

        const level1Users = [];
        for (const [uid, user] of userMap.entries()) {
            if (user.referredBy === userId) {
                level1Count++;
                const depositCommission = user.totalDeposit * 0.05;
                const botCommission = user.botDailyProfit * 0.01;
                members.push({
                    ...user,
                    level: 1,
                    depositCommission: depositCommission,
                    botCommission: botCommission,
                    commission: depositCommission + botCommission
                });
                level1Users.push(uid);
            }
        }

        const level2Users = [];
        for (const level1Uid of level1Users) {
            for (const [uid, user] of userMap.entries()) {
                if (user.referredBy === level1Uid && uid !== userId) {
                    level2Count++;
                    const commission = user.totalDeposit * 0.02;
                    members.push({
                        ...user,
                        level: 2,
                        commission: commission,
                        totalCommission: commission
                    });
                    level2Users.push(uid);
                }
            }
        }

        for (const level2Uid of level2Users) {
            for (const [uid, user] of userMap.entries()) {
                if (user.referredBy === level2Uid && uid !== userId) {
                    level3Count++;
                    const commission = user.totalDeposit * 0.01;
                    members.push({
                        ...user,
                        level: 3,
                        commission: commission,
                        totalCommission: commission
                    });
                }
            }
        }

        members.sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            return a.name.localeCompare(b.name);
        });

        res.json({
            success: true,
            members: members,
            level1: level1Count,
            level2: level2Count,
            level3: level3Count
        });

    } catch (error) {
        console.error('[AFFILIATE] Team error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET LEADERBOARD
// ============================================================
router.get('/leaderboard', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const leaders = [];

        const usersData = await restGet('users');
        if (usersData) {
            for (const uid in usersData) {
                const user = usersData[uid];
                if (user.referralCode) {
                    let referralCount = 0;
                    for (const otherUid in usersData) {
                        if (usersData[otherUid] && usersData[otherUid].referredBy === uid) {
                            referralCount++;
                        }
                    }
                    const totalCommission = (user.depositCommissionEarned || 0) + (user.botProfitCommissionEarned || 0);
                    leaders.push({
                        uid: uid,
                        name: user.username || user.fullName || user.email?.split('@')[0] || 'User',
                        commission: totalCommission,
                        referralCount: referralCount,
                        isVerified: user.isVerified || false
                    });
                }
            }
        }

        leaders.sort((a, b) => b.commission - a.commission);

        res.json({
            success: true,
            leaders: leaders.slice(0, 20)
        });

    } catch (error) {
        console.error('[AFFILIATE] Leaderboard error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. WITHDRAW COMMISSION
// ============================================================
router.post('/withdraw', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        if (amount < 20) {
            return res.status(400).json({ success: false, error: 'Minimum withdrawal is $20' });
        }

        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const totalCommission = (userData.depositCommissionEarned || 0) + (userData.botProfitCommissionEarned || 0);
        const withdrawn = userData.affiliateWithdrawn || 0;
        const affiliateBalance = totalCommission - withdrawn;

        if (amount > affiliateBalance) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Available: $${affiliateBalance.toFixed(2)}` 
            });
        }

        const fee = amount * 0.1;
        const receiveAmount = amount * 0.9;

        await restPatch(`users/${userId}`, {
            affiliateWithdrawn: withdrawn + amount,
            lastWithdrawal: Date.now()
        });

        const withdrawalId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        await restPut(`adminWithdrawals/${withdrawalId}`, {
            id: withdrawalId,
            userId: userId,
            userEmail: userData.email || req.user.email,
            type: 'affiliate_commission',
            amount: amount,
            fee: fee,
            receiveAmount: receiveAmount,
            status: 'pending',
            createdAt: Date.now(),
            date: new Date().toISOString()
        });

        await restPost(`notifications/${userId}`, {
            title: '💰 Withdrawal Request Submitted',
            message: `Your affiliate commission withdrawal of $${amount.toFixed(2)} has been submitted. You will receive $${receiveAmount.toFixed(2)} USDT after 10% fee.`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            message: 'Withdrawal request submitted',
            amount: amount,
            fee: fee,
            receiveAmount: receiveAmount
        });

    } catch (error) {
        console.error('[AFFILIATE] Withdraw error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
