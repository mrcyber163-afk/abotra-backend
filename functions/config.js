// functions/config.js
module.exports = {
    // Trading Fees
    OPEN_FEE_PERCENT: 0.01,
    CLOSE_FEE_PERCENT: 0.01,
    PERFORMANCE_FEE_PERCENT: 0.20,
    
    // Leverage Fees
    LEVERAGE_FEES: {
        1: 0.005,
        2: 0.01,
        3: 0.01,
        5: 0.01,
        10: 0.02,
        20: 0.02,
        50: 0.04,
        100: 0.10
    },
    
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
        maintenanceMode: false,
        maxDailyTrades: 100,
        maxMarginPercent: 90,
        liquidationBufferPercent: 0.5
    },
    
    // Binance
    BINANCE_WS_URL: 'wss://stream.binance.com:9443/ws',
    
    // Intervals
    MONITOR_INTERVAL: 1000,
    PRICE_UPDATE_INTERVAL: 500,
    
    // Supported Symbols
    SUPPORTED_SYMBOLS: [
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
        'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'DOTUSDT', 'MATICUSDT',
        'SHIBUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'ATOMUSDT',
        'LTCUSDT', 'ETCUSDT', 'XLMUSDT', 'ALGOUSDT', 'VETUSDT',
        'FILUSDT', 'THETAUSDT', 'FTMUSDT', 'NEARUSDT', 'ARBUSDT',
        'APTUSDT', 'OPUSDT', 'ICPUSDT', 'AAVEUSDT', 'MKRUSDT',
        'CRVUSDT', 'SUSHIUSDT', 'COMPUSDT', 'SNXUSDT', 'ZECUSDT',
        'DASHUSDT', 'XTZUSDT', 'EOSUSDT', 'NEOUSDT', 'IOTAUSDT'
    ]
};