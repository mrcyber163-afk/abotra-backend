// functions/calculations/risk-manager.js
const config = require('../config');

async function loadRiskSettings(userId) {
    return { ...config.DEFAULT_RISK };
}

async function validateTrade(userId, type, margin, leverage, risk, positions, tradingBalance, dailyLoss) {
    const errors = [];
    
    if (margin < risk.minTradeAmount) {
        errors.push(`Min trade: $${risk.minTradeAmount}`);
    }
    if (margin > risk.maxTradeAmount) {
        errors.push(`Max trade: $${risk.maxTradeAmount}`);
    }
    if (leverage > risk.maxLeverage) {
        errors.push(`Max leverage: ${risk.maxLeverage}x`);
    }
    if (positions && positions.length >= risk.maxOpenTrades) {
        errors.push(`Max open trades: ${risk.maxOpenTrades}`);
    }
    if (dailyLoss >= risk.dailyLossLimit) {
        errors.push(`Daily loss limit $${risk.dailyLossLimit} reached`);
    }
    
    const openFee = margin * config.OPEN_FEE_RATE;
    const totalCost = margin + openFee;
    if (totalCost > tradingBalance) {
        errors.push(`Insufficient balance! Need $${totalCost.toFixed(2)}`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    loadRiskSettings,
    validateTrade
};