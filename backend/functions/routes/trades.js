// functions/routes/trade.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');
const { openTrade, getOpenTrades } = require('../trade/trade-open');
const { closeTrade, closeAllTrades } = require('../trade/trade-close');
const { getPriceStream } = require('../streaming/price-stream');
const { sendNotification } = require('../notifications/notifications');

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
// 1. OPEN TRADE
// ============================================================
router.post('/open', verifyToken, async (req, res) => {
    try {
        const { type, margin, leverage, symbol, takeProfit, stopLoss } = req.body;
        const userId = req.user.uid;

        const result = await openTrade(userId, {
            type: type,
            margin: margin,
            leverage: leverage,
            symbol: symbol || 'BTC/USDT',
            takeProfit: takeProfit || null,
            stopLoss: stopLoss || null
        });

        res.json({
            success: true,
            tradeId: result.tradeId,
            trade: result.trade
        });

    } catch (error) {
        console.error('[TRADE] Open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. CLOSE TRADE
// ============================================================
router.post('/:tradeId/close', verifyToken, async (req, res) => {
    try {
        const { tradeId } = req.params;
        const { reason } = req.body;
        const userId = req.user.uid;

        const result = await closeTrade(userId, tradeId, reason || 'Manual');

        res.json({
            success: true,
            tradeId: result.tradeId,
            pnl: result.pnl,
            netReturn: result.netReturn,
            closePrice: result.closePrice,
            reason: result.reason
        });

    } catch (error) {
        console.error('[TRADE] Close error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET OPEN TRADES
// ============================================================
router.get('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const trades = await getOpenTrades(userId);

        res.json({
            success: true,
            trades: trades
        });

    } catch (error) {
        console.error('[TRADE] Get open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET TRADE STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        
        let total = 0, open = 0, closed = 0;
        let winning = 0, losing = 0;
        let totalPnl = 0;

        const snapshot = await db.ref(`trades/${userId}`).once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const trade = child.val();
                total++;
                if (trade.status === 'open') open++;
                if (trade.status === 'closed') {
                    closed++;
                    const pnl = trade.netReturn || trade.closedProfit || trade.pnl || 0;
                    totalPnl += pnl;
                    if (pnl > 0) winning++;
                    if (pnl < 0) losing++;
                }
            });
        }

        const winRate = (winning + losing) > 0 ? (winning / (winning + losing)) * 100 : 0;

        res.json({
            success: true,
            stats: {
                total: total,
                open: open,
                closed: closed,
                winning: winning,
                losing: losing,
                winRate: parseFloat(winRate.toFixed(1)),
                netPnl: parseFloat(totalPnl.toFixed(2))
            }
        });

    } catch (error) {
        console.error('[TRADE] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. ADD TRADING BALANCE
// ============================================================
router.post('/add', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { amount } = req.body;
        const userId = req.user.uid;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};

        const mainBalance = userData.balance || 0;
        if (mainBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient main balance. Need $${amount}, have $${mainBalance}` 
            });
        }

        await userRef.update({
            balance: mainBalance - amount,
            tradingBalance: (userData.tradingBalance || 0) + amount
        });

        await sendNotification(userId, {
            title: '💰 Trading Balance Added',
            message: `Added $${amount} to trading balance`,
            type: 'success'
        });

        res.json({
            success: true,
            amount: amount,
            newTradingBalance: (userData.tradingBalance || 0) + amount
        });

    } catch (error) {
        console.error('[TRADE] Add balance error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. MOVE TRADING BALANCE TO MAIN
// ============================================================
router.post('/move', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const userRef = db.ref(`users/${userId}`);
        const userSnap = await userRef.once('value');
        const userData = userSnap.val() || {};

        const tradingBalance = userData.tradingBalance || 0;
        if (tradingBalance <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No trading balance to move' 
            });
        }

        // Check for open positions
        const openTrades = await getOpenTrades(userId);
        if (openTrades.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `Cannot move balance while ${openTrades.length} open positions exist` 
            });
        }

        await userRef.update({
            balance: (userData.balance || 0) + tradingBalance,
            tradingBalance: 0
        });

        await sendNotification(userId, {
            title: '💳 Balance Moved',
            message: `Moved $${tradingBalance.toFixed(2)} to main balance`,
            type: 'info'
        });

        res.json({
            success: true,
            amount: tradingBalance,
            newBalance: (userData.balance || 0) + tradingBalance
        });

    } catch (error) {
        console.error('[TRADE] Move balance error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. GET TRADE HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { limit = 50, status } = req.query;
        const trades = [];

        let query = db.ref(`trades/${userId}`).orderByChild('createdAtMillis');

        if (status) {
            query = query.equalTo(status);
        }

        const snapshot = await query.limitToLast(parseInt(limit)).once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                trades.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        // Sort by newest first
        trades.sort((a, b) => (b.createdAtMillis || b.createdAt || 0) - (a.createdAtMillis || a.createdAt || 0));

        res.json({
            success: true,
            trades: trades,
            total: trades.length
        });

    } catch (error) {
        console.error('[TRADE] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. GET TRADE BY ID
// ============================================================
router.get('/:tradeId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { tradeId } = req.params;
        const userId = req.user.uid;

        const tradeSnap = await db.ref(`trades/${userId}/${tradeId}`).once('value');
        if (!tradeSnap.exists()) {
            return res.status(404).json({ success: false, error: 'Trade not found' });
        }

        res.json({
            success: true,
            trade: {
                id: tradeId,
                ...tradeSnap.val()
            }
        });

    } catch (error) {
        console.error('[TRADE] Get trade error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. CLOSE ALL TRADES
// ============================================================
router.post('/close-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { reason } = req.body;

        const result = await closeAllTrades(userId, reason || 'Close All');

        res.json({
            success: true,
            closed: result.closed,
            total: result.total
        });

    } catch (error) {
        console.error('[TRADE] Close all error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;