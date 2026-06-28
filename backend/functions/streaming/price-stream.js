// ============================================================
// PRICE-STREAM.JS - REST API Only (No WebSocket)
// ============================================================
// Location: backend/functions/streaming/price-stream.js
// ============================================================

const axios = require('axios');

class PriceStream {
    constructor() {
        this.prices = {};
        this.activeSymbols = new Set(['BTCUSDT']);
        this.listeners = [];
        this.interval = null;
        this.isPolling = false;
        this.startPolling();
    }
    
    startPolling() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        console.log('[PRICE] Starting price polling (REST API)...');
        
        // Initial fetch immediately
        this.fetchAllPrices();
        
        // Then fetch every 5 seconds
        this.interval = setInterval(() => {
            this.fetchAllPrices();
        }, 5000);
    }
    
    async fetchAllPrices() {
        if (this.isPolling) return;
        this.isPolling = true;
        
        const symbols = Array.from(this.activeSymbols);
        
        try {
            // Fetch all prices in parallel
            const promises = symbols.map(symbol => this.fetchPrice(symbol));
            await Promise.allSettled(promises);
        } catch (error) {
            // Silently handle errors
        } finally {
            this.isPolling = false;
        }
    }
    
    async fetchPrice(symbol) {
        try {
            const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
                timeout: 5000
            });
            
            if (response.data && response.data.price) {
                const price = parseFloat(response.data.price);
                if (price > 0) {
                    this.prices[symbol] = price;
                    this.notifyListeners(symbol, price);
                }
            }
        } catch (error) {
            // Silent fail - price will be fetched on next interval
            // Only log if it's not a timeout error (too noisy)
            if (error.code !== 'ECONNABORTED') {
                console.debug(`[PRICE] Failed to fetch ${symbol}: ${error.message}`);
            }
        }
    }
    
    subscribe(symbols) {
        const cleanSymbols = symbols.map(s => s.toUpperCase());
        let added = false;
        
        for (const symbol of cleanSymbols) {
            if (!this.activeSymbols.has(symbol)) {
                this.activeSymbols.add(symbol);
                added = true;
            }
        }
        
        if (added) {
            console.log(`[PRICE] Subscribed to: ${cleanSymbols.join(', ')}`);
            // Fetch new symbols immediately
            for (const symbol of cleanSymbols) {
                this.fetchPrice(symbol);
            }
        }
    }
    
    unsubscribe(symbols) {
        const cleanSymbols = symbols.map(s => s.toUpperCase());
        let removed = false;
        
        for (const symbol of cleanSymbols) {
            if (this.activeSymbols.has(symbol)) {
                this.activeSymbols.delete(symbol);
                removed = true;
            }
        }
        
        if (removed) {
            console.log(`[PRICE] Unsubscribed from: ${cleanSymbols.join(', ')}`);
        }
    }
    
    onPrice(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }
    
    notifyListeners(symbol, price) {
        for (const listener of this.listeners) {
            try {
                listener(symbol, price);
            } catch (error) {
                // Ignore listener errors
            }
        }
    }
    
    getPrice(symbol) {
        const cleanSymbol = symbol.toUpperCase();
        return this.prices[cleanSymbol] || 0;
    }
    
    getAllPrices() {
        return { ...this.prices };
    }
    
    getActiveSymbols() {
        return Array.from(this.activeSymbols);
    }
    
    async updateActiveSymbols() {
        // This method is called by the scheduler
        // Just fetch all prices for active symbols
        await this.fetchAllPrices();
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[PRICE] Price polling stopped');
        }
    }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================
let instance = null;

function getPriceStream() {
    if (!instance) {
        instance = new PriceStream();
        console.log('[PRICE] ✅ Price stream instance created (REST API mode)');
    }
    return instance;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    PriceStream,
    getPriceStream
};