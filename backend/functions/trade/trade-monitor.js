// functions/trade/trade-monitor.js
const { getDB } = require('../firebase');
const { getPriceStream } = require('../streaming/price-stream');
const { getClosingReason } = require('../calculations/liquidation');
const { closeTrade } = require('./trade-close');
const { calculateEquity, calculateFreeMargin, calculateMarginLevel, calculateUsedMargin } = require('../calculations/pnl');

async function getAllOpenTrades() {
    const db = getDB();
    const snapshot = await db.ref('trades').once('value');
    const trades = [];
    
    // REST API returns data directly, not a snapshot with exists()
    const data = snapshot.val();
    if (data && typeof data === 'object') {
        // Iterate through users
        for (const userId of Object.keys(data)) {
            const userTrades = data[userId];
            if (userTrades && typeof userTrades === 'object') {
                // Iterate through trades for this user
                for (const tradeId of Object.keys(userTrades)) {
                    const trade = userTrades[tradeId];
                    if (trade && trade.status === 'open') {
                        trades.push({ id: tradeId, userId: userId, ...trade });
                    }
                }
            }
        }
    }
    return trades;
}

async function monitorTrades() {
    try {
        const priceStream = getPriceStream();
        const trades = await getAllOpenTrades();
        if (trades.length === 0) return;
        
        const userTrades = {};
        for (const trade of trades) {
            if (!userTrades[trade.userId]) userTrades[trade.userId] = [];
            userTrades[trade.userId].push(trade);
        }
        
        for (const [userId, userTradesList] of Object.entries(userTrades)) {
            try {
                const prices = {};
                for (const trade of userTradesList) {
                    const symbol = trade.symbol || 'BTC/USDT';
                    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                    prices[symbol] = priceStream.getPrice(symbolClean) || trade.entryPrice;
                }
                
                for (const trade of userTradesList) {
                    const symbol = trade.symbol || 'BTC/USDT';
                    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                    const currentPrice = prices[symbol] || trade.entryPrice;
                    
                    const reason = getClosingReason(trade, currentPrice);
                    if (reason) {
                        console.log(`[MONITOR] Closing ${trade.id} for ${userId}: ${reason}`);
                        await closeTrade(userId, trade.id, reason);
                    }
                }
            } catch (error) {
                console.error(`[MONITOR] Error processing user ${userId}:`, error);
            }
        }
    } catch (error) {
        console.error('[MONITOR] Error:', error);
    }
}

async function updateUserStats() {
    try {
        const db = getDB();
        const priceStream = getPriceStream();
        const usersSnap = await db.ref('users').once('value');
        
        // REST API returns data directly
        const usersData = usersSnap.val();
        if (!usersData || typeof usersData !== 'object') return;
        
        for (const userId of Object.keys(usersData)) {
            try {
                const userData = usersData[userId];
                const tradesSnap = await db.ref(`trades/${userId}`).once('value');
                const tradesData = tradesSnap.val();
                const openTrades = [];
                
                if (tradesData && typeof tradesData === 'object') {
                    for (const tradeId of Object.keys(tradesData)) {
                        const trade = tradesData[tradeId];
                        if (trade && trade.status === 'open') {
                            openTrades.push({ id: tradeId, ...trade });
                        }
                    }
                }
                
                if (openTrades.length === 0) continue;
                
                const tradingBalance = userData.tradingBalance || 0;
                const prices = {};
                for (const trade of openTrades) {
                    const symbol = trade.symbol || 'BTC/USDT';
                    const symbolClean = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                    prices[symbol] = priceStream.getPrice(symbolClean) || trade.entryPrice;
                }
                
                const equity = calculateEquity(tradingBalance, openTrades, prices);
                const usedMargin = calculateUsedMargin(openTrades);
                const freeMargin = calculateFreeMargin(equity, usedMargin);
                const marginLevel = calculateMarginLevel(equity, usedMargin);
                
                await db.ref(`users/${userId}`).update({
                    equity: equity,
                    usedMargin: usedMargin,
                    freeMargin: freeMargin,
                    marginLevel: marginLevel,
                    lastUpdated: Date.now()
                });
            } catch (error) {
                console.error(`[MONITOR] Error updating user ${userId}:`, error);
            }
        }
    } catch (error) {
        console.error('[MONITOR] Error updating user stats:', error);
    }
}

module.exports = {
    monitorTrades,
    updateUserStats,
    getAllOpenTrades
};
