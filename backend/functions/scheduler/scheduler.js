// backend/functions/scheduler/scheduler.js
const cron = require('node-cron');
const { monitorTrades, updateUserStats } = require('../trade/trade-monitor');
const { getPriceStream } = require('../streaming/price-stream');

let isMonitoring = false;
let isUpdatingStats = false;

function startScheduler() {
    console.log('[SCHEDULER] Starting...');
    
    // ✅ Monitor trades - Every 2 seconds
    cron.schedule('*/2 * * * * *', async () => {
        if (isMonitoring) return;
        isMonitoring = true;
        try {
            await monitorTrades();
        } catch (error) {
            console.error('[SCHEDULER] Monitor error:', error.message);
        } finally {
            isMonitoring = false;
        }
    });
    
    // ✅ Update stats - Every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
        if (isUpdatingStats) return;
        isUpdatingStats = true;
        try {
            await updateUserStats();
        } catch (error) {
            console.error('[SCHEDULER] Stats error:', error.message);
        } finally {
            isUpdatingStats = false;
        }
    });
    
    // ✅ Update price symbols - Every minute
    cron.schedule('*/60 * * * * *', async () => {
        try {
            const priceStream = getPriceStream();
            await priceStream.updateActiveSymbols();
        } catch (error) {
            console.error('[SCHEDULER] Symbol update error:', error.message);
        }
    });
    
    console.log('[SCHEDULER] ✅ All jobs started');
}

module.exports = { startScheduler };