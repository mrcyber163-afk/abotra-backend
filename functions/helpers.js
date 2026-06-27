// functions/helpers.js
const { getDB } = require('./firebase');

async function runTransaction(path, updateFn, maxRetries = 3) {
    const db = getDB();
    const ref = db.ref(path);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await ref.transaction(updateFn);
            if (result.committed) {
                return result;
            }
        } catch (error) {
            console.error(`[TRANSACTION] Error on attempt ${attempt + 1}:`, error.message);
            if (attempt === maxRetries - 1) throw error;
        }
    }
    throw new Error(`Transaction failed after ${maxRetries} attempts`);
}

function formatUsd(value) {
    return `$${parseFloat(value || 0).toFixed(2)}`;
}

function generateId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getSymbolFromTrade(trade) {
    if (trade.symbol) {
        return trade.symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    }
    return 'BTCUSDT';
}

function getLeverageFee(leverage, config) {
    const fees = config.LEVERAGE_FEES;
    const keys = Object.keys(fees).map(Number).sort((a, b) => a - b);
    for (const key of keys) {
        if (leverage <= key) return fees[key];
    }
    return fees[100] || 0.10;
}

module.exports = {
    runTransaction,
    formatUsd,
    generateId,
    sleep,
    getSymbolFromTrade,
    getLeverageFee
};