// frontend/js/api.js
import { CONFIG } from './config.js';

async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
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
            throw new Error(result.error || 'API request failed');
        }
        
        return result;
    } catch (error) {
        console.error('[API] Error:', error);
        throw error;
    }
}

// Auth API
const AuthAPI = {
    registerEmail: (data) => apiRequest('/api/auth/register/email', 'POST', data),
    registerGoogle: (data) => apiRequest('/api/auth/register/google', 'POST', data),
    verifyReferral: (code) => apiRequest(`/api/auth/verify-referral/${code}`, 'GET')
};

// User API
const UserAPI = {
    getProfile: (token) => apiRequest('/api/user', 'GET', null, token),
    getBalance: (token) => apiRequest('/api/user/balance', 'GET', null, token)
};

export { AuthAPI, UserAPI, apiRequest };