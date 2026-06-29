// functions/trade/trade-open.js
const { getDB } = require('../firebase');
const { runTransaction, generateId } = require('../helpers');
const { calculatePnL, calculateEquity, calculateUsedMargin, calculateLiquidation } = require('../calculations/pnl');
const { calculateOpenFee, calculateLeverageFee, updatePlatformStats } = require('../calculations/fees');
const { validateTrade } = require('../calculations/risk-manager');
const { getPriceStream } = require('../streaming/price-stream');
const { sendNotification } = require('../notifications/notifications');
const config = require('../config');

async function getOpenTrades(userId) {
    const db = getDB();
    const snapshot = await db.ref(`trades/${userId}`).once('value');
    const trades = [];
    
    // REST API returns data directly
    const data = snapshot.val();
    if (data && typeof data === 'object') {
        for (const tradeId of Object.keys(data)) {
            const trade = data[tradeId];
            if (trade && trade.status === 'open') {
                trades.push({ id: tradeId, ...trade });
            }
        }
    }
    return trades;
}

async function openTrade(userId, tradeData) {
    const db = getDB();
    const priceStream = getPriceStream();
    
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
    
    // Get current price
    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    const currentPrice = priceStream.getPrice(symbolClean);
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
    const risk = await require('../calculations/risk-manager').loadRiskSettings(userId);
    const positions = await getOpenTrades(userId);
    
    // Validate trade
    const validation = await validateTrade(userId, type, margin, leverage, risk, positions, tradingBalance, dailyLoss);
    if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
    }
    
    // Calculate fees
    const openFee = calculateOpenFee(margin);
    const leverageFeePercent = require('../calculations/fees').getLeverageFee(leverage);
    const leverageFee = margin * leverageFeePercent;
    const totalCost = margin + openFee;
    
    // Check balance
    if (totalCost > tradingBalance) {
        throw new Error(`Insufficient balance. Need $${totalCost.toFixed(2)}, have $${tradingBalance.toFixed(2)}`);
    }
    
    // Deduct balance
    const result = await runTransaction(`users/${userId}`, (data) => {
        if (data && (data.tradingBalance || 0) >= totalCost) {
            data.tradingBalance -= totalCost;
            return data;
        }
    });
    
    if (!result.committed) throw new Error('Balance changed during transaction');
    
    // Calculate liquidation price
    const liqPrice = calculateLiquidation(margin, leverage, currentPrice, type);
    
    // Create trade
    const tradeId = generateId();
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
        liquidationPrice: liqPrice,
        openFee: openFee,
        leverageFee: leverageFee,
        totalCost: totalCost,
        closeFee: 0,
        netReturn: 0,
        grossReturn: 0,
        totalFees: openFee + leverageFee,
        isCopiedTrade: isCopiedTrade,
        performanceFeePending: isCopiedTrade,
        performanceFeeCollected: false,
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
    
    // Update platform stats
    await updatePlatformStats('open', openFee);
    if (leverageFee > 0) await updatePlatformStats('leverage', leverageFee);
    await priceStream.updateActiveSymbols();
    
    // Send notification
    await sendNotification(userId, {
        title: `🔓 ${type} Position Opened`,
        message: `${symbol} | $${margin} | ${leverage}x | Entry: $${currentPrice.toFixed(2)}`,
        type: 'success'
    });
    
    console.log(`[TRADE] ✅ ${type} trade opened for ${userId}: $${margin} @ ${leverage}x`);
    
    return {
        success: true,
        tradeId: tradeId,
        trade: {
            id: tradeId,
            ...newTrade
        }
    };
}

module.exports = {
    openTrade,
    getOpenTrades
};