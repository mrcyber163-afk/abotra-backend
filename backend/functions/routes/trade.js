// ============================================================
// TRADE ROUTES - REST API Version
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPatch, verifyIdToken } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await verifyIdToken(token);
        req.user = { uid: userInfo.uid, email: userInfo.email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

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
                const trade = data[key];
                if (trade && trade.status === 'open') {
                    trades.push({ id: key, ...trade });
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
// OPEN TRADE
// ============================================================
router.post('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { type, margin, leverage, symbol, takeProfit, stopLoss } = req.body;
        
        if (!type || !margin || !leverage) {
            return res.status(400).json({ success: false, error: 'Missing required fields: type, margin, leverage' });
        }
        
        const symbolBinance = (symbol || 'BTC/USDT').replace('/USDT', '').toUpperCase() + 'USDT';
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolBinance}`);
        const priceData = await priceRes.json();
        
        if (!priceData || !priceData.price) {
            return res.status(400).json({ success: false, error: 'Failed to get current price' });
        }
        const currentPrice = parseFloat(priceData.price);
        
        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const tradingBalance = userData.tradingBalance || 0;
        const openFee = margin * 0.001;
        const totalCost = margin + openFee;
        
        if (totalCost > tradingBalance) {
            return res.status(400).json({
                success: false,
                error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${tradingBalance.toFixed(2)}`
            });
        }
        
        const tradeId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
        const tradeData = {
            id: tradeId,
            userId: userId,
            type: type.toUpperCase(),
            margin: margin,
            leverage: leverage || 1,
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
        
        res.json({
            success: true,
            message: 'Trade opened successfully',
            trade: tradeData,
            newBalance: tradingBalance - totalCost
        });
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
        if (!trade) {
            return res.status(404).json({ success: false, error: 'Trade not found' });
        }
        if (trade.status !== 'open') {
            return res.status(400).json({ success: false, error: 'Trade already closed' });
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
        
        const closeFee = Math.abs(pnl) * 0.001;
        const netPnl = pnl - closeFee;
        
        await restPatch(`trades/${userId}/${tradeId}`, {
            status: 'closed',
            closePrice: currentPrice,
            closeTime: Date.now(),
            pnl: netPnl,
            closeFee: closeFee,
            isActive: false
        });
        
        const userData = await restGet(`users/${userId}`);
        const tradingBalance = userData.tradingBalance || 0;
        const newBalance = tradingBalance + trade.margin + trade.openFee + netPnl;
        
        await restPatch(`users/${userId}`, { tradingBalance: newBalance });
        
        res.json({
            success: true,
            message: 'Trade closed successfully',
            pnl: netPnl,
            newBalance: newBalance,
            closePrice: currentPrice
        });
    } catch (error) {
        console.error('[TRADE] Close error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

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
// CLOSE ALL TRADES
// ============================================================
router.post('/close-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const tradesData = await restGet(`trades/${userId}`);
        let closed = 0;
        
        if (tradesData) {
            for (const [key, trade] of Object.entries(tradesData)) {
                if (trade.status === 'open') {
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
                    
                    const closeFee = Math.abs(pnl) * 0.001;
                    const netPnl = pnl - closeFee;
                    
                    await restPatch(`trades/${userId}/${key}`, {
                        status: 'closed',
                        closePrice: currentPrice,
                        closeTime: Date.now(),
                        pnl: netPnl,
                        closeFee: closeFee,
                        isActive: false
                    });
                    
                    const userData = await restGet(`users/${userId}`);
                    const newBalance = (userData.tradingBalance || 0) + trade.margin + trade.openFee + netPnl;
                    await restPatch(`users/${userId}`, { tradingBalance: newBalance });
                    
                    closed++;
                }
            }
        }
        
        res.json({ success: true, message: `Closed ${closed} positions`, closed });
    } catch (error) {
        console.error('[TRADE] Close all error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;