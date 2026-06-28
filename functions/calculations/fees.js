// functions/calculations/fees.js
const { getDB } = require('../firebase');
const { runTransaction } = require('../helpers');
const config = require('../config');

function calculateOpenFee(margin) {
    return margin * config.OPEN_FEE_PERCENT;
}

function calculateCloseFee(amount) {
    return amount * config.CLOSE_FEE_PERCENT;
}

function calculateLeverageFee(amount, leverage) {
    const feePercent = getLeverageFee(leverage);
    return amount * feePercent;
}

function calculatePerformanceFee(profit) {
    if (profit <= 0) return 0;
    return profit * config.PERFORMANCE_FEE_PERCENT;
}

function getLeverageFee(leverage) {
    const fees = config.LEVERAGE_FEES;
    const keys = Object.keys(fees).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
        if (leverage <= key) return fees[key];
    }
    return fees[100] || 0.10;
}

async function updatePlatformStats(type, amount) {
    try {
        const db = getDB();
        const statsRef = db.ref('platformStats');
        const snapshot = await statsRef.once('value');
        const current = snapshot.exists() ? snapshot.val() : {};
        const updates = {};
        
        const typeMap = {
            'open': 'totalOpenFees',
            'close': 'totalCloseFees',
            'performance': 'totalPerformanceFees',
            'leverage': 'totalLeverageFees'
        };
        
        const key = typeMap[type];
        if (key) {
            updates[key] = (current[key] || 0) + amount;
        }
        updates.totalFeesCollected = (current.totalFeesCollected || 0) + amount;
        updates.lastUpdated = Date.now();
        
        await statsRef.update(updates);
        console.log(`[FEES] ✅ ${type} fee $${amount.toFixed(2)} added`);
    } catch (error) {
        console.error('[FEES] Error updating platform stats:', error);
    }
}

module.exports = {
    calculateOpenFee,
    calculateCloseFee,
    calculateLeverageFee,
    calculatePerformanceFee,
    getLeverageFee,
    updatePlatformStats
};