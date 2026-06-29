// ============================================================
// INDEX.JS - MAIN ENTRY POINT (REST API Mode)
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ============================================================
// FIREBASE - REST API Mode
// ============================================================

const { initializeFirebase, getDB, getAuth, isInitialized, testConnection } = require('./firebase');

let firebaseInitialized = false;

try {
    console.log('[FIREBASE] 🔑 Initializing REST API mode...');
    const result = initializeFirebase();
    firebaseInitialized = result.initialized || false;
    if (firebaseInitialized) {
        console.log('[FIREBASE] ✅ Initialized successfully (REST API mode)');
    } else {
        console.warn('[FIREBASE] ⚠️ Firebase not initialized - server will continue');
    }
} catch (error) {
    console.error('[FIREBASE] ❌ Init error:', error.message);
    firebaseInitialized = false;
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    console.log('[HEALTH] Health check requested');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        firebase: firebaseInitialized ? 'connected' : 'disconnected',
        mode: 'REST API',
        version: '2.0.0'
    });
});

// ============================================================
// TEST FIREBASE CONNECTION
// ============================================================

app.get('/api/test-firebase', async (req, res) => {
    const result = await testConnection();
    res.json({
        success: result.success,
        mode: 'REST API',
        firebaseInitialized,
        ...result
    });
});

// ============================================================
// ROOT ENDPOINT
// ============================================================

app.get('/', (req, res) => {
    res.json({
        name: 'ABOTRA-PROAI Backend',
        version: '2.0.0',
        mode: 'REST API',
        endpoints: {
            health: '/api/health',
            testFirebase: '/api/test-firebase'
        }
    });
});

// ============================================================
// PRICE FETCH - COINGECKO API (Binance fix)
// ============================================================

