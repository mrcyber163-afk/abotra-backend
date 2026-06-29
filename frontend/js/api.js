// ============================================================
// API.JS - Frontend API Calls
// ============================================================

import { CONFIG } from './config.js';

async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
    // ✅ FIXED: Use API_URL instead of API_BASE_URL
    const url = `${CONFIG.API_URL}${endpoint}`;
    console.log('[API] Request:', method, url);
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            console.error('[API] Error response:', result);
            throw new Error(result.error || 'API request failed');
        }
        
        return result;
    } catch (error) {
        console.error('[API] Error:', error);
        throw error;
    }
}

// ============================================================
// AUTH API
// ============================================================
const AuthAPI = {
    registerEmail: (data) => apiRequest('/api/auth/register', 'POST', data),
    registerGoogle: (data) => apiRequest('/api/auth/register/google', 'POST', data),
    registerPhone: (data) => apiRequest('/api/auth/register/phone', 'POST', data),
    login: (data) => apiRequest('/api/auth/login', 'POST', data),
    verifyToken: (data) => apiRequest('/api/auth/verify-token', 'POST', data),
    verifyReferral: (code) => apiRequest(`/api/auth/verify-referral/${code}`, 'GET'),
    logout: () => apiRequest('/api/auth/logout', 'POST')
};

// ============================================================
// USER API
// ============================================================
const UserAPI = {
    getProfile: (token) => apiRequest('/api/user/profile', 'GET', null, token),
    getBalance: (token) => apiRequest('/api/user/balance', 'GET', null, token),
    updateProfile: (data, token) => apiRequest('/api/user/profile', 'PUT', data, token),
    getSubscription: (token) => apiRequest('/api/user/subscription', 'GET', null, token),
    updateStatus: (data, token) => apiRequest('/api/user/status', 'PUT', data, token)
};

// ============================================================
// TRADE API
// ============================================================
const TradeAPI = {
    getTrades: (uid, token) => apiRequest(`/api/trades/trades/${uid}`, 'GET', null, token),
    openTrade: (data, token) => apiRequest('/api/trades/open', 'POST', data, token),
    closeTrade: (tradeId, data, token) => apiRequest(`/api/trades/${tradeId}/close`, 'POST', data, token),
    getStats: (token) => apiRequest('/api/trades/stats', 'GET', null, token),
    addBalance: (data, token) => apiRequest('/api/trades/add', 'POST', data, token),
    moveBalance: (token) => apiRequest('/api/trades/move', 'POST', null, token),
    getHistory: (uid, token) => apiRequest(`/api/trades/history/${uid}`, 'GET', null, token)
};

// ============================================================
// LEADERBOARD API
// ============================================================
const LeaderboardAPI = {
    getLeaderboard: (token) => apiRequest('/api/leaderboard', 'GET', null, token),
    getTop: (token) => apiRequest('/api/leaderboard/top', 'GET', null, token)
};

// ============================================================
// AFFILIATE API
// ============================================================
const AffiliateAPI = {
    getReferrals: (token) => apiRequest('/api/affiliate/referrals', 'GET', null, token),
    getTeam: (token) => apiRequest('/api/affiliate/team', 'GET', null, token),
    getLeaderboard: (token) => apiRequest('/api/affiliate/leaderboard', 'GET', null, token),
    withdraw: (data, token) => apiRequest('/api/affiliate/withdraw', 'POST', data, token),
    getStats: (token) => apiRequest('/api/affiliate/stats', 'GET', null, token)
};

// ============================================================
// KYC API
// ============================================================
const KycAPI = {
    getStatus: (token) => apiRequest('/api/kyc/status', 'GET', null, token),
    submit: (data, token) => apiRequest('/api/kyc/submit', 'POST', data, token),
    getMyData: (token) => apiRequest('/api/kyc/my-data', 'GET', null, token)
};

// ============================================================
// DEPOSIT API
// ============================================================
const DepositAPI = {
    getHistory: (token) => apiRequest('/api/deposit/history', 'GET', null, token),
    create: (data, token) => apiRequest('/api/deposit/create', 'POST', data, token)
};

