// functions/calculations/pnl.js
function calculatePnL(trade, currentPrice) {
    if (!currentPrice || !trade) return 0;
    const size = (trade.margin * trade.leverage) / trade.entryPrice;
    if (trade.type === 'BUY') {
        return (currentPrice - trade.entryPrice) * size;
    } else {
        return (trade.entryPrice - currentPrice) * size;
    }
}

function calculateTotalPnL(trades, prices) {
    let total = 0;
    for (const trade of trades) {
        const price = prices[trade.symbol] || trade.entryPrice;
        total += calculatePnL(trade, price);
    }
    return total;
}

function calculateEquity(tradingBalance, trades, prices) {
    let totalMargin = 0;
    let totalPnL = 0;
    
    for (const trade of trades) {
        totalMargin += trade.margin || 0;
        const price = prices[trade.symbol] || trade.entryPrice;
        totalPnL += calculatePnL(trade, price);
    }
    
    return tradingBalance + totalMargin + totalPnL;
}

function calculateFreeMargin(equity, usedMargin) {
    return Math.max(0, equity - usedMargin);
}

function calculateMarginLevel(equity, usedMargin) {
    if (usedMargin <= 0) return 0;
    return (equity / usedMargin) * 100;
}

function calculateUsedMargin(trades) {
    let total = 0;
    for (const trade of trades) {
        total += trade.margin || 0;
    }
    return total;
}

function calculateLiquidation(margin, leverage, entryPrice, type, bufferPercent = 0.005) {
    const positionValue = margin * leverage;
    const size = positionValue / entryPrice;
    const maxLoss = margin * (1 - bufferPercent);
    
    if (type === 'BUY') {
        return entryPrice - (maxLoss / size);
    } else {
        return entryPrice + (maxLoss / size);
    }
}

module.exports = {
    calculatePnL,
    calculateTotalPnL,
    calculateEquity,
    calculateFreeMargin,
    calculateMarginLevel,
    calculateUsedMargin,
    calculateLiquidation
};