// functions/routes/trade-history.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');

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
        const { getAuth } = require('../firebase');
        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET TRADE HISTORY
// ============================================================
router.get('/history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { type, dateRange, result, limit = 100 } = req.query;
        const db = getDB();

        // Get all trades for user
        const tradesRef = db.ref(`trades/${userId}`);
        const snapshot = await tradesRef.once('value');

        let trades = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const trade = child.val();
                // Only include closed trades
                if (trade.status === 'closed' || trade.status === 'completed') {
                    trades.push({
                        id: child.key,
                        ...trade
                    });
                }
            });
        }

        // Sort by date (newest first)
        trades.sort((a, b) => {
            const dateA = a.closedAt || a.timestamp || 0;
            const dateB = b.closedAt || b.timestamp || 0;
            return dateB - dateA;
        });

        // Apply filters
        if (type && type !== 'all') {
            trades = trades.filter(t => t.type === type);
        }

        if (dateRange && dateRange !== 'all') {
            const now = new Date();
            let startDate;
            switch (dateRange) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    break;
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                    break;
                default:
                    startDate = null;
            }
            if (startDate) {
                trades = trades.filter(t => new Date(t.closedAt || t.timestamp) >= startDate);
            }
        }

        if (result && result !== 'all') {
            if (result === 'profit') {
                trades = trades.filter(t => (t.closedProfit || t.profit || 0) > 0);
            } else if (result === 'loss') {
                trades = trades.filter(t => (t.closedProfit || t.profit || 0) < 0);
            }
        }

        // Limit results
        trades = trades.slice(0, parseInt(limit));

        // Calculate stats
        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => (t.closedProfit || t.profit || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
        const totalPnl = trades.reduce((sum, t) => sum + (t.closedProfit || t.profit || 0), 0);
        const bestTrade = totalTrades > 0 ? Math.max(...trades.map(t => t.closedProfit || t.profit || 0)) : 0;
        const avgProfit = totalTrades > 0 ? totalPnl / totalTrades : 0;

        res.json({
            success: true,
            trades: trades,
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
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 2. GET TRADE BY ID
// ============================================================
router.get('/trade/:tradeId', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { tradeId } = req.params;
        const db = getDB();

        const snapshot = await db.ref(`trades/${userId}/${tradeId}`).once('value');

        if (!snapshot.exists()) {
            return res.status(404).json({
                success: false,
                error: 'Trade not found'
            });
        }

        res.json({
            success: true,
            trade: {
                id: tradeId,
                ...snapshot.val()
            }
        });

    } catch (error) {
        console.error('[TRADE HISTORY] Get trade error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 3. GET TRADE STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const db = getDB();

        const snapshot = await db.ref(`trades/${userId}`).once('value');

        let totalTrades = 0;
        let winningTrades = 0;
        let totalPnl = 0;
        let bestTrade = 0;
        let totalFees = 0;

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const trade = child.val();
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
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;