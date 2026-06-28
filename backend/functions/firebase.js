// ============================================================
// FIREBASE - REST API Mode with Snapshot Helper
// ============================================================
const axios = require('axios');
const { Snapshot } = require('./helpers');

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
                    orderByChild: () => {
                        return {
                            equalTo: async (value) => {
                                return db.ref(cleanPath);
                            }
                        };
                    },
                    transaction: async (updateFn) => {
                        try {
                            const snapshot = await db.ref(cleanPath).once('value');
                            const currentData = snapshot.val();
                            const newData = updateFn(currentData);
                            
                            if (newData !== undefined) {
                                await db.ref(cleanPath).set(newData);
                                return { committed: true, snapshot: new Snapshot(newData) };
                            }
                            return { committed: false, snapshot: new Snapshot(currentData) };
                        } catch (error) {
                            console.error('[FIREBASE] Transaction error:', error.message);
                            throw error;
                        }
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
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        return snapshot.exists() && snapshot.val() === true;
    } catch (error) {
        console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        return false;
    }
}

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection,
    admin: null
};
