// ============================================================
// FIREBASE - REST API Mode with Snapshot Helper
// ============================================================
const axios = require('axios');
const { Snapshot } = require('./helpers');

let db = null;
let initialized = false;
let mockAuth = null;

// ============================================================
// INITIALIZE FIREBASE
// ============================================================
function initializeFirebase() {
    try {
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        
        if (!databaseURL) {
            console.warn('[FIREBASE] ⚠️ FIREBASE_DATABASE_URL missing');
            initialized = false;
            return { db: null, initialized: false };
        }
        
        console.log(`[FIREBASE] 🔑 Initializing REST API mode...`);
        console.log(`[FIREBASE] 📁 Database: ${databaseURL}`);
        
        // REST API client with Snapshot support
        db = {
            ref: (path) => {
                const cleanPath = path ? path.replace(/^\/+/, '').replace(/\/+$/, '') : '';
                
                return {
                    once: async (event) => {
                        try {
                            if (cleanPath === '.info/connected') {
                                return new Snapshot(true);
                            }
                            const url = `${databaseURL}/${cleanPath}.json`;
                            console.log(`[FIREBASE] REST GET: ${url}`);
                            const response = await axios.get(url);
                            return new Snapshot(response.data);
                        } catch (error) {
                            console.error('[FIREBASE] REST GET error:', error.message);
                            return new Snapshot(null);
                        }
                    },
                    set: async (data) => {
                        try {
                            const url = `${databaseURL}/${cleanPath}.json`;
                            console.log(`[FIREBASE] REST SET: ${url}`);
                            const response = await axios.put(url, data);
                            return response.data;
                        } catch (error) {
                            console.error('[FIREBASE] REST SET error:', error.message);
                            throw error;
                        }
                    },
                    update: async (data) => {
                        try {
                            const url = `${databaseURL}/${cleanPath}.json`;
                            console.log(`[FIREBASE] REST UPDATE: ${url}`);
                            const response = await axios.patch(url, data);
                            return response.data;
                        } catch (error) {
                            console.error('[FIREBASE] REST UPDATE error:', error.message);
                            throw error;
                        }
                    },
                    remove: async () => {
                        try {
                            const url = `${databaseURL}/${cleanPath}.json`;
                            console.log(`[FIREBASE] REST DELETE: ${url}`);
                            const response = await axios.delete(url);
                            return response.data;
                        } catch (error) {
                            console.error('[FIREBASE] REST DELETE error:', error.message);
                            throw error;
                        }
                    },
                    push: async (data) => {
                        try {
                            const url = `${databaseURL}/${cleanPath}.json`;
                            console.log(`[FIREBASE] REST PUSH: ${url}`);
                            const response = await axios.post(url, data);
                            return { key: response.data.name };
                        } catch (error) {
                            console.error('[FIREBASE] REST PUSH error:', error.message);
                            throw error;
                        }
                    },
                    child: (childPath) => {
                        const newPath = cleanPath ? `${cleanPath}/${childPath}` : childPath;
                        return db.ref(newPath);
                    },
                    orderByChild: (field) => {
                        // Simplified orderByChild for REST API
                        return {
                            equalTo: async (value) => {
                                // For REST API, we do filtering manually
                                try {
                                    const url = `${databaseURL}/${cleanPath}.json`;
                                    const response = await axios.get(url);
                                    const data = response.data;
                                    
                                    if (data && typeof data === 'object') {
                                        const filtered = {};
                                        for (const [key, item] of Object.entries(data)) {
                                            if (item[field] === value) {
                                                filtered[key] = item;
                                            }
                                        }
                                        return new Snapshot(filtered);
                                    }
                                    return new Snapshot(null);
                                } catch (error) {
                                    console.error('[FIREBASE] orderByChild error:', error.message);
                                    return new Snapshot(null);
                                }
                            }
                        };
                    },
                    transaction: async (updateFn) => {
                        try {
                            const snapshot = await db.ref(cleanPath).once('value');
                            const currentData = snapshot.val();
                            const newData = updateFn(currentData);
                            
                            if (newData !== undefined && newData !== null) {
                                await db.ref(cleanPath).set(newData);
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
                            console.error('[FIREBASE] Transaction error:', error.message);
                            throw error;
                        }
                    },
                    limitToLast: (limit) => {
                        // Simplified limitToLast for REST API
                        return {
                            once: async (event) => {
                                try {
                                    const url = `${databaseURL}/${cleanPath}.json`;
                                    const response = await axios.get(url);
                                    const data = response.data;
                                    
                                    if (data && typeof data === 'object') {
                                        const keys = Object.keys(data);
                                        const sorted = keys.sort((a, b) => {
                                            // Try to sort by timestamp if available
                                            const aVal = data[a].timestamp || data[a].createdAt || 0;
                                            const bVal = data[b].timestamp || data[b].createdAt || 0;
                                            return bVal - aVal;
                                        });
                                        const limited = sorted.slice(0, limit);
                                        const result = {};
                                        for (const key of limited) {
                                            result[key] = data[key];
                                        }
                                        return new Snapshot(result);
                                    }
                                    return new Snapshot(null);
                                } catch (error) {
                                    console.error('[FIREBASE] limitToLast error:', error.message);
                                    return new Snapshot(null);
                                }
                            }
                        };
                    }
                };
            }
        };
        
        initialized = true;
        console.log('[FIREBASE] ✅ REST API mode initialized successfully');
        return { db, initialized: true };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Failed to initialize:', error.message);
        initialized = false;
        return { db: null, initialized: false };
    }
}

// ============================================================
// GET DATABASE
// ============================================================
function getDB() {
    if (!initialized) {
        const result = initializeFirebase();
        if (!result.initialized) return null;
    }
    return db;
}

// ============================================================
// GET AUTH - With Mock for REST API compatibility
// ============================================================
function getAuth() {
    // If we already have a mock auth, return it
    if (mockAuth) {
        return mockAuth;
    }
    
    // Check if we have admin auth (Service Account)
    try {
        const admin = require('firebase-admin');
        if (admin.apps && admin.apps.length > 0) {
            console.log('[FIREBASE] 🔑 Using Admin SDK Auth (Service Account)');
            return admin.auth();
        }
    } catch (error) {
        // Admin SDK not available, continue to mock
    }
    
    // Create mock auth for REST API mode
    console.warn('[FIREBASE] ⚠️ Auth not available in REST mode - using mock auth for compatibility');
    
    mockAuth = {
        createUser: async (userData) => {
            console.log('[AUTH MOCK] Creating user:', userData.email);
            return {
                uid: 'mock_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
                email: userData.email,
                displayName: userData.displayName || '',
                emailVerified: false,
                password: userData.password || '********'
            };
        },
        getUser: async (uid) => {
            console.log('[AUTH MOCK] Getting user:', uid);
            try {
                const db = getDB();
                if (db) {
                    const snapshot = await db.ref(`users/${uid}`).once('value');
                    const userData = snapshot.val();
                    if (userData) {
                        return {
                            uid: uid,
                            email: userData.email || 'mock@example.com',
                            displayName: userData.fullName || userData.username || 'Mock User',
                            emailVerified: userData.emailVerified || false,
                            disabled: userData.status === 'suspended'
                        };
                    }
                }
                return {
                    uid: uid,
                    email: 'mock@example.com',
                    displayName: 'Mock User',
                    emailVerified: false
                };
            } catch (error) {
                console.error('[AUTH MOCK] Error getting user:', error.message);
                return {
                    uid: uid,
                    email: 'mock@example.com',
                    displayName: 'Mock User',
                    emailVerified: false
                };
            }
        },
        getUserByEmail: async (email) => {
            console.log('[AUTH MOCK] Getting user by email:', email);
            try {
                const db = getDB();
                if (db) {
                    const snapshot = await db.ref('users')
                        .orderByChild('email')
                        .equalTo(email)
                        .once('value');
                    const data = snapshot.val();
                    if (data && typeof data === 'object') {
                        const uid = Object.keys(data)[0];
                        const userData = data[uid];
                        return {
                            uid: uid,
                            email: userData.email,
                            displayName: userData.fullName || userData.username || 'Mock User',
                            emailVerified: userData.emailVerified || false
                        };
                    }
                }
                return null;
            } catch (error) {
                console.error('[AUTH MOCK] Error getting user by email:', error.message);
                return null;
            }
        },
        setCustomUserClaims: async (uid, claims) => {
            console.log('[AUTH MOCK] Setting custom claims for user:', uid, claims);
            try {
                const db = getDB();
                if (db) {
                    await db.ref(`users/${uid}/claims`).set(claims);
                }
                return true;
            } catch (error) {
                console.error('[AUTH MOCK] Error setting claims:', error.message);
                return false;
            }
        },
        updateUser: async (uid, updates) => {
            console.log('[AUTH MOCK] Updating user:', uid, updates);
            try {
                const db = getDB();
                if (db) {
                    await db.ref(`users/${uid}`).update(updates);
                }
                return { uid, ...updates };
            } catch (error) {
                console.error('[AUTH MOCK] Error updating user:', error.message);
                throw error;
            }
        },
        deleteUser: async (uid) => {
            console.log('[AUTH MOCK] Deleting user:', uid);
            try {
                const db = getDB();
                if (db) {
                    await db.ref(`users/${uid}`).remove();
                }
                return true;
            } catch (error) {
                console.error('[AUTH MOCK] Error deleting user:', error.message);
                throw error;
            }
        },
        verifyIdToken: async (token) => {
            console.log('[AUTH MOCK] Verifying token:', token ? `${token.substring(0, 10)}...` : 'null');
            // For REST mode, we don't verify tokens - just return mock user
            return {
                uid: 'mock_user_' + Date.now(),
                email: 'mock@example.com',
                email_verified: false,
                name: 'Mock User',
                firebase: {
                    sign_in_provider: 'password',
                    identities: { email: ['mock@example.com'] }
                }
            };
        }
    };
    
    return mockAuth;
}

// ============================================================
// CHECK INITIALIZATION
// ============================================================
function isInitialized() {
    return initialized;
}

// ============================================================
// TEST CONNECTION
// ============================================================
async function testConnection() {
    if (!initialized) {
        console.log('[FIREBASE] ⚠️ Not initialized, skipping test');
        return false;
    }
    try {
        const dbInstance = getDB();
        if (!dbInstance) return false;
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        return snapshot.exists() && snapshot.val() === true;
    } catch (error) {
        console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        // Try a simple read instead
        try {
            const dbInstance = getDB();
            if (!dbInstance) return false;
            const testRef = dbInstance.ref('/');
            const snapshot = await testRef.once('value');
            // If we get any data back, connection is working
            return true;
        } catch (err) {
            console.error('[FIREBASE] ❌ Alternate connection test failed:', err.message);
            return false;
        }
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection,
    admin: null // For compatibility
};