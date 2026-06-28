// ============================================================
// HELPERS.JS - Utility Functions
// ============================================================
// Location: backend/functions/helpers.js
// ============================================================

// ============================================================
// SNAPSHOT HELPER - For REST API compatibility
// ============================================================
class Snapshot {
    constructor(data) {
        this._data = data;
        this.key = null;
        this.ref = null;
    }
    
    exists() {
        return this._data !== null && this._data !== undefined;
    }
    
    val() {
        return this._data;
    }
    
    forEach(callback) {
        if (this._data && typeof this._data === 'object') {
            for (const key of Object.keys(this._data)) {
                const childSnapshot = new Snapshot(this._data[key]);
                childSnapshot.key = key;
                callback(childSnapshot);
            }
        }
    }
    
    numChildren() {
        if (this._data && typeof this._data === 'object') {
            return Object.keys(this._data).length;
        }
        return 0;
    }
    
    child() {
        return this;
    }
    
    toJSON() {
        return this._data;
    }
}

// ============================================================
// GET DB WITH CACHE
// ============================================================
let cachedDB = null;

function getDB() {
    if (cachedDB) return cachedDB;
    try {
        const firebase = require('./firebase');
        cachedDB = firebase.getDB();
        return cachedDB;
    } catch (error) {
        console.error('[HELPERS] Failed to get DB:', error.message);
        return null;
    }
}

async function testConnection() {
    try {
        const firebase = require('./firebase');
        return await firebase.testConnection();
    } catch (error) {
        console.error('[HELPERS] Connection test failed:', error.message);
        return false;
    }
}

// ============================================================
// TRANSACTION WITH RETRY
// ============================================================
async function runTransaction(path, updateFn, maxRetries = 3) {
    const db = getDB();
    
    if (!db) {
        throw new Error('[TRANSACTION] Firebase database not initialized');
    }
    
    const ref = db.ref(path);
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Use our custom transaction
            const snapshot = await ref.once('value');
            const currentData = snapshot.val();
            const newData = updateFn(currentData);
            
            if (newData !== undefined && newData !== null) {
                await ref.set(newData);
                return { 
                    committed: true, 
                    snapshot: new Snapshot(newData) 
                };
            }
            return { 
                committed: false, 
                snapshot: new Snapshot(currentData) 
            };
        } catch (error) {
            lastError = error;
            console.error(`[TRANSACTION] Error on attempt ${attempt + 1}:`, error.message);
            if (attempt === maxRetries - 1) throw error;
            await sleep(100 * Math.pow(2, attempt));
        }
    }
    
    throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// ============================================================
// SAFE TRANSACTION WITH CONNECTION CHECK
// ============================================================
async function safeTransaction(path, updateFn, options = {}) {
    const { maxRetries = 3, timeout = 10000 } = options;
    
    try {
        const connected = await testConnection();
        if (!connected) {
            throw new Error('Firebase is not connected');
        }
    } catch (error) {
        console.error('[TRANSACTION] ❌ Connection check failed:', error.message);
        throw new Error('Cannot perform transaction: Firebase is offline');
    }
    
    return runTransaction(path, updateFn, maxRetries);
}

// ============================================================
// FORMAT USD
// ============================================================
function formatUsd(value) {
    const num = parseFloat(value || 0);
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
}

// ============================================================
// GENERATE ID
// ============================================================
function generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
}

// ============================================================
// GENERATE SHORT ID
// ============================================================
function generateShortId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============================================================
// SLEEP
// ============================================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// GET SYMBOL FROM TRADE
// ============================================================
function getSymbolFromTrade(trade) {
    if (!trade) return 'BTCUSDT';
    
    if (trade.symbol) {
        return trade.symbol.replace('/USDT', '').toUpperCase() + 'USDT';
    }
    if (trade.pair) {
        return trade.pair.replace('/USDT', '').toUpperCase() + 'USDT';
    }
    return 'BTCUSDT';
}

// ============================================================
// GET LEVERAGE FEE
// ============================================================
function getLeverageFee(leverage, config) {
    if (!config || !config.LEVERAGE_FEES) {
        return 0.10;
    }
    
    const fees = config.LEVERAGE_FEES;
    const leverageNum = parseInt(leverage) || 1;
    const keys = Object.keys(fees).map(Number).sort((a, b) => a - b);
    
    for (const key of keys) {
        if (leverageNum <= key) {
            return fees[key];
        }
    }
    
    return fees[keys[keys.length - 1]] || 0.10;
}

// ============================================================
// VALIDATE EMAIL
// ============================================================
function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ============================================================
// VALIDATE PHONE
// ============================================================
function isValidPhone(phone) {
    if (!phone) return false;
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone);
}

// ============================================================
// FORMAT NUMBER WITH COMMAS
// ============================================================
function formatNumber(value) {
    const num = parseFloat(value || 0);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// ============================================================
// ROUND TO DECIMALS
// ============================================================
function roundTo(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

// ============================================================
// CALCULATE PERCENTAGE CHANGE
// ============================================================
function percentChange(oldValue, newValue) {
    if (oldValue === 0) return 0;
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

// ============================================================
// GET CURRENT TIMESTAMP
// ============================================================
function now() {
    return Date.now();
}

// ============================================================
// GET ISO DATE
// ============================================================
function isoDate() {
    return new Date().toISOString();
}

// ============================================================
// TRUNCATE STRING
// ============================================================
function truncate(str, maxLength = 50) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

// ============================================================
// SAFE JSON PARSE
// ============================================================
function safeJsonParse(str, defaultValue = null) {
    if (!str) return defaultValue;
    try {
        return JSON.parse(str);
    } catch (error) {
        return defaultValue;
    }
}

// ============================================================
// RANDOM ITEM FROM ARRAY
// ============================================================
function randomItem(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    // Snapshot
    Snapshot,
    
    // DB
    getDB,
    testConnection,
    
    // Transaction
    runTransaction,
    safeTransaction,
    
    // Formatting
    formatUsd,
    formatNumber,
    
    // IDs
    generateId,
    generateShortId,
    
    // Time
    sleep,
    now,
    isoDate,
    
    // Symbols
    getSymbolFromTrade,
    getLeverageFee,
    
    // Validation
    isValidEmail,
    isValidPhone,
    
    // Utilities
    truncate,
    randomItem,
    percentChange,
    roundTo,
    safeJsonParse
};
