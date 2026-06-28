// ============================================================
// FIREBASE - REST API Mode (No Admin SDK, No Key Required)
// ============================================================
const axios = require('axios');

let db = null;
let initialized = false;

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
        
        // REST API client - Basic operations
        db = {
            ref: (path) => ({
                once: async (event) => {
                    try {
                        const url = `${databaseURL}/${path}.json`;
                        console.log(`[FIREBASE] REST GET: ${url}`);
                        const response = await axios.get(url);
                        return { val: () => response.data };
                    } catch (error) {
                        console.error('[FIREBASE] REST GET error:', error.message);
                        throw error;
                    }
                },
                set: async (data) => {
                    try {
                        const url = `${databaseURL}/${path}.json`;
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
                        const url = `${databaseURL}/${path}.json`;
                        console.log(`[FIREBASE] REST UPDATE: ${url}`);
                        const response = await axios.patch(url, data);
                        return response.data;
                    } catch (error) {
                        console.error('[FIREBASE] REST UPDATE error:', error.message);
                        throw error;
                    }
                },
                push: async (data) => {
                    try {
                        const url = `${databaseURL}/${path}.json`;
                        console.log(`[FIREBASE] REST PUSH: ${url}`);
                        const response = await axios.post(url, data);
                        return { key: response.data.name };
                    } catch (error) {
                        console.error('[FIREBASE] REST PUSH error:', error.message);
                        throw error;
                    }
                },
                child: (childPath) => {
                    // Support for child paths
                    const newPath = path ? `${path}/${childPath}` : childPath;
                    return {
                        once: async (event) => {
                            try {
                                const url = `${databaseURL}/${newPath}.json`;
                                const response = await axios.get(url);
                                return { val: () => response.data };
                            } catch (error) {
                                console.error('[FIREBASE] REST GET error:', error.message);
                                throw error;
                            }
                        },
                        set: async (data) => {
                            try {
                                const url = `${databaseURL}/${newPath}.json`;
                                const response = await axios.put(url, data);
                                return response.data;
                            } catch (error) {
                                console.error('[FIREBASE] REST SET error:', error.message);
                                throw error;
                            }
                        }
                    };
                }
            })
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

function getDB() {
    if (!initialized) {
        const result = initializeFirebase();
        if (!result.initialized) return null;
    }
    return db;
}

function getAuth() {
    console.warn('[FIREBASE] ⚠️ Auth not available in REST mode');
    return null;
}

function isInitialized() {
    return initialized;
}

async function testConnection() {
    if (!initialized) {
        console.log('[FIREBASE] ⚠️ Not initialized, skipping test');
        return false;
    }
    try {
        const dbInstance = getDB();
        if (!dbInstance) return false;
        
        // Test with a simple read
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        const isConnected = snapshot.val() === true;
        
        if (isConnected) {
            console.log('[FIREBASE] ✅ Connection test: PASSED');
        } else {
            console.log('[FIREBASE] ⚠️ Connection test: Not connected');
        }
        return isConnected;
    } catch (error) {
        // If .info/connected doesn't work, try a different path
        try {
            const testRef = dbInstance.ref('/');
            const snapshot = await testRef.once('value');
            console.log('[FIREBASE] ✅ Connection test: PASSED (read root)');
            return true;
        } catch (err) {
            console.error('[FIREBASE] ❌ Connection test failed:', err.message);
            return false;
        }
    }
}

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection
};
