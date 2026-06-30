// functions/calculations/fees.js
const config = require('../config');

function calculateOpenFee(margin) {
    return margin * config.OPEN_FEE_RATE;
}

function calculateCloseFee(grossPnl) {
    return Math.abs(grossPnl) * config.CLOSE_FEE_RATE;
}

function calculateTotalFees(margin, grossPnl) {
    const openFee = calculateOpenFee(margin);
    const closeFee = calculateCloseFee(grossPnl);
    return openFee + closeFee;
}

function calculateNetProfit(margin, grossPnl) {
    const totalFees = calculateTotalFees(margin, grossPnl);
    return grossPnl - totalFees;
}

function calculateTradeResult(margin, leverage, entryPrice, closePrice, type) {
    const positionSize = (margin * leverage) / entryPrice;
    let grossPnl = 0;
    if (type === 'BUY') {
        grossPnl = (closePrice - entryPrice) * positionSize;
    } else {
        grossPnl = (entryPrice - closePrice) * positionSize;
    }
    const openFee = calculateOpenFee(margin);
    const closeFee = calculateCloseFee(grossPnl);
    const totalFees = openFee + closeFee;
    const netProfit = grossPnl - totalFees;
    
    return {
        grossPnl,
        openFee,
        closeFee,
        totalFees,
        netProfit,
        positionSize
    };
}

async function updatePlatformStats(type, amount) {
    console.log(`[PLATFORM] ${type}: $${amount.toFixed(2)}`);
}

module.exports = {
    calculateOpenFee,
    calculateCloseFee,
    calculateTotalFees,
    calculateNetProfit,
    calculateTradeResult,
    updatePlatformStats
};