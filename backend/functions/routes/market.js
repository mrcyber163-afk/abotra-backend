// functions/routes/market.js
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
// 1. GET MARKET DATA (from cache or live)
// ============================================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { limit = 100 } = req.query;

        // Try to get from cache first
        const cacheRef = db.ref('marketSnapshot');
        const cacheSnap = await cacheRef.once('value');
        
        if (cacheSnap.exists()) {
            const cached = cacheSnap.val();
            // Check if cache is fresh (less than 5 minutes old)
            const age = Date.now() - (cached.timestamp || 0);
            if (age < 5 * 60 * 1000) {
                return res.json({
                    success: true,
                    source: 'cache',
                    data: cached.data.slice(0, parseInt(limit)),
                    total: cached.data.length
                });
            }
        }

        // If cache is stale or not available, fetch live data
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h'
        );
        
        if (!response.ok) {
            // If live fails but we have cache, return it anyway
            if (cacheSnap.exists()) {
                const cached = cacheSnap.val();
                return res.json({
                    success: true,
                    source: 'cache_stale',
                    data: cached.data.slice(0, parseInt(limit)),
                    total: cached.data.length
                });
            }
            throw new Error('Failed to fetch market data');
        }

        const data = await response.json();
        const marketData = data.map(coin => ({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            price: coin.current_price || 0,
            priceChangePercent: coin.price_change_percentage_24h || 0,
            volume: coin.total_volume || 0,
            image: coin.image || '',
            marketCap: coin.market_cap || 0
        })).filter(coin => coin.price > 0 && coin.volume > 0);

        // Update cache
        await db.ref('marketSnapshot').set({
            data: marketData,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            source: 'live',
            data: marketData.slice(0, parseInt(limit)),
            total: marketData.length
        });

    } catch (error) {
        console.error('[MARKET] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET WATCHLIST
// ============================================================
router.get('/watchlist', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const watchlistRef = db.ref(`watchlist/${userId}`);
        const snapshot = await watchlistRef.once('value');
        
        const watchlist = snapshot.exists() ? snapshot.val() : [];

        // Get prices for watchlist coins
        if (watchlist.length > 0) {
            const symbols = watchlist.join(',');
            const response = await fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(symbols.toLowerCase())}&order=market_cap_desc&per_page=100&page=1&sparkline=false`
            );
            
            if (response.ok) {
                const data = await response.json();
                const coinData = data.map(coin => ({
                    symbol: coin.symbol.toUpperCase(),
                    name: coin.name,
                    price: coin.current_price || 0,
                    priceChangePercent: coin.price_change_percentage_24h || 0,
                    volume: coin.total_volume || 0,
                    image: coin.image || '',
                    marketCap: coin.market_cap || 0
                }));
                
                return res.json({
                    success: true,
                    watchlist: watchlist,
                    coins: coinData
                });
            }
        }

        res.json({
            success: true,
            watchlist: watchlist,
            coins: []
        });

    } catch (error) {
        console.error('[MARKET] Watchlist error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. UPDATE WATCHLIST
// ============================================================
router.post('/watchlist', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { symbol, action } = req.body;

        if (!symbol) {
            return res.status(400).json({ success: false, error: 'Symbol required' });
        }

        const watchlistRef = db.ref(`watchlist/${userId}`);
        const snapshot = await watchlistRef.once('value');
        let watchlist = snapshot.exists() ? snapshot.val() : [];

        if (action === 'add') {
            if (!watchlist.includes(symbol)) {
                watchlist.push(symbol);
            }
        } else if (action === 'remove') {
            watchlist = watchlist.filter(s => s !== symbol);
        } else {
            return res.status(400).json({ success: false, error: 'Invalid action' });
        }

        await watchlistRef.set(watchlist);

        res.json({
            success: true,
            watchlist: watchlist
        });

    } catch (error) {
        console.error('[MARKET] Update watchlist error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. GET SINGLE COIN DATA
// ============================================================
router.get('/coin/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const cleanSymbol = symbol.toUpperCase();

        // Check cache first
        const db = getDB();
        const cacheRef = db.ref('marketSnapshot');
        const cacheSnap = await cacheRef.once('value');
        
        if (cacheSnap.exists()) {
            const cached = cacheSnap.val();
            const coin = cached.data.find(c => c.symbol === cleanSymbol);
            if (coin) {
                return res.json({
                    success: true,
                    source: 'cache',
                    coin: coin
                });
            }
        }

        // Fetch from API
        const response = await fetch(
            `https://api.coingecko.com/api/v3/coins/${cleanSymbol.toLowerCase()}?market_data=true`
        );
        
        if (!response.ok) {
            return res.status(404).json({ success: false, error: 'Coin not found' });
        }

        const data = await response.json();
        const coin = {
            symbol: data.symbol.toUpperCase(),
            name: data.name,
            price: data.market_data.current_price.usd || 0,
            priceChangePercent: data.market_data.price_change_percentage_24h || 0,
            volume: data.market_data.total_volume.usd || 0,
            image: data.image.large || '',
            marketCap: data.market_data.market_cap.usd || 0
        };

        res.json({
            success: true,
            source: 'live',
            coin: coin
        });

    } catch (error) {
        console.error('[MARKET] Coin error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;