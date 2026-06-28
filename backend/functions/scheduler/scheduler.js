// functions/scheduler/scheduler.js
const cron = require('node-cron');
const { monitorTrades, updateUserStats } = require('../trade/trade-monitor');
const { getPriceStream } = require('../streaming/price-stream');

function startScheduler() {
    console.log('[SCHEDULER] Starting...');
    
    cron.schedule('* * * * * *', async () => {
        try { await monitorTrades(); } catch (error) { console.error('[SCHEDULER] Monitor error:', error); }
    });
    
    cron.schedule('*/5 * * * * *', async () => {
        try { await updateUserStats(); } catch (error) { console.error('[SCHEDULER] Stats update error:', error); }
    });
    
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const priceStream = getPriceStream();
            await priceStream.updateActiveSymbols();
        } catch (error) { console.error('[SCHEDULER] Symbol update error:', error); }
    });
    
    console.log('[SCHEDULER] ✅ All jobs started');
}

module.exports = {
    startScheduler
};