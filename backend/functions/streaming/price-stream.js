// ============================================================
// PRICE-STREAM.JS - Binance WebSocket with Fallback URLs
// ============================================================
const WebSocket = require('ws');
const { getDB } = require('../firebase');
const config = require('../config');

class PriceStream {
    constructor() {
        this.ws = null;
        this.prices = {};
        this.subscriptions = new Map();
        this.isConnected = false;
        this.reconnectAttempt = 0;
        this.maxReconnectAttempts = 50;
        this.listeners = [];
        this.activeSymbols = new Set(['BTCUSDT']);
        
        // Multiple Binance URLs
        this.wsUrls = [
            'wss://stream.binance.com:9443/ws',
            'wss://stream.binance.com/ws',
            'wss://ws-api.binance.com/ws-api/v3',
            'wss://data-stream.binance.com/stream'
        ];
        this.currentUrlIndex = 0;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        
        const wsUrl = this.wsUrls[this.currentUrlIndex % this.wsUrls.length];
        console.log(`[PRICE] Connecting to Binance (${wsUrl})...`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
            console.log(`[PRICE] ✅ Connected to Binance (${wsUrl})`);
            this.isConnected = true;
            this.reconnectAttempt = 0;
            this.currentUrlIndex = 0;
            this.subscribeAll();
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (error) {}
        });

        this.ws.on('error', (error) => {
            console.error('[PRICE] WebSocket error:', error.message);
        });

        this.ws.on('close', () => {
            console.log('[PRICE] ❌ Disconnected from Binance');
            this.isConnected = false;
            this.reconnect();
        });
    }

    reconnect() {
        if (this.reconnectAttempt >= this.maxReconnectAttempts) {
            console.log('[PRICE] ⚠️ Max reconnect attempts reached');
            return;
        }
        
        if (this.reconnectAttempt > 0 && this.reconnectAttempt % 3 === 0) {
            this.currentUrlIndex++;
            console.log(`[PRICE] 🔄 Switching to next Binance URL`);
        }
        
        const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempt));
        this.reconnectAttempt++;
        setTimeout(() => this.connect(), delay);
    }

    handleMessage(message) {
        if (message.p) {
            const symbol = message.s;
            const price = parseFloat(message.p);
            if (price > 0) {
                this.prices[symbol] = price;
                this.notifyListeners(symbol, price);
            }
        }
    }

    subscribe(symbols) {
        const cleanSymbols = symbols.map(s => s.toUpperCase());
        for (const symbol of cleanSymbols) {
            this.activeSymbols.add(symbol);
        }
        if (this.isConnected) this.subscribeAll();
    }

    unsubscribe(symbols) {
        const cleanSymbols = symbols.map(s => s.toUpperCase());
        for (const symbol of cleanSymbols) {
            this.activeSymbols.delete(symbol);
        }
        if (this.isConnected) this.subscribeAll();
    }

    subscribeAll() {
        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) return;
        
        const symbols = Array.from(this.activeSymbols);
        if (symbols.length === 0) return;
        
        const streams = symbols.map(s => `${s.toLowerCase()}@trade`);
        const subMessage = {
            method: 'SUBSCRIBE',
            params: streams,
            id: Date.now()
        };
        
        this.ws.send(JSON.stringify(subMessage));
        console.log(`[PRICE] Subscribed to: ${symbols.join(', ')}`);
    }

    onPrice(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(symbol, price) {
        for (const listener of this.listeners) {
            try { listener(symbol, price); } catch (error) {}
        }
    }

    getPrice(symbol) {
        return this.prices[symbol.toUpperCase()] || 0;
    }

    getAllPrices() {
        return this.prices;
    }

    async updateActiveSymbols() {
        try {
            const db = getDB();
            if (!db) return;
            
            const snapshot = await db.ref('trades').once('value');
            const symbols = new Set(['BTCUSDT']);
            
            if (snapshot.exists()) {
                snapshot.forEach((userSnapshot) => {
                    userSnapshot.forEach((tradeSnapshot) => {
                        const trade = tradeSnapshot.val();
                        if (trade.status === 'open') {
                            let symbol = trade.symbol || 'BTC/USDT';
                            symbol = symbol.replace('/USDT', '').toUpperCase() + 'USDT';
                            symbols.add(symbol);
                        }
                    });
                });
            }
            
            const currentSymbols = Array.from(this.activeSymbols);
            const newSymbols = Array.from(symbols);
            
            const toAdd = newSymbols.filter(s => !currentSymbols.includes(s));
            if (toAdd.length > 0) this.subscribe(toAdd);
            
            const toRemove = currentSymbols.filter(s => !newSymbols.includes(s));
            if (toRemove.length > 0) this.unsubscribe(toRemove);
            
        } catch (error) {
            console.error('[PRICE] Error updating symbols:', error);
        }
    }
}

let instance = null;

function getPriceStream() {
    if (!instance) {
        instance = new PriceStream();
        instance.connect();
    }
    return instance;
}

module.exports = {
    PriceStream,
    getPriceStream
};
