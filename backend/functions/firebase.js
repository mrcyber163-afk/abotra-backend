// ============================================================
// FIREBASE - REST API MODE (NO Admin SDK)
// ============================================================
// Hii inatumia REST API badala ya Admin SDK
// Kwa sababu Admin SDK inahitaji credential
// ============================================================

const axios = require('axios');

let initialized = false;
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';

// ============================================================
// REST API DATABASE FUNCTIONS
// ============================================================
function getDB() {
    return {
        ref: (path) => {
            // Remove leading slash if present
            const cleanPath = path.replace(/^\//, '');
            
            return {
                once: async (event) => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        const response = await axios.get(url);
                        return {
                            exists: () => response.data !== null && response.data !== undefined,
                            val: () => response.data,
                            forEach: (callback) => {
                                if (response.data && typeof response.data === 'object') {
                                    for (const [key, value] of Object.entries(response.data)) {
                                        callback({ key, val: () => value });
                                    }
                                }
                            },
                            numChildren: () => {
                                if (response.data && typeof response.data === 'object') {
                                    return Object.keys(response.data).length;
                                }
                                return 0;
                            }
                        };
                    } catch (error) {
                        console.error('[FIREBASE REST] GET error:', error.message);
                        return { exists: () => false, val: () => null, forEach: () => {}, numChildren: () => 0 };
                    }
                },
                set: async (data) => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        await axios.put(url, data);
                        return { success: true };
                    } catch (error) {
                        console.error('[FIREBASE REST] SET error:', error.message);
                        return { success: false };
                    }
                },
                update: async (data) => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        await axios.patch(url, data);
                        return { success: true };
                    } catch (error) {
                        console.error('[FIREBASE REST] UPDATE error:', error.message);
                        return { success: false };
                    }
                },
                push: async (data) => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        const response = await axios.post(url, data);
                        return { key: response.data.name };
                    } catch (error) {
                        console.error('[FIREBASE REST] PUSH error:', error.message);
                        return { key: null };
                    }
                },
                remove: async () => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        await axios.delete(url);
                        return { success: true };
                    } catch (error) {
                        console.error('[FIREBASE REST] REMOVE error:', error.message);
                        return { success: false };
                    }
                },
                child: (childPath) => {
                    return getDB().ref(`${cleanPath}/${childPath}`);
                },
                transaction: async (updateFn) => {
                    try {
                        const url = `${DATABASE_URL}/${cleanPath}.json`;
                        const response = await axios.get(url);
                        const currentData = response.data;
                        const newData = updateFn(currentData);
                        if (newData !== undefined && newData !== null) {
                            await axios.put(url, newData);
                            return {
                                committed: true,
                                snapshot: {
                                    val: () => newData,
                                    exists: () => newData !== null && newData !== undefined
                                }
                            };
                        }
                        return { committed: false };
                    } catch (error) {
                        console.error('[FIREBASE REST] Transaction error:', error);
                        return { committed: false };
                    }
                },
                orderByChild: (field) => {
                    // Simplified - returns same ref with query param
                    return {
                        equalTo: (value) => {
                            return {
                                once: async (event) => {
                                    try {
                                        const url = `${DATABASE_URL}/${cleanPath}.json?orderBy="${field}"&equalTo="${value}"`;
                                        const response = await axios.get(url);
                                        return {
                                            exists: () => response.data !== null && response.data !== undefined,
                                            val: () => response.data,
                                            forEach: (callback) => {
                                                if (response.data && typeof response.data === 'object') {
                                                    for (const [key, val] of Object.entries(response.data)) {
                                                        callback({ key, val: () => val });
                                                    }
                                                }
                                            }
                                        };
                                    } catch (error) {
                                        console.error('[FIREBASE REST] Query error:', error);
                                        return { exists: () => false, val: () => null, forEach: () => {} };
                                    }
                                }
                            };
                        },
                        limitToLast: (limit) => {
                            return {
                                once: async (event) => {
                                    try {
                                        const url = `${DATABASE_URL}/${cleanPath}.json?orderBy="${field}"&limitToLast=${limit}`;
                                        const response = await axios.get(url);
                                        return {
                                            exists: () => response.data !== null && response.data !== undefined,
                                            val: () => response.data,
                                            forEach: (callback) => {
                                                if (response.data && typeof response.data === 'object') {
                                                    const entries = Object.entries(response.data);
                                                    const limited = entries.slice(-limit);
                                                    for (const [key, val] of limited) {
                                                        callback({ key, val: () => val });
                                                    }
                                                }
                                            }
                                        };
                                    } catch (error) {
                                        console.error('[FIREBASE REST] Query error:', error);
                                        return { exists: () => false, val: () => null, forEach: () => {} };
                                    }
                                }
                            };
                        }
                    };
                },
                limitToLast: (limit) => {
                    return {
                        once: async (event) => {
                            try {
                                const url = `${DATABASE_URL}/${cleanPath}.json?limitToLast=${limit}`;
                                const response = await axios.get(url);
                                return {
                                    exists: () => response.data !== null && response.data !== undefined,
                                    val: () => response.data,
                                    forEach: (callback) => {
                                        if (response.data && typeof response.data === 'object') {
                                            const entries = Object.entries(response.data);
                                            const limited = entries.slice(-limit);
                                            for (const [key, val] of limited) {
                                                callback({ key, val: () => val });
                                            }
                                        }
                                    }
                                };
                            } catch (error) {
                                console.error('[FIREBASE REST] Limit error:', error);
                                return { exists: () => false, val: () => null, forEach: () => {} };
                            }
                        }
                    };
                }
            };
        },
        refFromURL: (url) => {
            const path = url.replace(DATABASE_URL, '');
            return getDB().ref(path);
        }
    };
}

function getAuth() {
    // Auth not supported in REST mode - use Firebase Auth client side
    return null;
}

function isInitialized() {
    return true;
}

async function testConnection() {
    try {
        const dbInstance = getDB();
        const result = await dbInstance.ref('.info/connected').once('value');
        return true;
    } catch (error) {
        console.error('[FIREBASE REST] Connection test failed:', error.message);
        return false;
    }
}

function initializeFirebase() {
    initialized = true;
    console.log('[FIREBASE] 🔑 Initialized in REST mode (no credential needed)');
    console.log(`[FIREBASE] 📁 Database: ${DATABASE_URL}`);
    return { db: getDB(), auth: null, initialized: true };
}

// ============================================================
// DUMMY ADMIN OBJECT (for compatibility)
// ============================================================
const admin = {
    auth: () => ({
        verifyIdToken: async (token) => {
            console.warn('[FIREBASE] ⚠️ Auth verification not available in REST mode');
            return { uid: 'rest-user', email: 'rest@example.com' };
        },
        createUser: async () => {
            console.warn('[FIREBASE] ⚠️ Create user not available in REST mode');
            return { uid: 'rest-user-' + Date.now() };
        },
        updateUser: async () => {
            console.warn('[FIREBASE] ⚠️ Update user not available in REST mode');
            return {};
        }
    }),
    database: getDB
};

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection,
    admin
};