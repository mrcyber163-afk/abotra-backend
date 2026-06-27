// functions/routes/copy-trading.js
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
// 1. GET LATEST MASTER TRADE
// ============================================================
router.get('/latest', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const snapshot = await db.ref('masterTrades')
            .orderByChild('createdAt')
            .limitToLast(1)
            .once('value');

        let trade = null;
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                trade = { id: child.key, ...child.val() };
            });
        }

        // If no trade found, return empty
        if (!trade) {
            return res.json({
                success: true,
                trade: null,
                message: 'No master trades available'
            });
        }

        // Check if trade is expired
        const EXPIRY_HOURS = 6;
        const EXPIRY_MS = EXPIRY_HOURS * 60 * 60 * 1000;
        const now = Date.now();
        const tradeAge = now - (trade.createdAt || 0);
        
        if (tradeAge > EXPIRY_MS) {
            // Mark as inactive if expired
            await db.ref(`masterTrades/${trade.id}`).update({ status: 'inactive' });
            return res.json({
                success: true,
                trade: null,
                message: 'Latest trade has expired'
            });
        }

        // Only return active trades
        if (trade.status === 'inactive' || trade.status === 'closed') {
            return res.json({
                success: true,
                trade: null,
                message: 'No active master trades'
            });
        }

        res.json({
            success: true,
            trade: trade
        });

    } catch (error) {
        console.error('[COPY] Get latest error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. COPY TRADE
// ============================================================
router.post('/copy', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { tradeId } = req.body;

        if (!tradeId) {
            return res.status(400).json({ success: false, error: 'Trade ID required' });
        }

        // Get master trade
        const masterRef = db.ref(`masterTrades/${tradeId}`);
        const masterSnap = await masterRef.once('value');
        if (!masterSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Master trade not found' });
        }

        const masterTrade = masterSnap.val();

        // Check if trade is expired
        const EXPIRY_HOURS = 6;
        const EXPIRY_MS = EXPIRY_HOURS * 60 * 60 * 1000;
        const now = Date.now();
        const tradeAge = now - (masterTrade.createdAt || 0);
        
        if (tradeAge > EXPIRY_MS) {
            return res.status(400).json({ 
                success: false, 
                error: `Trade has expired after ${EXPIRY_HOURS} hours` 
            });
        }

        if (masterTrade.status === 'inactive' || masterTrade.status === 'closed') {
            return res.status(400).json({ success: false, error: 'Trade is no longer active' });
        }

        // Check user balance
        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userData = userSnap.val();
        const userBalance = userData.balance || 0;

        if (userBalance < masterTrade.amount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need $${masterTrade.amount}, have $${userBalance}` 
            });
        }

        // Deduct balance
        await userRef.update({
            balance: userBalance - masterTrade.amount
        });

        // Create copied trade
        const copiedTradeRef = db.ref(`copiedTrades/${userId}`).push();
        const copiedTradeId = copiedTradeRef.key;

        const copiedTradeData = {
            id: copiedTradeId,
            originalTradeId: tradeId,
            masterTradeId: tradeId,
            type: masterTrade.type,
            amount: masterTrade.amount,
            leverage: masterTrade.leverage,
            entryPrice: masterTrade.entryPrice,
            takeProfit: masterTrade.takeProfit || null,
            stopLoss: masterTrade.stopLoss || null,
            status: 'active',
            copiedAt: Date.now(),
            createdAt: masterTrade.createdAt,
            note: masterTrade.note || '',
            performanceFeeApplied: false,
            isCopiedTrade: true,
            performanceFeePercent: 0.10
        };
        await copiedTradeRef.set(copiedTradeData);

        // Update master trade followers
        const currentFollowers = masterTrade.totalFollowers || 0;
        const currentVolume = masterTrade.totalVolume || 0;
        await masterRef.update({
            totalFollowers: currentFollowers + 1,
            totalVolume: currentVolume + masterTrade.amount
        });

        // Create user trade record
        const userTradeRef = db.ref(`trades/${userId}`).push();
        const userTradeId = userTradeRef.key;
        await userTradeRef.set({
            id: userTradeId,
            type: masterTrade.type,
            margin: masterTrade.amount,
            amount: masterTrade.amount,
            leverage: masterTrade.leverage,
            entryPrice: masterTrade.entryPrice,
            takeProfit: masterTrade.takeProfit || null,
            stopLoss: masterTrade.stopLoss || null,
            status: 'open',
            createdAt: Date.now(),
            timestamp: Date.now(),
            copiedFrom: tradeId,
            isCopiedTrade: true,
            originalTradeId: tradeId,
            symbol: 'BTC/USDT',
            positionValue: masterTrade.amount * masterTrade.leverage,
            openDate: new Date().toISOString(),
            performanceFeePending: true,
            performanceFeePercent: 0.10,
            liquidationPrice: masterTrade.entryPrice * (1 - 0.005),
            openFee: 0
        });

        // Create performance fee tracking
        const perfFeeRef = db.ref(`performanceFees/${userId}/${userTradeId}`);
        await perfFeeRef.set({
            tradeId: userTradeId,
            masterTradeId: tradeId,
            amount: masterTrade.amount,
            entryPrice: masterTrade.entryPrice,
            type: masterTrade.type,
            leverage: masterTrade.leverage,
            feePercent: 0.10,
            status: 'open',
            createdAt: Date.now()
        });

        // Add notification
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: '✅ Master Trade Copied Successfully',
            message: `You successfully copied ${masterTrade.type === 'BUY' ? '📈 LONG' : '📉 SHORT'} trade of $${masterTrade.amount} with ${masterTrade.leverage}x leverage! 10% performance fee applies on profits.`,
            type: 'success',
            read: false,
            timestamp: Date.now(),
            link: 'trade.html'
        });

        res.json({
            success: true,
            message: 'Trade copied successfully',
            copiedTradeId: copiedTradeId,
            userTradeId: userTradeId
        });

    } catch (error) {
        console.error('[COPY] Copy error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET USER COPIED TRADES
// ============================================================
router.get('/my-copies', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const copies = [];

        const snapshot = await db.ref(`copiedTrades/${userId}`)
            .orderByChild('copiedAt')
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                copies.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        // Sort by newest first
        copies.sort((a, b) => (b.copiedAt || 0) - (a.copiedAt || 0));

        res.json({
            success: true,
            copies: copies
        });

    } catch (error) {
        console.error('[COPY] My copies error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. CREATE MASTER TRADE (Admin only)
// ============================================================
router.post('/master', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const { type, amount, leverage, entryPrice, takeProfit, stopLoss, note } = req.body;

        if (!type || !amount || !leverage || !entryPrice) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (type !== 'BUY' && type !== 'SELL') {
            return res.status(400).json({ success: false, error: 'Invalid trade type' });
        }

        const masterRef = db.ref('masterTrades').push();
        const masterData = {
            id: masterRef.key,
            type: type,
            amount: amount,
            leverage: leverage,
            entryPrice: entryPrice,
            takeProfit: takeProfit || null,
            stopLoss: stopLoss || null,
            note: note || '',
            status: 'active',
            createdAt: Date.now(),
            createdBy: userId,
            createdByEmail: req.user.email,
            totalFollowers: 0,
            totalVolume: 0
        };

        await masterRef.set(masterData);

        // Add notification to all users with a copy trade request
        // (optional - broadcast to all users)
        const usersSnap = await db.ref('users').once('value');
        if (usersSnap.exists()) {
            const users = usersSnap.val();
            for (const uid in users) {
                if (uid !== userId) {
                    const notifRef = db.ref(`notifications/${uid}`).push();
                    await notifRef.set({
                        title: '📈 New Master Trade Available!',
                        message: `A new ${type === 'BUY' ? 'BUY' : 'SELL'} trade of $${amount} with ${leverage}x leverage is now available to copy.`,
                        type: 'info',
                        read: false,
                        timestamp: Date.now(),
                        link: 'copy-trading.html'
                    });
                }
            }
        }

        res.json({
            success: true,
            message: 'Master trade created successfully',
            masterTrade: masterData
        });

    } catch (error) {
        console.error('[COPY] Create master error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. CLOSE MASTER TRADE (Admin only)
// ============================================================
router.post('/master/:tradeId/close', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin only' });
        }

        const { tradeId } = req.params;
        const { closePrice } = req.body;

        if (!closePrice) {
            return res.status(400).json({ success: false, error: 'Close price required' });
        }

        const masterRef = db.ref(`masterTrades/${tradeId}`);
        const masterSnap = await masterRef.once('value');
        if (!masterSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Master trade not found' });
        }

        const masterTrade = masterSnap.val();

        // Calculate PnL
        let pnl = 0;
        if (masterTrade.type === 'BUY') {
            pnl = (closePrice - masterTrade.entryPrice) * (masterTrade.amount * masterTrade.leverage / masterTrade.entryPrice);
        } else {
            pnl = (masterTrade.entryPrice - closePrice) * (masterTrade.amount * masterTrade.leverage / masterTrade.entryPrice);
        }

        // Mark master trade as closed
        await masterRef.update({
            status: 'closed',
            closePrice: closePrice,
            pnl: pnl,
            closedAt: Date.now()
        });

        // Close all copied trades
        // Get all copied trades for this master trade
        const copiedTradesSnap = await db.ref('copiedTrades')
            .orderByChild('masterTradeId')
            .equalTo(tradeId)
            .once('value');

        if (copiedTradesSnap.exists()) {
            copiedTradesSnap.forEach(async (child) => {
                const copiedTrade = child.val();
                const userId = child.key.split('/')[0] || child.val().userId;
                
                // Update copied trade status
                await db.ref(`copiedTrades/${userId}/${child.key}`).update({
                    status: 'closed',
                    closePrice: closePrice,
                    pnl: pnl,
                    closedAt: Date.now()
                });

                // Update user trade
                const userTradeSnap = await db.ref(`trades/${userId}`)
                    .orderByChild('copiedFrom')
                    .equalTo(tradeId)
                    .once('value');

                if (userTradeSnap.exists()) {
                    userTradeSnap.forEach(async (tradeChild) => {
                        const tradeId = tradeChild.key;
                        await db.ref(`trades/${userId}/${tradeId}`).update({
                            status: 'closed',
                            closePrice: closePrice,
                            pnl: pnl,
                            closedAt: Date.now()
                        });
                    });
                }
            });
        }

        res.json({
            success: true,
            message: 'Master trade closed',
            pnl: pnl
        });

    } catch (error) {
        console.error('[COPY] Close master error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;