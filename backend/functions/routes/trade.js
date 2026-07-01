// ============================================================
// TRADE ROUTES - REST API Version (FULLY FIXED)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch } = require('../firebase');
const { authGetUser } = require('../firebase');

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
        const userInfo = await authGetUser(token);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = { uid: userInfo.users[0].localId, email: userInfo.users[0].email };
        next();
    } catch (error) {
        console.error('[TRADE] Token verification error:', error);
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. ✅ GET OPEN TRADES
// ============================================================
router.get('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        console.log('[TRADE] Getting open trades for:', userId);
        
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
        
        console.log('[TRADE] Found open trades:', trades.length);
        res.json({ success: true, trades });
    } catch (error) {
        console.error('[TRADE] Get open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. ✅ OPEN TRADE (BUY/SELL)
// ============================================================
router.post('/open', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { type, margin, leverage, symbol, takeProfit, stopLoss } = req.body;

        console.log('[TRADE] Open trade request:', { userId, type, margin, leverage, symbol });

        if (!type || !margin || !leverage) {
            return res.status(400).json({ success: false, error: 'Missing required fields: type, margin, leverage' });
        }

        // Get current price from Binance
        const symbolBinance = (symbol || 'BTC/USDT').replace('/USDT', '').toUpperCase() + 'USDT';
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolBinance}`);
        const priceData = await priceRes.json();
        
        if (!priceData || !priceData.price) {
            return res.status(400).json({ success: false, error: 'Failed to get current price' });
        }
        const currentPrice = parseFloat(priceData.price);

        // Get user data
        const userData = await restGet(`users/${userId}`);
        console.log('[TRADE] User data:', userData);
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const tradingBalance = userData.tradingBalance || 0;
        const openFee = margin * 0.01;
        const totalCost = margin + openFee;

        console.log('[TRADE] Balance check:', { tradingBalance, totalCost, openFee });

        if (totalCost > tradingBalance) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need $${totalCost.toFixed(2)}, have $${tradingBalance.toFixed(2)}` 
            });
        }

        // Create trade
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

        // Save trade
        await restPut(`trades/${userId}/${tradeId}`, tradeData);
        console.log('[TRADE] Trade saved:', tradeId);

        // Update user trading balance
        const newBalance = tradingBalance - totalCost;
        await restPatch(`users/${userId}`, { tradingBalance: newBalance });
        console.log('[TRADE] Balance updated:', newBalance);

        // Add to transactions feed
        await restPost(`transactionsFeed`, {
            type: 'trade_open',
            uid: userId,
            symbol: symbol || 'BTC/USDT',
            amount: margin,
            fee: openFee,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        res.json({ 
            success: true, 
            message: 'Trade opened successfully',
            trade: tradeData,
            newBalance: newBalance
        });

    } catch (error) {
        console.error('[TRADE] Open error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. ✅ CLOSE TRADE
// ============================================================
router.post('/:tradeId/close', verifyToken, async (req, res) => {
    try {
        const { tradeId } = req.params;
        const userId = req.user.uid;

        console.log('[TRADE] Closing trade:', { userId, tradeId });

        // Get trade
        const trade = await restGet(`trades/${userId}/${tradeId}`);
        if (!trade) {
            return res.status(404).json({ success: false, error: 'Trade not found' });
        }
        if (trade.status !== 'open') {
            return res.status(400).json({ success: false, error: 'Trade already closed' });
        }

        // Get current price
        const symbolBinance = trade.symbol.replace('/USDT', '').toUpperCase() + 'USDT';
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolBinance}`);
        const priceData = await priceRes.json();
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
        await restPatch(`trades/${userId}/${tradeId}`, {
            status: 'closed',
            closePrice: currentPrice,
            closeTime: Date.now(),
            pnl: netPnl,
            closeFee: closeFee,
            isActive: false
        });

        // Update user balance
        const userData = await restGet(`users/${userId}`);
        const tradingBalance = userData.tradingBalance || 0;
        const newBalance = tradingBalance + trade.margin + trade.openFee + netPnl;
        
        await restPatch(`users/${userId}`, { tradingBalance: newBalance });
        console.log('[TRADE] Balance updated:', newBalance);

        // Add to transactions feed
        await restPost(`transactionsFeed`, {
            type: 'trade_close',
            uid: userId,
            symbol: trade.symbol,
            pnl: netPnl,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

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
// 4. ✅ GET STATS
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
                total,
                open,
                closed,
                winning,
                losing,
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
// 5. ✅ ADD TRADING BALANCE
// ============================================================
router.post('/add', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { amount } = req.body;

        console.log('[TRADE] Add balance:', { userId, amount });

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const mainBalance = userData.balance || 0;
        if (mainBalance < amount) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient main balance. Need $${amount}, have $${mainBalance}` 
            });
        }

        const newMainBalance = mainBalance - amount;
        const newTradingBalance = (userData.tradingBalance || 0) + amount;

        await restPatch(`users/${userId}`, {
            balance: newMainBalance,
            tradingBalance: newTradingBalance
        });

        await restPost(`transactionsFeed`, {
            type: 'transfer_to_trading',
            uid: userId,
            amount: amount,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        res.json({
            success: true,
            message: `Added $${amount.toFixed(2)} to trading balance`,
            amount: amount,
            newTradingBalance: newTradingBalance,
            newMainBalance: newMainBalance
        });

    } catch (error) {
        console.error('[TRADE] Add error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. ✅ MOVE TRADING BALANCE
// ============================================================
router.post('/move', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;

        console.log('[TRADE] Move balance:', { userId });

        const userData = await restGet(`users/${userId}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const tradingBalance = userData.tradingBalance || 0;
        if (tradingBalance <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No trading balance to move' 
            });
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
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot move balance while open positions exist. Close all positions first.' 
            });
        }

        const newMainBalance = (userData.balance || 0) + tradingBalance;

        await restPatch(`users/${userId}`, {
            balance: newMainBalance,
            tradingBalance: 0
        });

        await restPost(`transactionsFeed`, {
            type: 'transfer_to_main',
            uid: userId,
            amount: tradingBalance,
            timestamp: Date.now(),
            username: userData.username || 'User'
        });

        res.json({
            success: true,
            message: `Moved $${tradingBalance.toFixed(2)} to main balance`,
            amount: tradingBalance,
            newMainBalance: newMainBalance
        });

    } catch (error) {
        console.error('[TRADE] Move error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. ✅ GET TRADE HISTORY
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
// 8. ✅ CLOSE ALL TRADES
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

                    const closeFee = Math.abs(pnl) * 0.005;
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
