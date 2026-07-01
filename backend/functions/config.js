// functions/config.js
module.exports = {
    // Trading Fees
    OPEN_FEE_RATE: 0.01,
    CLOSE_FEE_RATE: 0.01,
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
    
    // Supported Symbols
    SUPPORTED_SYMBOLS: [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
        'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'DOTUSDT', 'MATICUSDT'
    ]
};