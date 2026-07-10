// ============================================================
// FIREBASE - REST API ONLY (No Admin SDK)
// ============================================================

require('dotenv').config();

// ============================================================
// CONFIG
// ============================================================
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY;
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'abotra-proa1';

// ============================================================
// REST API HELPERS
// ============================================================
async function restFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${FIREBASE_DATABASE_URL}/${endpoint}.json`;
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
    
    const data = await response.json();
    return data;
}

// ============================================================
// DATABASE REST METHODS
// ============================================================
async function restGet(path) {
    try {
        const data = await restFetch(path);
        return data;
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
// AUTHENTICATION REST METHODS (Identity Toolkit)
// ============================================================
const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';

async function authRequest(endpoint, data) {
    const url = `${IDENTITY_TOOLKIT_URL}/${endpoint}?key=${FIREBASE_WEB_API_KEY}`;
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
    return authRequest('accounts:lookup', {
        idToken
    });
}

async function authUpdateUser(idToken, data) {
    return authRequest('accounts:update', {
        idToken,
        ...data,
        returnSecureToken: true
    });
}

async function authDeleteUser(idToken) {
    return authRequest('accounts:delete', {
        idToken
    });
}

async function authSendPasswordReset(email) {
    return authRequest('accounts:sendOobCode', {
        requestType: 'PASSWORD_RESET',
        email
    });
}

async function authSendEmailVerification(idToken) {
    return authRequest('accounts:sendOobCode', {
        requestType: 'VERIFY_EMAIL',
        idToken
    });
}

async function authRefreshToken(refreshToken) {
    const url = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_WEB_API_KEY}`;
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
// VERIFY ID TOKEN (Using REST API)
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
                providerData: user.providerUserInfo || []
            };
        }
        throw new Error('User not found');
    } catch (error) {
        console.error('[AUTH] verifyIdToken error:', error.message);
        throw new Error('Invalid or expired token');
    }
}

// ============================================================
// DATABASE READ WITH AUTH (using idToken)
// ============================================================
async function restGetAuth(path, idToken) {
    try {
        const url = `${FIREBASE_DATABASE_URL}/${path}.json?auth=${idToken}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error(`[REST] GET auth ${path} error:`, error.message);
        return null;
    }
}

async function restPutAuth(path, data, idToken) {
    const url = `${FIREBASE_DATABASE_URL}/${path}.json?auth=${idToken}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function restPatchAuth(path, data, idToken) {
    const url = `${FIREBASE_DATABASE_URL}/${path}.json?auth=${idToken}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

// ============================================================
// DUMMY OBJECTS (for compatibility)
// ============================================================
// These are only for compatibility with existing code that expects
// db.ref() pattern. All actual operations should use restGet/Put/Post/Patch.
const dummyRef = (path) => ({
    once: async (event) => {
        const data = await restGet(path);
        return {
            exists: () => data !== null && data !== undefined,
            val: () => data,
            forEach: (callback) => {
                if (data && typeof data === 'object') {
                    Object.keys(data).forEach(key => {
                        callback({ key, val: () => data[key] });
                    });
                }
            }
        };
    },
    set: async (data) => restPut(path, data),
    update: async (data) => restPatch(path, data),
    push: async (data) => {
        const newId = Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
        const fullPath = `${path}/${newId}`;
        await restPut(fullPath, data);
        return { key: newId, set: async (d) => restPut(fullPath, d) };
    },
    remove: async () => restDelete(path),
    transaction: async (updateFn) => {
        const current = await restGet(path);
        const result = updateFn(current);
        await restPut(path, result);
        return { committed: true, snapshot: { val: () => result } };
    },
    child: (childPath) => dummyRef(`${path}/${childPath}`),
    orderByChild: () => ({
        equalTo: async (value) => {
            const data = await restGet(path);
            const result = {};
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(key => {
                    if (data[key] && data[key][childPath] === value) {
                        result[key] = data[key];
                    }
                });
            }
            return {
                exists: () => Object.keys(result).length > 0,
                forEach: (callback) => {
                    Object.keys(result).forEach(key => {
                        callback({ key, val: () => result[key] });
                    });
                }
            };
        },
        limitToLast: async (limit) => {
            const data = await restGet(path);
            const result = {};
            if (data && typeof data === 'object') {
                const keys = Object.keys(data).sort();
                const lastKeys = keys.slice(-limit);
                lastKeys.forEach(key => { result[key] = data[key]; });
            }
            return {
                exists: () => Object.keys(result).length > 0,
                forEach: (callback) => {
                    Object.keys(result).forEach(key => {
                        callback({ key, val: () => result[key] });
                    });
                }
            };
        }
    })
});

const dummyDB = {
    ref: (path) => dummyRef(path)
};

const dummyAuth = {
    verifyIdToken: async (token) => verifyIdToken(token),
    getUser: async (uid) => {
        // Fallback: try to get user from database
        const userData = await restGet(`users/${uid}`);
        if (userData) {
            return { uid, ...userData };
        }
        throw new Error('User not found');
    }
};

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    // Config
    FIREBASE_WEB_API_KEY,
    FIREBASE_DATABASE_URL,
    FIREBASE_PROJECT_ID,
    
    // Database REST
    restGet,
    restPut,
    restPost,
    restPatch,
    restDelete,
    restGetAuth,
    restPutAuth,
    restPatchAuth,
    
    // Auth REST
    authSignIn,
    authSignUp,
    authGetUser,
    authUpdateUser,
    authDeleteUser,
    authSendPasswordReset,
    authSendEmailVerification,
    authRefreshToken,
    verifyIdToken,
    
    // Compatibility exports (for existing code)
    getDB: () => dummyDB,
    getAuth: () => dummyAuth,
    admin: {
        auth: () => dummyAuth,
        database: () => dummyDB,
        initializeApp: () => { console.log('[FIREBASE] Admin SDK is disabled (REST API only)'); }
    },
    db: dummyDB,
    auth: dummyAuth
};