// functions/trade/trade-close.js
const { getDB } = require('../firebase');
const { runTransaction } = require('../helpers');
const { calculatePnL } = require('../calculations/pnl');
const { calculateCloseFee, calculatePerformanceFee, updatePlatformStats } = require('../calculations/fees');
const { getPriceStream } = require('../streaming/price-stream');
const { sendNotification } = require('../notifications/notifications');
const config = require('../config');

async function closeTrade(userId, tradeId, reason = 'Manual') {
    const db = getDB();
    const priceStream = getPriceStream();
    
    // Get trade - REST API returns data directly
    const tradeSnap = await db.ref(`trades/${userId}/${tradeId}`).once('value');
    const trade = tradeSnap.val();
    
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'open') throw new Error('Trade already closed');
    
    // Get current price
    const symbol = trade.symbol || 'BTC/USDT';
    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    const currentPrice = priceStream.getPrice(symbolClean) || trade.entryPrice;
    
    // Calculate PnL
    const pnl = calculatePnL(trade, currentPrice);
    const grossReturn = trade.margin + pnl;
    
    let performanceFeeAmount = 0;
    let leverageFeeAmount = 0;
    let closeFee = 0;
    let netReturn = 0;
    
    // Performance fee for copied trades
    if (trade.isCopiedTrade && trade.performanceFeePending !== false) {
        if (pnl > 0) {
            performanceFeeAmount = pnl * config.PERFORMANCE_FEE_PERCENT;
            const perfFeeRef = db.ref(`performanceFees/${userId}/${tradeId}`);
            const perfSnap = await perfFeeRef.once('value');
            const perfData = perfSnap.val();
            if (perfData) {
                await perfFeeRef.update({
                    status: 'collected',
                    feeAmount: performanceFeeAmount,
                    profitAmount: pnl,
                    collectedAt: Date.now()
                });
            }
            await updatePlatformStats('performance', performanceFeeAmount);
        } else {
            const perfFeeRef = db.ref(`performanceFees/${userId}/${tradeId}`);
            const perfSnap = await perfFeeRef.once('value');
            const perfData = perfSnap.val();
            if (perfData) {
                await perfFeeRef.update({
                    status: 'no_profit',
                    profitAmount: pnl,
                    closedAt: Date.now()
                });
            }
        }
    }
    
    // Leverage fee
    const leverage = trade.leverage || 1;
    const leverageFeePercent = require('../calculations/fees').getLeverageFee(leverage);
    const amountBeforePerfFee = grossReturn - performanceFeeAmount;
    leverageFeeAmount = amountBeforePerfFee * leverageFeePercent;
    
    // Close fee
    const amountAfterLeverageFee = amountBeforePerfFee - leverageFeeAmount;
    closeFee = calculateCloseFee(amountAfterLeverageFee);
    netReturn = amountAfterLeverageFee - closeFee;
    
    // Update user balance
    const result = await runTransaction(`users/${userId}`, (data) => {
        if (data) {
            data.tradingBalance = (data.tradingBalance || 0) + netReturn;
            if (pnl < 0) {
                data.dailyLoss = (data.dailyLoss || 0) + Math.abs(pnl);
            }
            return data;
        }
    });
    
    if (!result.committed) throw new Error('Failed to update user balance');
    
    // Update trade
    await db.ref(`trades/${userId}/${tradeId}`).update({
        status: 'closed',
        closedProfit: pnl,
        closePrice: currentPrice,
        closedAt: Date.now(),
        closedAtMillis: Date.now(),
        closeReason: reason,
        closeFee: closeFee,
        performanceFee: performanceFeeAmount,
        leverageFee: leverageFeeAmount,
        netReturn: netReturn,
        grossReturn: grossReturn,
        totalFees: (trade.totalFees || 0) + closeFee + performanceFeeAmount + leverageFeeAmount
    });
    
    // Update user trades list
    await db.ref(`user_trades/${userId}/${tradeId}`).update({
        status: 'closed',
        closedAt: Date.now(),
        pnl: pnl,
        netReturn: netReturn
    });
    
    // Update platform stats
    if (closeFee > 0) await updatePlatformStats('close', closeFee);
    if (leverageFeeAmount > 0) await updatePlatformStats('leverage', leverageFeeAmount);
    
    // Update price stream
    await priceStream.updateActiveSymbols();
    
    // Send notification
    const pnlText = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    await sendNotification(userId, {
        title: `🔒 ${trade.type} Position Closed`,
        message: `${trade.symbol || 'BTC/USDT'} | ${reason} | ${pnlText}`,
        type: pnl >= 0 ? 'success' : 'error'
    });
    
    console.log(`[CLOSE] ✅ ${reason} trade closed for ${userId}: ${pnlText}`);
    
    return {
        success: true,
        tradeId: tradeId,
        pnl: pnl,
        closePrice: currentPrice,
        reason: reason,
        netReturn: netReturn
    };
}

async function closeAllTrades(userId, reason = 'Close All') {
    const { getOpenTrades } = require('./trade-open');
    const trades = await getOpenTrades(userId);
    const results = [];
    
    for (const trade of trades) {
        try {
            const result = await closeTrade(userId, trade.id, reason);
            results.push(result);
        } catch (error) {
            console.error(`[CLOSE] Error closing trade ${trade.id}:`, error);
        }
    }
    
    return {
        success: true,
        closed: results.length,
        total: trades.length
    };
}

module.exports = {
    closeTrade,
    closeAllTrades
};