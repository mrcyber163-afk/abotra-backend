// ============================================================
// CONFIGURATION
// ============================================================

require('dotenv').config();

module.exports = {
    // Firebase Configuration
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || 'AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM',
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com',
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'abotra-proa1',
    
    // Server
    PORT: process.env.PORT || 5001,
    NODE_ENV: process.env.NODE_ENV || 'development',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://abotraproai.surge.sh',
    
    // Trading Fees
    OPEN_FEE_RATE: 0.001,
    CLOSE_FEE_RATE: 0.001,
    PERFORMANCE_FEE_PERCENT: 0.20,
    LEVERAGE_FEE_PERCENT: 0.005,
    
    // Risk Defaults
    DEFAULT_RISK: {
        dailyLossLimit: 500,
        maxOpenTrades: 10,
        maxLeverage: 100,
        minTradeAmount: 3,
        maxTradeAmount: 10000,
        tradingEnabled: true,
        allowBuy: true,
        allowSell: true,
        liquidationBufferPercent: 0.5
    },
    
    // Binance
    BINANCE_WS_URL: 'wss://stream.binance.com:9443/ws',
    BINANCE_REST_URL: 'https://api.binance.com/api/v3',
    
    // Bybit
    BYBIT_WS_URL: 'wss://stream.bybit.com/v5/public/spot',
    BYBIT_REST_URL: 'https://api.bybit.com/v5',
    
    // OKX
    OKX_WS_URL: 'wss://ws.okx.com:8443/ws/v5/public',
    OKX_REST_URL: 'https://www.okx.com/api/v5',
    
    // Supported Symbols
    SUPPORTED_SYMBOLS: [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
        'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'DOTUSDT', 'MATICUSDT',
        'LINKUSDT', 'AVAXUSDT', 'UNIUSDT', 'ATOMUSDT', 'ETCUSDT'
    ],
    
    // Scheduler Interval (ms)
    SCHEDULER_INTERVAL: 60000 // 1 minute
};