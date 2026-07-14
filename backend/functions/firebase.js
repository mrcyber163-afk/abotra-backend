// ============================================================
// FIREBASE - REST API ONLY (No Admin SDK)
// ============================================================

const config = require('./config');

// ============================================================
// DATABASE REST METHODS
// ============================================================
async function restFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ?
        endpoint :
        `${config.FIREBASE_DATABASE_URL}/${endpoint}.json`;
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Firebase REST API error: ${response.status} - ${errorText}`);
    }
    
    if (response.status === 204) return null;
    return response.json();
}

async function restGet(path) {
    try {
        return await restFetch(path);
    } catch (error) {
        console.error(`[REST] GET ${path} error:`, error.message);
        return null;
    }
}

async function restPut(path, data) {
    try {
        return await restFetch(path, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error(`[REST] PUT ${path} error:`, error.message);
        throw error;
    }
}

async function restPost(path, data) {
    try {
        return await restFetch(path, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error(`[REST] POST ${path} error:`, error.message);
        throw error;
    }
}

async function restPatch(path, data) {
    try {
        return await restFetch(path, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error(`[REST] PATCH ${path} error:`, error.message);
        throw error;
    }
}

async function restDelete(path) {
    try {
        return await restFetch(path, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error(`[REST] DELETE ${path} error:`, error.message);
        throw error;
    }
}

// ============================================================
// AUTHENTICATION REST METHODS
// ============================================================
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';

async function authRequest(endpoint, data) {
    const url = `${IDENTITY_TOOLKIT_URL}/${endpoint}?key=${config.FIREBASE_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error?.message || 'Authentication failed');
    }
    return result;
}

async function authSignIn(email, password) {
    return authRequest('accounts:signInWithPassword', {
        email,
        password,
        returnSecureToken: true
    });
}

async function authSignUp(email, password) {
    return authRequest('accounts:signUp', {
        email,
        password,
        returnSecureToken: true
    });
}

async function authGetUser(idToken) {
    return authRequest('accounts:lookup', { idToken });
}

async function authRefreshToken(refreshToken) {
    const url = `https://securetoken.googleapis.com/v1/token?key=${config.FIREBASE_API_KEY}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error?.message || 'Token refresh failed');
    }
    return result;
}

// ============================================================
// VERIFY ID TOKEN
// ============================================================
async function verifyIdToken(idToken) {
    try {
        const userInfo = await authGetUser(idToken);
        if (userInfo && userInfo.users && userInfo.users.length > 0) {
            const user = userInfo.users[0];
            return {
                uid: user.localId,
                email: user.email,
                emailVerified: user.emailVerified || false,
                displayName: user.displayName || user.email?.split('@')[0] || 'User',
                photoURL: user.photoUrl || null,
                phoneNumber: user.phoneNumber || null,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt
            };
        }
        throw new Error('User not found');
    } catch (error) {
        console.error('[AUTH] verifyIdToken error:', error.message);
        throw new Error('Invalid or expired token');
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    restGet,
    restPut,
    restPost,
    restPatch,
    restDelete,
    authSignIn,
    authSignUp,
    authGetUser,
    authRefreshToken,
    verifyIdToken
};