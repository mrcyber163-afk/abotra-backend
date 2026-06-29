// ============================================================
// TRADE ROUTES - REST API Version
// ============================================================

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

// ============================================================
// GET TRADE HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { limit = 100 } = req.query;
        const trades = [];

        const data = await restGet(`trades/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                trades.push({ id: key, ...data[key] });
            });
        }

        trades.sort((a, b) => (b.openTime || b.createdAt || 0) - (a.openTime || a.createdAt || 0));
        res.json({ success: true, trades: trades.slice(0, parseInt(limit)) });

    } catch (error) {
        console.error('[TRADE] History error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// OPEN TRADE
// ============================================================
router.post('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { type, margin, leverage, symbol, takeProfit, stopLoss } = req.body;

        if (!type || !margin || !leverage) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Get price
        const symbolBinance = (symbol || 'BTC/USDT').replace('/USDT', '').toUpperCase() + 'USDT';
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolBinance}`);
        const priceData = await priceRes.json();
        if (!priceData || !priceData.price) {
            return res.status(400).json({ success: false, error: 'Failed to get price' });
        }
        const currentPrice = parseFloat(priceData.price);

        // Get user data
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const tradingBalance = userData.tradingBalance || 0;
        const openFee = margin * 0.01;
        const totalCost = margin + openFee;

        if (totalCost > tradingBalance) {
            return res.status(400).json({ success: false, error: `Insufficient balance` });
        }

        const tradeId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        const tradeData = {
            id: tradeId,
            userId: userId,
            type: type.toUpperCase(),
            margin: margin,
            leverage: leverage,
            symbol: symbol || 'BTC/USDT',
            entryPrice: currentPrice,
            status: 'open',
            openTime: Date.now(),
            openFee: openFee,
            totalCost: totalCost,
            takeProfit: takeProfit || null,
            stopLoss: stopLoss || null,
            isActive: true,
            createdAt: Date.now()
        };

        await restPut(`trades/${userId}/${tradeId}`, tradeData);
        await restPatch(`users/${userId}`, { tradingBalance: tradingBalance - totalCost });

        // Add to transactions feed
        await restPost(`transactionsFeed`, {
            type: 'trade_open', uid: userId, symbol: symbol || 'BTC/USDT',
            amount: margin, fee: openFee, timestamp: Date.now()
        });

        res.json({ success: true, message: 'Trade opened', trade: tradeData });

    } catch (error) {
        console.error('[TRADE] Open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// CLOSE TRADE
// ============================================================
router.post('/:tradeId/close', verifyToken, async (req, res) => {
    try {
        const { tradeId } = req.params;
        const userId = req.user.uid;

        const trade = await restGet(`trades/${userId}/${tradeId}`);
        if (!trade || trade.status !== 'open') {
            return res.status(404).json({ success: false, error: 'Trade not found or already closed' });
        }

        const symbolBinance = trade.symbol.replace('/USDT', '').toUpperCase() + 'USDT';
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolBinance}`);
        const priceData = await priceRes.json();
        const currentPrice = parseFloat(priceData.price);

        let pnl = 0;
        const positionSize = (trade.margin * trade.leverage) / trade.entryPrice;
        if (trade.type === 'BUY') {
            pnl = (currentPrice - trade.entryPrice) * positionSize;
        } else {
            pnl = (trade.entryPrice - currentPrice) * positionSize;
        }

        const closeFee = Math.abs(pnl) * 0.005;
        const netPnl = pnl - closeFee;

        await restPatch(`trades/${userId}/${tradeId}`, {
            status: 'closed', closePrice: currentPrice, closeTime: Date.now(),
            pnl: netPnl, closeFee: closeFee, isActive: false
        });

        const userData = await restGet(`users/${userId}`);
        const newBalance = (userData.tradingBalance || 0) + trade.margin + trade.openFee + netPnl;
        await restPatch(`users/${userId}`, { tradingBalance: newBalance });

        res.json({ success: true, pnl: netPnl, newBalance });

    } catch (error) {
        console.error('[TRADE] Close error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET OPEN TRADES
// ============================================================
router.get('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const trades = [];
        const data = await restGet(`trades/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                if (data[key].status === 'open') {
                    trades.push({ id: key, ...data[key] });
                }
            });
        }
        res.json({ success: true, trades });
    } catch (error) {
        console.error('[TRADE] Get open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// GET STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        let total = 0, open = 0, closed = 0, winning = 0, losing = 0, netPnl = 0;
        const data = await restGet(`trades/${userId}`);
        if (data) {
            Object.values(data).forEach(t => {
                total++;
                if (t.status === 'open') open++;
                if (t.status === 'closed') {
                    closed++;
                    const pnl = t.pnl || 0;
                    netPnl += pnl;
                    if (pnl > 0) winning++;
                    if (pnl < 0) losing++;
                }
            });
        }
        const winRate = (winning + losing) > 0 ? (winning / (winning + losing)) * 100 : 0;
        res.json({
            success: true,
            stats: {
                total, open, closed, winning, losing,
                winRate: parseFloat(winRate.toFixed(1)),
                netPnl: parseFloat(netPnl.toFixed(2))
            }
        });
    } catch (error) {
        console.error('[TRADE] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// ADD TRADING BALANCE
// ============================================================
router.post('/add', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const mainBalance = userData.balance || 0;
        if (mainBalance < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient main balance' });
        }

        await restPatch(`users/${userId}`, {
            balance: mainBalance - amount,
            tradingBalance: (userData.tradingBalance || 0) + amount
        });

        res.json({ success: true, amount, newTradingBalance: (userData.tradingBalance || 0) + amount });
    } catch (error) {
        console.error('[TRADE] Add error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// MOVE TRADING BALANCE
// ============================================================
router.post('/move', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const tradingBalance = userData.tradingBalance || 0;
        if (tradingBalance <= 0) {
            return res.status(400).json({ success: false, error: 'No trading balance to move' });
        }

        // Check for open positions
        const tradesData = await restGet(`trades/${userId}`);
        let hasOpen = false;
        if (tradesData) {
            Object.values(tradesData).forEach(t => {
                if (t.status === 'open') hasOpen = true;
            });
        }
        if (hasOpen) {
            return res.status(400).json({ success: false, error: 'Close all positions first' });
        }

        await restPatch(`users/${userId}`, {
            balance: (userData.balance || 0) + tradingBalance,
            tradingBalance: 0
        });

        res.json({ success: true, amount: tradingBalance });
    } catch (error) {
        console.error('[TRADE] Move error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
