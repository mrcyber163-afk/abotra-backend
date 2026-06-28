// ============================================================
// TRADE ROUTES - REST API Version
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restDelete } = require('../firebase');

// ============================================================
// GET USER TRADES
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
// CREATE TRADE (BUY/SELL)
// ============================================================
router.post('/trade', async (req, res) => {
    try {
        const { uid, symbol, type, amount, price, leverage = 1 } = req.body;

        if (!uid || !symbol || !type || !amount || !price) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: uid, symbol, type, amount, price'
            });
        }

        // Get user balance
        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const balance = userData.balance || 0;
        const totalCost = amount * price;

        // Check if user has enough balance
        if (totalCost > balance) {
            return res.status(400).json({
                success: false,
                error: `Insufficient balance. Required: $${totalCost.toFixed(2)}, Available: $${balance.toFixed(2)}`
            });
        }

        // Create trade
        const tradeData = {
            uid: uid,
            symbol: symbol,
            type: type, // 'buy' or 'sell'
            amount: amount,
            price: price,
            totalCost: totalCost,
            leverage: leverage,
            status: 'open',
            openTime: Date.now(),
            closedProfit: 0,
            isActive: true
        };

        const tradeRef = await restPost(`trades/${uid}`, tradeData);
        const tradeId = tradeRef.name;

        // Update user balance
        const newBalance = balance - totalCost;
        await restPatch(`users/${uid}`, { balance: newBalance });

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
        console.error('[CREATE TRADE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// CLOSE TRADE
// ============================================================
router.post('/trade/close', async (req, res) => {
    try {
        const { uid, tradeId, closePrice } = req.body;

        if (!uid || !tradeId || !closePrice) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: uid, tradeId, closePrice'
            });
        }

        // Get trade data
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

        // Calculate profit/loss
        const priceDiff = closePrice - trade.price;
        const profit = priceDiff * trade.amount * trade.leverage;

        // Update trade
        await restPatch(`trades/${uid}/${tradeId}`, {
            status: 'closed',
            closePrice: closePrice,
            closedProfit: profit,
            closeTime: Date.now()
        });

        // Update user balance
        const userData = await restGet(`users/${uid}`);
        const newBalance = userData.balance + trade.totalCost + profit;
        await restPatch(`users/${uid}`, { balance: newBalance });

        return res.json({
            success: true,
            message: 'Trade closed successfully',
            profit: profit,
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
// GET TRADE HISTORY
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
