// functions/routes/chart.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET LIVE MARKET DATA
// ============================================================
router.get('/live', verifyToken, async (req, res) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;
        const cleanSymbol = symbol.toUpperCase();

        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${cleanSymbol}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch market data');
        }

        const data = await response.json();

        res.json({
            success: true,
            data: {
                symbol: data.symbol,
                price: parseFloat(data.lastPrice),
                high: parseFloat(data.highPrice),
                low: parseFloat(data.lowPrice),
                volume: parseFloat(data.quoteVolume),
                changePercent: parseFloat(data.priceChangePercent),
                openPrice: parseFloat(data.openPrice),
                bidPrice: parseFloat(data.bidPrice),
                askPrice: parseFloat(data.askPrice)
            }
        });

    } catch (error) {
        console.error('[CHART] Live data error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET CANDLESTICK DATA
// ============================================================
router.get('/candles', verifyToken, async (req, res) => {
    try {
        const { symbol = 'BTCUSDT', interval = '15m', limit = 100 } = req.query;
        const cleanSymbol = symbol.toUpperCase();

        const intervalMap = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
            '1M': '1M', '1': '1m', '5': '5m', '15': '15m',
            '30': '30m', '60': '1h', '240': '4h', '1440': '1d',
            '1W': '1w', '1M': '1M'
        };

        const binanceInterval = intervalMap[interval] || '15m';

        const response = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${binanceInterval}&limit=${limit}`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch candlestick data');
        }

        const data = await response.json();

        const candles = data.map(candle => ({
            openTime: candle[0],
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5]),
            closeTime: candle[6]
        }));

        res.json({
            success: true,
            symbol: cleanSymbol,
            interval: interval,
            candles: candles
        });

    } catch (error) {
        console.error('[CHART] Candles error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET CURRENT PRICE
// ============================================================
router.get('/price', verifyToken, async (req, res) => {
    try {
        const { symbol = 'BTCUSDT' } = req.query;
        const cleanSymbol = symbol.toUpperCase();

        const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch price');
        }

        const data = await response.json();

        res.json({
            success: true,
            symbol: data.symbol,
            price: parseFloat(data.price)
        });

    } catch (error) {
        console.error('[CHART] Price error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET SUPPORTED SYMBOLS
// ============================================================
router.get('/symbols', verifyToken, async (req, res) => {
    try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        
        if (!response.ok) {
            throw new Error('Failed to fetch symbols');
        }

        const data = await response.json();
        
        const symbols = data.symbols
            .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset
            }))
            .slice(0, 100);

        res.json({
            success: true,
            symbols: symbols
        });

    } catch (error) {
        console.error('[CHART] Symbols error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. SAVE CHART SETTINGS (User preferences)
// ============================================================
router.post('/settings', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { interval, symbol, theme } = req.body;

        const settings = {};
        if (interval) settings.interval = interval;
        if (symbol) settings.symbol = symbol;
        if (theme) settings.theme = theme;
        settings.updatedAt = Date.now();

        await db.ref(`chartSettings/${userId}`).update(settings);

        res.json({
            success: true,
            settings: settings
        });

    } catch (error) {
        console.error('[CHART] Save settings error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET CHART SETTINGS
// ============================================================
router.get('/settings', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const snapshot = await db.ref(`chartSettings/${userId}`).once('value');
        const settings = snapshot.exists() ? snapshot.val() : {};

        res.json({
            success: true,
            settings: {
                interval: settings.interval || '15m',
                symbol: settings.symbol || 'BTCUSDT',
                theme: settings.theme || 'dark'
            }
        });

    } catch (error) {
        console.error('[CHART] Get settings error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;