// backend/functions/trade/trade-open.js
const { getDB } = require('../firebase');
const config = require('../config');
const { calculateLiquidationPrice, calculatePnL } = require('../calculations/pnl');
const { calculateTradeResult } = require('../calculations/fees');
const { loadRiskSettings, validateTrade } = require('../calculations/risk-manager');

// ✅ Get open trades
async function getOpenTrades(userId) {
    const db = getDB();
    const snapshot = await db.ref(`trades/${userId}`).once('value');
    const trades = [];
    
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const trade = child.val();
            if (trade && trade.status === 'open') {
                trades.push({ id: child.key, ...trade });
            }
        });
    }
    return trades;
}

// ✅ Get all open trades (for monitoring)
async function getAllOpenTrades() {
    const db = getDB();
    const trades = [];
    
    // Get all users with trades
    const snapshot = await db.ref('trades').once('value');
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const trade = child.val();
            if (trade && trade.status === 'open') {
                trades.push({
                    id: child.key,
                    userId: trade.userId || trade.uid,
                    ...trade
                });
            }
        });
    }
    return trades;
}

// ✅ Open trade
async function openTrade(userId, tradeData) {
    const db = getDB();
    
    const {
        type,
        margin,
        leverage,
        symbol = 'BTC/USDT',
        takeProfit = null,
        stopLoss = null,
        isCopiedTrade = false
    } = tradeData;
    
    // Validate inputs
    if (!type || !margin || !leverage) {
        throw new Error('Missing required fields: type, margin, leverage');
    }
    if (type !== 'BUY' && type !== 'SELL') {
        throw new Error('Invalid trade type. Must be BUY or SELL');
    }
    if (margin <= 0 || leverage <= 0) {
        throw new Error('Margin and leverage must be greater than 0');
    }
    
    // Get current price from Binance
    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolClean}`);
    const priceData = await priceRes.json();
    const currentPrice = parseFloat(priceData.price);
    
    if (!currentPrice || currentPrice <= 0) {
        throw new Error('Price not available for ' + symbol);
    }
    
    // Get user data
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userSnap.val();
    if (!userData) throw new Error('User not found');
    
    const tradingBalance = userData.tradingBalance || 0;
    const dailyLoss = userData.dailyLoss || 0;
    
    // Load risk settings
    const risk = await loadRiskSettings(userId);
    const positions = await getOpenTrades(userId);
    
    // Validate trade
    const validation = await validateTrade(userId, type, margin, leverage, risk, positions, tradingBalance, dailyLoss);
    if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
    }
    
    // Calculate fees
    const openFee = margin * config.OPEN_FEE_RATE;
    const totalCost = margin + openFee;
    
    // Check balance
    if (totalCost > tradingBalance) {
        throw new Error(`Insufficient balance. Need $${totalCost.toFixed(2)}, have $${tradingBalance.toFixed(2)}`);
    }
    
    // ✅ Deduct balance directly (no transaction needed for simple update)
    await db.ref(`users/${userId}`).update({
        tradingBalance: tradingBalance - totalCost
    });
    
    // Calculate liquidation price
    const liquidationPrice = calculateLiquidationPrice(margin, leverage, currentPrice, type);
    
    // Create trade
    const tradeId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6);
    const newTrade = {
        id: tradeId,
        userId: userId,
        type: type,
        margin: margin,
        leverage: leverage,
        positionValue: margin * leverage,
        entryPrice: currentPrice,
        status: 'open',
        openDate: new Date().toISOString(),
        timestamp: Date.now(),
        createdAt: Date.now(),
        createdAtMillis: Date.now(),
        symbol: symbol,
        liquidationPrice: liquidationPrice,
        openFee: openFee,
        totalCost: totalCost,
        closeFee: 0,
        netReturn: 0,
        grossReturn: 0,
        totalFees: openFee,
        isCopiedTrade: isCopiedTrade,
        takeProfit: takeProfit || null,
        stopLoss: stopLoss || null
    };
    
    // Save trade
    await db.ref(`trades/${userId}/${tradeId}`).set(newTrade);
    
    // Update user trades list
    await db.ref(`user_trades/${userId}/${tradeId}`).set({
        tradeId: tradeId,
        status: 'open',
        createdAt: Date.now()
    });
    
    // ✅ Add log
    const logRef = db.ref(`tradingLogs/${userId}`).push();
    await logRef.set({
        id: logRef.key,
        robot: 'Manual Trade',
        message: `🔓 ${type} ${symbol} opened - $${margin} @ ${leverage}x, Entry: $${currentPrice.toFixed(2)}`,
        type: 'info',
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
    });
    
    console.log(`[TRADE] ✅ ${type} trade opened for ${userId}: $${margin} @ ${leverage}x`);
    
    return {
        success: true,
        tradeId: tradeId,
        trade: newTrade
    };
}

module.exports = {
    openTrade,
    getOpenTrades,
    getAllOpenTrades
};