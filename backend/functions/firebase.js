// ============================================================
// FIREBASE - SAFE INITIALIZATION (NEVER CRASHES)
// ============================================================
const admin = require('firebase-admin');

let db = null;
let auth = null;
let initialized = false;

function initializeFirebase() {
    if (admin.apps.length > 0) {
        try {
            db = admin.database();
            auth = admin.auth();
            initialized = true;
            console.log('[FIREBASE] ✅ Already initialized');
            return { db, auth, initialized: true };
        } catch (error) {
            console.warn('[FIREBASE] ⚠️ Already initialized but failed to get services');
            initialized = false;
            return { db: null, auth: null, initialized: false };
        }
    }
    
    try {
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        
        if (!databaseURL) {
            console.warn('[FIREBASE] ⚠️ FIREBASE_DATABASE_URL is missing');
            initialized = false;
            return { db: null, auth: null, initialized: false };
        }
        
        console.log(`[FIREBASE] 🔑 Initializing with databaseURL...`);
        
        admin.initializeApp({
            databaseURL: databaseURL,
            projectId: process.env.FIREBASE_PROJECT_ID || 'abotra-proa1'
        });
        
        db = admin.database();
        auth = admin.auth();
        initialized = true;
        
        console.log('[FIREBASE] ✅ Admin SDK initialized successfully');
        return { db, auth, initialized: true };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Initialization failed:', error.message);
        initialized = false;
        return { db: null, auth: null, initialized: false };
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
    if (!initialized) {
        const result = initializeFirebase();
        if (!result.initialized) return null;
    }
    return auth;
}

function isInitialized() {
    return initialized;
}

async function testConnection() {
    if (!initialized) return false;
    try {
        const dbInstance = getDB();
        if (!dbInstance) return false;
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        return snapshot.val() === true;
    } catch (error) {
        console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        return false;
    }
}

function resetFirebase() {
    if (admin.apps.length > 0) {
        try {
            admin.apps.forEach(app => app.delete());
        } catch (error) {
            console.warn('[FIREBASE] ⚠️ Error deleting apps:', error.message);
        }
    }
    db = null;
    auth = null;
    initialized = false;
    console.log('[FIREBASE] 🔄 Reset complete');
}

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection,
    resetFirebase,
    admin
};
