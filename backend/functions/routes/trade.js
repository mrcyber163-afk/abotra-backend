// ============================================================
// TRADE ROUTES - REST API Version
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restDelete, restPatch } = require('../firebase');

// ============================================================
// 🔓 GET OPEN TRADES (For frontend trade.html)
// ============================================================
router.get('/open', async (req, res) => {
    try {
        const uid = req.user?.uid || req.query.uid;
        if (!uid) {
            return res.status(400).json({
                success: false,
                error: 'User ID required'
            });
        }

        const trades = await restGet(`trades/${uid}`);
        if (!trades) {
            return res.json({ success: true, trades: [] });
        }

        const openTrades = Object.keys(trades)
            .map(key => ({ id: key, ...trades[key] }))
            .filter(t => t.status === 'open');

        return res.json({ success: true, trades: openTrades });

    } catch (error) {
        console.error('[GET OPEN TRADES] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 🔓 GET USER TRADES (All trades)
// ============================================================
router.get('/trades/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        
        const trades = await restGet(`trades/${uid}`);
        
        if (!trades) {
            return res.json({ success: true, trades: [] });
        }

        const tradesList = Object.keys(trades).map(key => ({
            id: key,
            ...trades[key]
        }));

        return res.json({ success: true, trades: tradesList });

    } catch (error) {
        console.error('[GET TRADES] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 📈 OPEN TRADE (Frontend uses /trades/open)
// ============================================================
router.post('/open', async (req, res) => {
    try {
        const { type, margin, leverage, symbol, takeProfit, stopLoss } = req.body;
        const uid = req.user?.uid;

        // Allow uid from body if not from auth
        const userId = uid || req.body.uid;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        if (!type || !margin || !leverage || !symbol) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: type, margin, leverage, symbol'
            });
        }

        // Get current price
        const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
        const priceData = await priceResponse.json();
        const currentPrice = parseFloat(priceData.price);

        if (!currentPrice) {
            return res.status(400).json({
                success: false,
                error: 'Failed to get current price'
            });
        }

        // Get user data
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const tradingBalance = userData.tradingBalance || 0;
        const openFee = margin * 0.01;
        const totalCost = margin + openFee;

        if (totalCost > tradingBalance) {
            return res.status(400).json({
                success: false,
                error: `Insufficient balance. Required: $${totalCost.toFixed(2)}, Available: $${tradingBalance.toFixed(2)}`
            });
        }

        // Create trade
        const tradeData = {
            uid: userId,
            type: type.toUpperCase(),
            margin: margin,
            leverage: leverage || 1,
            symbol: symbol,
            entryPrice: currentPrice,
            takeProfit: takeProfit || null,
            stopLoss: stopLoss || null,
            openFee: openFee,
            status: 'open',
            openTime: Date.now(),
            isActive: true
        };

        const tradeRef = await restPost(`trades/${userId}`, tradeData);
        const tradeId = tradeRef.name;

        // Update trading balance
        const newBalance = tradingBalance - totalCost;
        await restPatch(`users/${userId}`, { tradingBalance: newBalance });

        // Add to transactions feed
        await restPost(`transactionsFeed`, {
            type: 'trade_open',
            uid: userId,
            symbol: symbol,
            amount: margin,
            fee: openFee,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        return res.json({
            success: true,
            message: 'Trade opened successfully',
            trade: {
                id: tradeId,
                ...tradeData
            },
            newBalance: newBalance
        });

    } catch (error) {
        console.error('[OPEN TRADE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 📉 CLOSE TRADE (Frontend uses /trades/:tradeId/close)
// ============================================================
router.post('/:tradeId/close', async (req, res) => {
    try {
        const { tradeId } = req.params;
        const uid = req.user?.uid || req.body.uid;

        if (!uid || !tradeId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Trade ID required'
            });
        }

        const trade = await restGet(`trades/${uid}/${tradeId}`);
        if (!trade) {
            return res.status(404).json({
                success: false,
                error: 'Trade not found'
            });
        }

        if (trade.status === 'closed') {
            return res.status(400).json({
                success: false,
                error: 'Trade already closed'
            });
        }

        // Get current price
        const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${trade.symbol}USDT`);
        const priceData = await priceResponse.json();
        const currentPrice = parseFloat(priceData.price);

        // Calculate PnL
        let pnl = 0;
        const positionSize = (trade.margin * trade.leverage) / trade.entryPrice;
        
        if (trade.type === 'BUY') {
            pnl = (currentPrice - trade.entryPrice) * positionSize;
        } else {
            pnl = (trade.entryPrice - currentPrice) * positionSize;
        }

        const closeFee = Math.abs(pnl) * 0.005;
        const netPnl = pnl - closeFee;

        // Update trade
        await restPatch(`trades/${uid}/${tradeId}`, {
            status: 'closed',
            closePrice: currentPrice,
            closeTime: Date.now(),
            pnl: netPnl,
            closeFee: closeFee,
            isActive: false
        });

        // Update user balance
        const userData = await restGet(`users/${uid}`);
        const tradingBalance = userData.tradingBalance || 0;
        const newBalance = tradingBalance + (trade.margin + trade.openFee + netPnl);
        await restPatch(`users/${uid}`, { tradingBalance: newBalance });

        await restPost(`transactionsFeed`, {
            type: 'trade_close',
            uid: uid,
            symbol: trade.symbol,
            pnl: netPnl,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        return res.json({
            success: true,
            message: 'Trade closed successfully',
            pnl: netPnl,
            newBalance: newBalance
        });

    } catch (error) {
        console.error('[CLOSE TRADE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 📊 GET TRADE STATS
// ============================================================
router.get('/stats', async (req, res) => {
    try {
        const uid = req.user?.uid || req.query.uid;
        if (!uid) {
            return res.status(400).json({
                success: false,
                error: 'User ID required'
            });
        }

        const trades = await restGet(`trades/${uid}`);
        if (!trades) {
            return res.json({ success: true, stats: { total: 0, open: 0, closed: 0, winning: 0, losing: 0, winRate: 0, netPnl: 0 } });
        }

        let total = 0, open = 0, closed = 0, winning = 0, losing = 0, netPnl = 0;

        Object.values(trades).forEach(trade => {
            total++;
            if (trade.status === 'open') open++;
            else {
                closed++;
                if (trade.pnl > 0) winning++;
                else losing++;
                netPnl += trade.pnl || 0;
            }
        });

        const winRate = closed > 0 ? (winning / closed) * 100 : 0;

        return res.json({
            success: true,
            stats: { total, open, closed, winning, losing, winRate, netPnl }
        });

    } catch (error) {
        console.error('[GET STATS] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// ➕ ADD TRADING BALANCE
// ============================================================
router.post('/add', async (req, res) => {
    try {
        const { amount } = req.body;
        const uid = req.user?.uid || req.body.uid;

        if (!uid) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be greater than 0'
            });
        }

        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const mainBalance = userData.balance || 0;
        if (amount > mainBalance) {
            return res.status(400).json({
                success: false,
                error: `Insufficient main balance. Available: $${mainBalance.toFixed(2)}`
            });
        }

        const newMainBalance = mainBalance - amount;
        const newTradingBalance = (userData.tradingBalance || 0) + amount;

        await restPatch(`users/${uid}`, {
            balance: newMainBalance,
            tradingBalance: newTradingBalance
        });

        await restPost(`transactionsFeed`, {
            type: 'transfer_to_trading',
            uid: uid,
            amount: amount,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        return res.json({
            success: true,
            message: `Added $${amount.toFixed(2)} to trading balance`,
            newMainBalance: newMainBalance,
            newTradingBalance: newTradingBalance
        });

    } catch (error) {
        console.error('[ADD TRADING] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 🔄 MOVE TRADING BALANCE TO MAIN
// ============================================================
router.post('/move', async (req, res) => {
    try {
        const uid = req.user?.uid || req.body.uid;

        if (!uid) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check for open positions
        const trades = await restGet(`trades/${uid}`);
        if (trades) {
            const openTrades = Object.values(trades).filter(t => t.status === 'open');
            if (openTrades.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot move funds while ${openTrades.length} position(s) are open`
                });
            }
        }

        const tradingBalance = userData.tradingBalance || 0;
        if (tradingBalance <= 0) {
            return res.status(400).json({
                success: false,
                error: 'No trading balance to move'
            });
        }

        const newMainBalance = (userData.balance || 0) + tradingBalance;
        await restPatch(`users/${uid}`, {
            balance: newMainBalance,
            tradingBalance: 0
        });

        await restPost(`transactionsFeed`, {
            type: 'transfer_to_main',
            uid: uid,
            amount: tradingBalance,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        return res.json({
            success: true,
            message: `Moved $${tradingBalance.toFixed(2)} to main balance`,
            newMainBalance: newMainBalance,
            amount: tradingBalance
        });

    } catch (error) {
        console.error('[MOVE TRADING] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 📜 GET TRADE HISTORY
// ============================================================
router.get('/history/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        
        const trades = await restGet(`trades/${uid}`);
        
        if (!trades) {
            return res.json({ success: true, history: [] });
        }

        const history = Object.keys(trades)
            .map(key => ({ id: key, ...trades[key] }))
            .filter(t => t.status === 'closed')
            .sort((a, b) => b.closeTime - a.closeTime);

        return res.json({ success: true, history: history });

    } catch (error) {
        console.error('[GET HISTORY] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
