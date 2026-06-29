// ============================================================
// COPY TRADING - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost } = require('../firebase');
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

router.get('/master-trades', verifyToken, async (req, res) => {
    try {
        const masterTrades = await restGet('masterTrades');
        if (!masterTrades) return res.json({ success: true, masterTrades: [] });

        const trades = Object.keys(masterTrades).map(key => ({
            id: key,
            ...masterTrades[key]
        }));

        trades.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json({ success: true, masterTrades: trades });
    } catch (error) {
        console.error('[COPY TRADING] Get master trades error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/copy', verifyToken, async (req, res) => {
    try {
        const { userId, masterTradeId, amount } = req.body;

        if (!userId || !masterTradeId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, masterTradeId, amount'
            });
        }

        const masterTrade = await restGet(`masterTrades/${masterTradeId}`);
        if (!masterTrade) {
            return res.status(404).json({ success: false, error: 'Master trade not found' });
        }

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

        res.json({
            success: true,
            message: 'Trade copied successfully',
            copyTrade: { id: result.name, ...copyTrade }
        });
    } catch (error) {
        console.error('[COPY TRADING] Copy trade error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
