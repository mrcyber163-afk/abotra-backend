// backend/functions/trade/trade-monitor.js
const { getDB } = require('../firebase');
const { getAllOpenTrades } = require('./trade-open');
const { closeTrade } = require('./trade-close');
const { getClosingReason, calculateEquity, calculateUsedMargin, calculateFreeMargin, calculateMarginLevel } = require('../calculations/pnl');

// ✅ Monitor trades - Simplified
async function monitorTrades() {
    try {
        const db = getDB();
        const trades = await getAllOpenTrades();
        
        if (trades.length === 0) return;
        
        console.log(`[MONITOR] Checking ${trades.length} open trades...`);
        
        let closedCount = 0;
        const errors = [];
        
        // ✅ Process each trade
        for (const trade of trades) {
            try {
                const userId = trade.userId || trade.uid;
                if (!userId) continue;
                
                // Get current price from Binance
                const symbol = trade.symbol || 'BTC/USDT';
                const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolClean}`);
                const priceData = await priceRes.json();
                const currentPrice = parseFloat(priceData.price) || trade.entryPrice;
                
                // Check if should close
                const reason = getClosingReason(trade, currentPrice);
                if (reason) {
                    console.log(`[MONITOR] Closing ${trade.id} for ${userId}: ${reason}`);
                    const result = await closeTrade(userId, trade.id, reason);
                    if (result.success) closedCount++;
                }
            } catch (error) {
                errors.push(error.message);
            }
        }
        
        if (closedCount > 0 || trades.length > 0) {
            console.log(`[MONITOR] ✅ ${closedCount} closed, ${trades.length} checked`);
        }
        
        if (errors.length > 0) {
            console.error('[MONITOR] Errors:', errors);
        }
        
    } catch (error) {
        console.error('[MONITOR] Error:', error.message);
    }
}

// ✅ Update user stats - Simplified
async function updateUserStats() {
    try {
        const db = getDB();
        const trades = await getAllOpenTrades();
        
        if (trades.length === 0) return;
        
        // Group trades by user
        const userTrades = {};
        for (const trade of trades) {
            const userId = trade.userId || trade.uid;
            if (!userId) continue;
            if (!userTrades[userId]) userTrades[userId] = [];
            userTrades[userId].push(trade);
        }
        
        let updatedCount = 0;
        
        // ✅ Update each user's stats
        for (const [userId, userTradesList] of Object.entries(userTrades)) {
            try {
                // Get user data
                const userSnap = await db.ref(`users/${userId}`).once('value');
                if (!userSnap.exists()) continue;
                
                const userData = userSnap.val();
                const tradingBalance = userData.tradingBalance || 0;
                
                // Get prices for each symbol
                const prices = {};
                for (const trade of userTradesList) {
                    const symbol = trade.symbol || 'BTC/USDT';
                    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                    const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolClean}`);
                    const priceData = await priceRes.json();
                    prices[symbol] = parseFloat(priceData.price) || trade.entryPrice;
                }
                
                // Calculate stats
                const equity = calculateEquity(tradingBalance, userTradesList, prices);
                const usedMargin = calculateUsedMargin(userTradesList);
                const freeMargin = calculateFreeMargin(equity, usedMargin);
                const marginLevel = calculateMarginLevel(equity, usedMargin);
                
                // Update user
                await db.ref(`users/${userId}`).update({
                    equity: equity,
                    usedMargin: usedMargin,
                    freeMargin: freeMargin,
                    marginLevel: marginLevel,
                    lastUpdated: Date.now()
                });
                
                updatedCount++;
            } catch (error) {
                console.error(`[STATS] Error updating user ${userId}:`, error.message);
            }
        }
        
        if (updatedCount > 0) {
            console.log(`[STATS] ✅ Updated ${updatedCount} users`);
        }
        
    } catch (error) {
        console.error('[STATS] Error:', error.message);
    }
}

module.exports = {
    monitorTrades,
    updateUserStats
};