// ============================================================
// WITHDRAW API
// ============================================================
const WithdrawAPI = {
    getHistory: (token) => apiRequest('/api/withdraw/history', 'GET', null, token),
    create: (data, token) => apiRequest('/api/withdraw/create', 'POST', data, token)
};

// ============================================================
// WALLET API
// ============================================================
const WalletAPI = {
    getBalance: (token) => apiRequest('/api/wallet/balance', 'GET', null, token),
    getHistory: (token) => apiRequest('/api/wallet/history', 'GET', null, token),
    transfer: (data, token) => apiRequest('/api/wallet/transfer', 'POST', data, token),
    findUser: (email, token) => apiRequest(`/api/wallet/find-user/${email}`, 'GET', null, token)
};

// ============================================================
// P2P API
// ============================================================
const P2pAPI = {
    getOffers: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/p2p/offers?${query}`, 'GET', null, token);
    },
    getOffer: (offerId, token) => apiRequest(`/api/p2p/offers/${offerId}`, 'GET', null, token),
    createOffer: (data, token) => apiRequest('/api/p2p/offers', 'POST', data, token),
    updateOffer: (offerId, data, token) => apiRequest(`/api/p2p/offers/${offerId}`, 'PUT', data, token),
    deleteOffer: (offerId, token) => apiRequest(`/api/p2p/offers/${offerId}`, 'DELETE', null, token),
    getMyOffers: (token) => apiRequest('/api/p2p/my-offers', 'GET', null, token),
    createOrder: (data, token) => apiRequest('/api/p2p/orders', 'POST', data, token),
    getMyOrders: (token) => apiRequest('/api/p2p/orders/my-orders', 'GET', null, token),
    getOrder: (orderId, token) => apiRequest(`/api/p2p/orders/${orderId}`, 'GET', null, token),
    updateOrderStatus: (orderId, data, token) => apiRequest(`/api/p2p/orders/${orderId}/status`, 'PUT', data, token),
    cancelOrder: (orderId, data, token) => apiRequest(`/api/p2p/orders/${orderId}/cancel`, 'POST', data, token),
    getExchangeRates: () => apiRequest('/api/p2p/exchange-rates', 'GET')
};

// ============================================================
// CHAT API
// ============================================================
const ChatAPI = {
    getMessages: (orderId, token) => apiRequest(`/api/chat/${orderId}/messages`, 'GET', null, token),
    sendMessage: (orderId, data, token) => apiRequest(`/api/chat/${orderId}/messages`, 'POST', data, token),
    getUnreadCount: (token) => apiRequest('/api/chat/unread-count', 'GET', null, token),
    markAsRead: (orderId, token) => apiRequest(`/api/chat/${orderId}/read`, 'POST', null, token)
};

// ============================================================
// BOT API
// ============================================================
const BotAPI = {
    getRobots: (token) => apiRequest('/api/bot/robots', 'GET', null, token),
    startRobot: (data, token) => apiRequest('/api/bot/start', 'POST', data, token),
    restartRobot: (data, token) => apiRequest('/api/bot/restart', 'POST', data, token),
    addCapital: (robotId, data, token) => apiRequest(`/api/bot/add-capital/${robotId}`, 'POST', data, token),
    getStats: (token) => apiRequest('/api/bot/stats', 'GET', null, token),
    getLogs: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/bot/logs?${query}`, 'GET', null, token);
    },
    addLog: (data, token) => apiRequest('/api/bot/logs', 'POST', data, token),
    clearLogs: (token) => apiRequest('/api/bot/logs/clear', 'DELETE', null, token),
    processDaily: (token) => apiRequest('/api/bot/process-daily', 'POST', null, token)
};

