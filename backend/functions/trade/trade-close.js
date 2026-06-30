// backend/functions/trade/trade-close.js
const { getDB } = require('../firebase');
const config = require('../config');
const { calculatePnL } = require('../calculations/pnl');
const { calculateTradeResult } = require('../calculations/fees');

// ✅ Close trade
async function closeTrade(userId, tradeId, reason = 'Manual') {
    const db = getDB();
    
    // Get trade
    const tradeSnap = await db.ref(`trades/${userId}/${tradeId}`).once('value');
    if (!tradeSnap.exists()) {
        console.warn(`[CLOSE] Trade ${tradeId} not found for ${userId}`);
        return { success: false, error: 'Trade not found' };
    }
    
    const trade = tradeSnap.val();
    if (trade.status !== 'open') {
        return { success: false, error: 'Trade already closed' };
    }
    
    // Get current price from Binance
    const symbol = trade.symbol || 'BTC/USDT';
    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolClean}`);
    const priceData = await priceRes.json();
    const currentPrice = parseFloat(priceData.price) || trade.entryPrice;
    
    // Calculate PnL and fees
    const result = calculateTradeResult(
        trade.margin,
        trade.leverage,
        trade.entryPrice,
        currentPrice,
        trade.type
    );
    
    if (!result) {
        return { success: false, error: 'Fee calculation failed' };
    }
    
    const { grossPnl, openFee, closeFee, totalFees, netProfit } = result;
    
    // ✅ Update user balance directly
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userSnap.val() || {};
    const currentBalance = userData.tradingBalance || 0;
    
    // Add margin back + net profit
    const newBalance = currentBalance + trade.margin + netProfit;
    
    await db.ref(`users/${userId}`).update({
        tradingBalance: newBalance,
        dailyLoss: (userData.dailyLoss || 0) + (netProfit < 0 ? Math.abs(netProfit) : 0)
    });
    
    // ✅ Save to trade history
    const historyRef = db.ref(`tradeHistory/${userId}/${tradeId}`);
    await historyRef.set({
        ...trade,
        closePrice: currentPrice,
        grossPnl: grossPnl,
        openFee: openFee,
        closeFee: closeFee,
        totalFees: totalFees,
        netProfit: netProfit,
        closedAt: Date.now(),
        closeReason: reason
    });
    
    // ✅ Update trade status
    await db.ref(`trades/${userId}/${tradeId}`).update({
        status: 'closed',
        closePrice: currentPrice,
        grossPnl: grossPnl,
        openFee: openFee,
        closeFee: closeFee,
        totalFees: totalFees,
        netProfit: netProfit,
        closedAt: Date.now(),
        closeReason: reason
    });
    
    await db.ref(`user_trades/${userId}/${tradeId}`).update({
        status: 'closed',
        closedAt: Date.now(),
        grossPnl: grossPnl,
        netProfit: netProfit,
        totalFees: totalFees
    });
    
    // ✅ Add log
    const logRef = db.ref(`tradingLogs/${userId}`).push();
    await logRef.set({
        id: logRef.key,
        robot: 'Manual Trade',
        message: `🔒 ${trade.type} ${trade.symbol} closed - ${reason}, PnL: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)}`,
        type: netProfit >= 0 ? 'win' : 'loss',
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
    });
    
    console.log(`[CLOSE] ✅ ${reason} trade closed for ${userId}: $${netProfit.toFixed(2)}`);
    
    return {
        success: true,
        tradeId: tradeId,
        netProfit: netProfit,
        grossPnl: grossPnl,
        closePrice: currentPrice,
        reason: reason
    };
}

// ✅ Close all trades
async function closeAllTrades(userId, reason = 'Close All') {
    const trades = await require('./trade-open').getOpenTrades(userId);
    
    if (trades.length === 0) {
        return { success: true, closed: 0, total: 0 };
    }
    
    let closed = 0;
    for (const trade of trades) {
        try {
            const result = await closeTrade(userId, trade.id, reason);
            if (result.success) closed++;
        } catch (error) {
            console.error(`[CLOSE] Error closing trade ${trade.id}:`, error);
        }
    }
    
    return {
        success: true,
        closed: closed,
        total: trades.length
    };
}

module.exports = {
    closeTrade,
    closeAllTrades
};