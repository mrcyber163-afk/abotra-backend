const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost } = require('../firebase');

router.get('/master-trades', async (req, res) => {
    try {
        const trades = await restGet('masterTrades');
        
        if (!trades) {
            return res.json({ success: true, masterTrades: [] });
        }

        const masterTrades = Object.keys(trades)
            .map(key => ({
                id: key,
                ...trades[key]
            }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        return res.json({ success: true, masterTrades });

    } catch (error) {
        console.error('[MASTER TRADES] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/copy', async (req, res) => {
    try {
        const { userId, masterTradeId, amount } = req.body;

        if (!userId || !masterTradeId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Get master trade
        const masterTrade = await restGet(`masterTrades/${masterTradeId}`);
        if (!masterTrade) {
            return res.status(404).json({
                success: false,
                error: 'Master trade not found'
            });
        }

        // Create copy trade
        const copyTrade = {
            userId: userId,
            masterTradeId: masterTradeId,
            amount: amount,
            symbol: masterTrade.symbol,
            status: 'active',
            createdAt: Date.now(),
            masterTrade: masterTrade
        };

        const result = await restPost(`copyTrades/${userId}`, copyTrade);

        return res.json({
            success: true,
            message: 'Trade copied successfully',
            copyTrade: {
                id: result.name,
                ...copyTrade
            }
        });

    } catch (error) {
        console.error('[COPY TRADE] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
