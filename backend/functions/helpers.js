// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

function calculateDaysRemaining(expiryDate) {
    const now = Date.now();
    const diff = expiryDate - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatPrice(amount) {
    return amount.toFixed(2);
}

module.exports = {
    formatUsd,
    generateId,
    sleep,
    getSymbolFromTrade,
    calculateDaysRemaining,
    formatPrice
};