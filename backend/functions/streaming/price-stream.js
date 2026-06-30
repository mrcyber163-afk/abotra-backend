// functions/streaming/price-stream.js
const WebSocket = require('ws');

class PriceStream {
    constructor() {
        this.ws = null;
        this.prices = {};
        this.isConnected = false;
        this.reconnectAttempt = 0;
        this.maxReconnectAttempts = 10;
        this.activeSymbols = new Set(['BTCUSDT']);
    }
    
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        
        console.log('[PRICE] Connecting to Binance...');
        this.ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');
        
        this.ws.on('open', () => {
            console.log('[PRICE] ✅ Connected');
            this.isConnected = true;
            this.reconnectAttempt = 0;
        });
        
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                if (message.p) {
                    const symbol = message.s || 'BTCUSDT';
                    const price = parseFloat(message.p);
                    if (price > 0) {
                        this.prices[symbol] = price;
                    }
                }
            } catch (error) {}
        });
        
        this.ws.on('error', (error) => {
            console.error('[PRICE] Error:', error.message);
        });
        
        this.ws.on('close', () => {
            console.log('[PRICE] Disconnected');
            this.isConnected = false;
            this.reconnect();
        });
    }
    
    reconnect() {
        if (this.reconnectAttempt >= this.maxReconnectAttempts) {
            console.error('[PRICE] Max reconnect attempts reached');
            return;
        }
        const delay = Math.min(5000, 1000 * Math.pow(1.5, this.reconnectAttempt));
        this.reconnectAttempt++;
        console.log(`[PRICE] Reconnecting in ${delay}ms...`);
        setTimeout(() => this.connect(), delay);
    }
    
    getPrice(symbol) {
        const cleanSymbol = symbol.toUpperCase();
        return this.prices[cleanSymbol] || 0;
    }
    
    async updateActiveSymbols() {
        return true;
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
    getPriceStream
};