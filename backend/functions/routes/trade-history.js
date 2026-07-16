// ============================================================
// TRADE HISTORY - REST API Version (No Admin SDK)
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

router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { type, dateRange, result, limit = 100 } = req.query;
        let trades = [];

        const data = await restGet(`trades/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                const trade = data[key];
                if (trade.status === 'closed' || trade.status === 'completed') {
                    trades.push({ id: key, ...trade });
                }
            });
        }

        trades.sort((a, b) => (b.closedAt || b.timestamp || 0) - (a.closedAt || a.timestamp || 0));

        if (type && type !== 'all') trades = trades.filter(t => t.type === type);

        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            let startDate;
            switch (dateRange) {
                case 'today': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
                case 'week': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
                case 'month': startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
                case 'year': startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
                default: startDate = null;
            }
            if (startDate) {
                trades = trades.filter(t => new Date(t.closedAt || t.timestamp) >= startDate);
            }
        }

        if (result && result !== 'all') {
            trades = trades.filter(t => (t.closedProfit || t.profit || 0) > 0);
        }

        trades = trades.slice(0, parseInt(limit));

        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => (t.closedProfit || t.profit || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
        const totalPnl = trades.reduce((sum, t) => sum + (t.closedProfit || t.profit || 0), 0);
        const bestTrade = totalTrades > 0 ? Math.max(...trades.map(t => t.closedProfit || t.profit || 0)) : 0;
        const avgProfit = totalTrades > 0 ? totalPnl / totalTrades : 0;

        res.json({
            success: true,
            trades,
            stats: {
                totalTrades,
                winRate: winRate.toFixed(1),
                totalPnl: totalPnl.toFixed(2),
                bestTrade: bestTrade.toFixed(2),
                avgProfit: avgProfit.toFixed(2)
            }
        });
    } catch (error) {
        console.error('[TRADE HISTORY] Error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/trade/:tradeId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { tradeId } = req.params;
        const tradeData = await restGet(`trades/${userId}/${tradeId}`);
        if (!tradeData) {
            return res.status(404).json({ success: false, error: 'Trade not found' });
        }
        res.json({ success: true, trade: { id: tradeId, ...tradeData } });
    } catch (error) {
        console.error('[TRADE HISTORY] Get trade error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        let totalTrades = 0, winningTrades = 0, totalPnl = 0, bestTrade = 0, totalFees = 0;

        const data = await restGet(`trades/${userId}`);
        if (data) {
            Object.values(data).forEach(trade => {
                if (trade.status === 'closed' || trade.status === 'completed') {
                    totalTrades++;
                    const pnl = trade.closedProfit || trade.profit || 0;
                    if (pnl > 0) winningTrades++;
                    totalPnl += pnl;
                    if (pnl > bestTrade) bestTrade = pnl;
                    totalFees += (trade.openFee || 0) + (trade.closeFee || 0) + (trade.performanceFee || 0) + (trade.leverageFee || 0);
                }
            });
        }

        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;

        res.json({
            success: true,
            stats: {
                totalTrades,
                winningTrades,
                losingTrades: totalTrades - winningTrades,
                winRate: winRate.toFixed(1),
                totalPnl: totalPnl.toFixed(2),
                bestTrade: bestTrade.toFixed(2),
                totalFees: totalFees.toFixed(2)
            }
        });
    } catch (error) {
        console.error('[TRADE HISTORY] Stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
