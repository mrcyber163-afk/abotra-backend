// functions/calculations/pnl.js
const config = require('../config');

function calculatePnL(trade, currentPrice) {
    if (!trade || !trade.entryPrice || !currentPrice) return 0;
    const positionSize = (trade.margin * trade.leverage) / trade.entryPrice;
    let pnl = 0;
    if (trade.type === 'BUY') {
        pnl = (currentPrice - trade.entryPrice) * positionSize;
    } else {
        pnl = (trade.entryPrice - currentPrice) * positionSize;
    }
    return pnl;
}

function calculateLiquidationPrice(margin, leverage, entryPrice, type) {
    const buffer = 0.005;
    let liquidationPrice;
    if (type === 'BUY') {
        liquidationPrice = entryPrice * (1 - buffer * leverage);
    } else {
        liquidationPrice = entryPrice * (1 + buffer * leverage);
    }
    if (type === 'BUY') {
        liquidationPrice = Math.max(liquidationPrice, 0.01);
        liquidationPrice = Math.min(liquidationPrice, entryPrice * 0.99);
    } else {
        liquidationPrice = Math.max(liquidationPrice, entryPrice * 1.01);
        liquidationPrice = Math.min(liquidationPrice, entryPrice * 100);
    }
    return liquidationPrice;
}

function calculateEquity(balance, trades, prices) {
    let equity = balance || 0;
    if (!trades || trades.length === 0) return equity;
    for (const trade of trades) {
        if (trade.status === 'open') {
            const price = prices[trade.symbol] || trade.entryPrice;
            const pnl = calculatePnL(trade, price);
            equity += pnl;
        }
    }
    return equity;
}

function calculateUsedMargin(trades) {
    if (!trades || trades.length === 0) return 0;
    let used = 0;
    for (const trade of trades) {
        if (trade.status === 'open') {
            used += trade.margin || 0;
        }
    }
    return used;
}

function calculateFreeMargin(equity, usedMargin) {
    return Math.max(0, equity - usedMargin);
}

function calculateMarginLevel(equity, usedMargin) {
    if (usedMargin <= 0) return 0;
    return (equity / usedMargin) * 100;
}

function getClosingReason(trade, currentPrice) {
    if (!trade || !currentPrice) return null;
    
    if (trade.takeProfit) {
        if (trade.type === 'BUY' && currentPrice >= trade.takeProfit) return 'Take Profit';
        if (trade.type === 'SELL' && currentPrice <= trade.takeProfit) return 'Take Profit';
    }
    
    if (trade.stopLoss) {
        if (trade.type === 'BUY' && currentPrice <= trade.stopLoss) return 'Stop Loss';
        if (trade.type === 'SELL' && currentPrice >= trade.stopLoss) return 'Stop Loss';
    }
    
    if (trade.liquidationPrice) {
        if (trade.type === 'BUY' && currentPrice <= trade.liquidationPrice) return 'Liquidation';
        if (trade.type === 'SELL' && currentPrice >= trade.liquidationPrice) return 'Liquidation';
    }
    
    return null;
}

module.exports = {
    calculatePnL,
    calculateLiquidationPrice,
    calculateEquity,
    calculateUsedMargin,
    calculateFreeMargin,
    calculateMarginLevel,
    getClosingReason
};