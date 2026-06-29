// functions/calculations/liquidation.js
const { calculateLiquidation } = require('./pnl');

function shouldLiquidate(trade, currentPrice) {
    const liqPrice = trade.liquidationPrice || calculateLiquidation(
        trade.margin,
        trade.leverage,
        trade.entryPrice,
        trade.type
    );
    
    if (trade.type === 'BUY') {
        return currentPrice <= liqPrice;
    } else {
        return currentPrice >= liqPrice;
    }
}

function shouldTakeProfit(trade, currentPrice) {
    if (!trade.takeProfit) return false;
    
    if (trade.type === 'BUY') {
        return currentPrice >= trade.takeProfit;
    } else {
        return currentPrice <= trade.takeProfit;
    }
}

function shouldStopLoss(trade, currentPrice) {
    if (!trade.stopLoss) return false;
    
    if (trade.type === 'BUY') {
        return currentPrice <= trade.stopLoss;
    } else {
        return currentPrice >= trade.stopLoss;
    }
}

function getClosingReason(trade, currentPrice) {
    if (shouldTakeProfit(trade, currentPrice)) return 'TP';
    if (shouldStopLoss(trade, currentPrice)) return 'SL';
    if (shouldLiquidate(trade, currentPrice)) return 'Liquidation';
    return null;
}

module.exports = {
    shouldLiquidate,
    shouldTakeProfit,
    shouldStopLoss,
    getClosingReason
};