// ============================================================
// NOTIFICATIONS API
// ============================================================
const NotificationAPI = {
    getNotifications: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/notifications?${query}`, 'GET', null, token);
    },
    getUnreadCount: (token) => apiRequest('/api/notifications/unread-count', 'GET', null, token),
    markRead: (notifId, token) => apiRequest(`/api/notifications/${notifId}/read`, 'PUT', null, token),
    markAllRead: (token) => apiRequest('/api/notifications/mark-all-read', 'PUT', null, token),
    delete: (notifId, token) => apiRequest(`/api/notifications/${notifId}`, 'DELETE', null, token),
    clearAll: (token) => apiRequest('/api/notifications/clear-all', 'DELETE', null, token),
    create: (data, token) => apiRequest('/api/notifications', 'POST', data, token),
    subscribe: (data, token) => apiRequest('/api/notifications/subscribe', 'POST', data, token)
};

// ============================================================
// ROBOTS API (Purchase)
// ============================================================
const RobotsAPI = {
    getRobots: (token) => apiRequest('/api/robots', 'GET', null, token),
    getMyRobots: (token) => apiRequest('/api/robots/my-robots', 'GET', null, token),
    purchase: (data, token) => apiRequest('/api/robots/purchase', 'POST', data, token),
    getRobot: (robotId, token) => apiRequest(`/api/robots/${robotId}`, 'GET', null, token)
};

// ============================================================
// SIGNALS API
// ============================================================
const SignalsAPI = {
    create: (data, token) => apiRequest('/api/signals', 'POST', data, token),
    getHistory: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/signals/history?${query}`, 'GET', null, token);
    },
    getStats: (token) => apiRequest('/api/signals/stats', 'GET', null, token),
    getLatest: (token) => apiRequest('/api/signals/latest', 'GET', null, token),
    delete: (signalId, token) => apiRequest(`/api/signals/${signalId}`, 'DELETE', null, token)
};

// ============================================================
// SUBSCRIPTION API
// ============================================================
const SubscriptionAPI = {
    get: (token) => apiRequest('/api/subscription', 'GET', null, token),
    create: (data, token) => apiRequest('/api/subscription', 'POST', data, token),
    cancel: (token) => apiRequest('/api/subscription', 'DELETE', null, token),
    getPlans: () => apiRequest('/api/subscription/plans', 'GET')
};

// ============================================================
// COPY TRADING API
// ============================================================
const CopyTradingAPI = {
    getMasterTrades: (token) => apiRequest('/api/copy-trading/master-trades', 'GET', null, token),
    copyTrade: (data, token) => apiRequest('/api/copy-trading/copy', 'POST', data, token)
};

// ============================================================
// TRADE HISTORY API
// ============================================================
const TradeHistoryAPI = {
    getHistory: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/trade-history/history?${query}`, 'GET', null, token);
    },
    getTrade: (tradeId, token) => apiRequest(`/api/trade-history/trade/${tradeId}`, 'GET', null, token),
    getStats: (token) => apiRequest('/api/trade-history/stats', 'GET', null, token)
};

// ============================================================
// MARKET API
// ============================================================
const MarketAPI = {
    getMarketData: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/market?${query}`, 'GET', null, token);
    },
    getWatchlist: (token) => apiRequest('/api/market/watchlist', 'GET', null, token),
    updateWatchlist: (data, token) => apiRequest('/api/market/watchlist', 'POST', data, token),
    getCoin: (symbol, token) => apiRequest(`/api/market/coin/${symbol}`, 'GET', null, token)
};

// ============================================================
// CHART API
// ============================================================
const ChartAPI = {
    getLive: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/chart/live?${query}`, 'GET', null, token);
    },
    getCandles: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/chart/candles?${query}`, 'GET', null, token);
    },
    getPrice: (params, token) => {
        const query = new URLSearchParams(params).toString();
        return apiRequest(`/api/chart/price?${query}`, 'GET', null, token);
    },
    getSymbols: (token) => apiRequest('/api/chart/symbols', 'GET', null, token),
    saveSettings: (data, token) => apiRequest('/api/chart/settings', 'POST', data, token),
    getSettings: (token) => apiRequest('/api/chart/settings', 'GET', null, token)
};

// ============================================================
// EXPORTS
// ============================================================
export { 
    AuthAPI, 
    UserAPI, 
    TradeAPI, 
    LeaderboardAPI,
    AffiliateAPI,
    KycAPI,
    DepositAPI,
    WithdrawAPI,
    WalletAPI,
    P2pAPI,
    ChatAPI,
    BotAPI,
    NotificationAPI,
    RobotsAPI,
    SignalsAPI,
    SubscriptionAPI,
    CopyTradingAPI,
    TradeHistoryAPI,
    MarketAPI,
    ChartAPI,
    apiRequest 
};