async function fetchPrice(symbol) {
    try {
        // Map symbol to CoinGecko ID
        const symbolMap = {
            'BTCUSDT': 'bitcoin',
            'ETHUSDT': 'ethereum',
            'BNBUSDT': 'binancecoin',
            'SOLUSDT': 'solana',
            'XRPUSDT': 'ripple',
            'ADAUSDT': 'cardano',
            'DOGEUSDT': 'dogecoin',
            'DOTUSDT': 'polkadot',
            'LINKUSDT': 'chainlink',
            'MATICUSDT': 'polygon'
        };

        const coinId = symbolMap[symbol] || 'bitcoin';
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();
        const coinData = data[coinId];
        
        if (!coinData) {
            throw new Error(`No data for ${symbol}`);
        }

        return {
            success: true,
            symbol: symbol,
            price: coinData.usd || 0,
            change24h: coinData.usd_24h_change || 0
        };
    } catch (error) {
        console.error('[PRICE] Error fetching price:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================
// PRICE ENDPOINT
// ============================================================

app.get('/api/price/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        // Ensure format
        let formattedSymbol = symbol;
        if (!symbol.endsWith('USDT')) {
            formattedSymbol = `${symbol}USDT`;
        }
        const result = await fetchPrice(formattedSymbol);
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[PRICE] Endpoint error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ROUTES
// ============================================================

try {
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    console.log('[ROUTES] ✅ /api/auth loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/auth error:', error.message);
}

try {
    const userRoutes = require('./routes/user');
    app.use('/api/user', userRoutes);
    console.log('[ROUTES] ✅ /api/user loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/user error:', error.message);
}

try {
    const tradeRoutes = require('./routes/trade');
    app.use('/api/trades', tradeRoutes);
    console.log('[ROUTES] ✅ /api/trades loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/trades error:', error.message);
}

try {
    const leaderboardRoutes = require('./routes/leaderboard');
    app.use('/api/leaderboard', leaderboardRoutes);
    console.log('[ROUTES] ✅ /api/leaderboard loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/leaderboard error:', error.message);
}

try {
    const copyTradingRoutes = require('./routes/copy-trading');
    app.use('/api/copy-trading', copyTradingRoutes);
    console.log('[ROUTES] ✅ /api/copy-trading loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/copy-trading error:', error.message);
}

try {
    const notificationRoutes = require('./routes/notifications');
    app.use('/api/notifications', notificationRoutes);
    console.log('[ROUTES] ✅ /api/notifications loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/notifications error:', error.message);
}

try {
    const botRoutes = require('./routes/bot');
    app.use('/api/bot', botRoutes);
    console.log('[ROUTES] ✅ /api/bot loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/bot error:', error.message);
}

try {
    const kycRoutes = require('./routes/kyc');
    app.use('/api/kyc', kycRoutes);
    console.log('[ROUTES] ✅ /api/kyc loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/kyc error:', error.message);
}

try {
    const affiliateRoutes = require('./routes/affiliate');
    app.use('/api/affiliate', affiliateRoutes);
    console.log('[ROUTES] ✅ /api/affiliate loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/affiliate error:', error.message);
}

try {
    const depositRoutes = require('./routes/deposit');
    app.use('/api/deposit', depositRoutes);
    console.log('[ROUTES] ✅ /api/deposit loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/deposit error:', error.message);
}

try {
    const withdrawRoutes = require('./routes/withdraw');
    app.use('/api/withdraw', withdrawRoutes);
    console.log('[ROUTES] ✅ /api/withdraw loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/withdraw error:', error.message);
}

try {
    const walletRoutes = require('./routes/wallet');
    app.use('/api/wallet', walletRoutes);
    console.log('[ROUTES] ✅ /api/wallet loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/wallet error:', error.message);
}

try {
    const p2pRoutes = require('./routes/p2p');
    app.use('/api/p2p', p2pRoutes);
    console.log('[ROUTES] ✅ /api/p2p loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/p2p error:', error.message);
}

try {
    const subscriptionRoutes = require('./routes/subscription');
    app.use('/api/subscription', subscriptionRoutes);
    console.log('[ROUTES] ✅ /api/subscription loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/subscription error:', error.message);
}

try {
    const signalRoutes = require('./routes/signals');
    app.use('/api/signals', signalRoutes);
    console.log('[ROUTES] ✅ /api/signals loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/signals error:', error.message);
}

try {
    const robotRoutes = require('./routes/robots');
    app.use('/api/robots', robotRoutes);
    console.log('[ROUTES] ✅ /api/robots loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/robots error:', error.message);
}

try {
    const chartRoutes = require('./routes/chart');
    app.use('/api/chart', chartRoutes);
    console.log('[ROUTES] ✅ /api/chart loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/chart error:', error.message);
}

try {
    const marketRoutes = require('./routes/market');
    app.use('/api/market', marketRoutes);
    console.log('[ROUTES] ✅ /api/market loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/market error:', error.message);
}

try {
    const chatRoutes = require('./routes/chat');
    app.use('/api/chat', chatRoutes);
    console.log('[ROUTES] ✅ /api/chat loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/chat error:', error.message);
}

try {
    const ordersRoutes = require('./routes/orders');
    app.use('/api/orders', ordersRoutes);
    console.log('[ROUTES] ✅ /api/orders loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/orders error:', error.message);
}

try {
    const tradeHistoryRoutes = require('./routes/trade-history');
    app.use('/api/trade-history', tradeHistoryRoutes);
    console.log('[ROUTES] ✅ /api/trade-history loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/trade-history error:', error.message);
}

// ============================================================
// 404 & ERROR HANDLING
// ============================================================

app.use((req, res) => {
    console.log('[404] Not found:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

app.use((err, req, res, next) => {
    console.error('[SERVER] Error:', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] 🚀 Running on port ${PORT}`);
    console.log(`[SERVER] 🔗 Health: http://0.0.0.0:${PORT}/api/health`);
    console.log(`[SERVER] 🔥 Firebase mode: ${firebaseInitialized ? 'REST API ✅' : 'DISABLED ❌'}`);
});

module.exports = app;
