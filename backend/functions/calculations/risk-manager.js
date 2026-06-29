// functions/calculations/risk-manager.js
const { getDB } = require('../firebase');

async function loadRiskSettings(userId) {
    try {
        const db = getDB();
        const [riskSettingsSnap, riskNodeSnap] = await Promise.all([
            db.ref('riskSettings').once('value'),
            db.ref(`settings/risk`).once('value')
        ]);
        
        const riskSettingsData = riskSettingsSnap.exists() ? riskSettingsSnap.val() : {};
        const riskNodeData = riskNodeSnap.exists() ? riskNodeSnap.val() : {};
        
        return {
            dailyLossLimit: riskNodeData.dailyLossLimit || riskSettingsData.dailyLossLimit || 500,
            maxOpenTrades: riskNodeData.maxOpenTrades || riskSettingsData.maxOpenTrades || 10,
            maxLeverage: riskNodeData.maxLeverage || riskSettingsData.maxLeverage || 100,
            minTradeAmount: riskNodeData.minTradeAmount || riskSettingsData.minTradeAmount || 3,
            maxTradeAmount: riskNodeData.maxTradeAmount || riskSettingsData.maxTradeAmount || 10000,
            tradingEnabled: riskNodeData.tradingEnabled !== undefined ? riskNodeData.tradingEnabled : true,
            allowBuy: riskNodeData.allowBuy !== undefined ? riskNodeData.allowBuy : true,
            allowSell: riskNodeData.allowSell !== undefined ? riskNodeData.allowSell : true,
            maintenanceMode: riskNodeData.maintenanceMode !== undefined ? riskNodeData.maintenanceMode : false,
            maxDailyTrades: riskNodeData.maxDailyTrades || riskSettingsData.maxDailyTrades || 100,
            maxMarginPercent: riskNodeData.maxMarginPercent || riskSettingsData.maxMarginPercent || 90,
            liquidationBufferPercent: riskNodeData.liquidationBufferPercent || riskSettingsData.liquidationBufferPercent || 0.5
        };
    } catch (error) {
        console.error('[RISK] Error loading risk settings:', error);
        return {
            dailyLossLimit: 500,
            maxOpenTrades: 10,
            maxLeverage: 100,
            minTradeAmount: 3,
            maxTradeAmount: 10000,
            tradingEnabled: true,
            allowBuy: true,
            allowSell: true,
            maintenanceMode: false,
            maxDailyTrades: 100,
            maxMarginPercent: 90,
            liquidationBufferPercent: 0.5
        };
    }
}

async function validateTrade(userId, tradeType, margin, leverage, risk, positions, tradingBalance, dailyLoss) {
    const errors = [];
    
    if (!risk.tradingEnabled) errors.push('Trading is currently disabled');
    if (risk.maintenanceMode) errors.push('System under maintenance');
    if (tradeType === 'BUY' && !risk.allowBuy) errors.push('Buy orders are blocked');
    if (tradeType === 'SELL' && !risk.allowSell) errors.push('Sell orders are blocked');
    if (leverage > risk.maxLeverage) errors.push(`Leverage exceeds max ${risk.maxLeverage}x`);
    if (margin < risk.minTradeAmount) errors.push(`Min trade $${risk.minTradeAmount}`);
    if (margin > risk.maxTradeAmount) errors.push(`Max trade $${risk.maxTradeAmount}`);
    if (positions.length >= risk.maxOpenTrades) errors.push(`Max open trades ${risk.maxOpenTrades}`);
    if (dailyLoss >= risk.dailyLossLimit) errors.push(`Daily loss limit $${risk.dailyLossLimit} reached`);
    
    const totalMarginUsed = positions.reduce((sum, t) => sum + (t.margin || 0), 0);
    const equity = tradingBalance + totalMarginUsed;
    const marginPercent = (totalMarginUsed / (equity + 0.01)) * 100;
    if (marginPercent > risk.maxMarginPercent) {
        errors.push(`Margin usage exceeds ${risk.maxMarginPercent}%`);
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