// ============================================================
// FIREBASE ADMIN SDK - Simplified for Railway
// ============================================================
const admin = require('firebase-admin');

let db = null;
let auth = null;
let initialized = false;

function initializeFirebase() {
    if (admin.apps.length > 0) {
        db = admin.database();
        auth = admin.auth();
        initialized = true;
        return { db, auth };
    }
    
    try {
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        
        if (!databaseURL) {
            throw new Error('FIREBASE_DATABASE_URL is missing');
        }
        
        console.log(`[FIREBASE] 🔑 Initializing with databaseURL only...`);
        
        admin.initializeApp({
            databaseURL: databaseURL
        });
        
        db = admin.database();
        auth = admin.auth();
        initialized = true;
        
        console.log('[FIREBASE] ✅ Admin SDK initialized');
        return { db, auth };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Failed:', error.message);
        initialized = false;
        throw error;
    }
}

function getDB() {
    if (!db) initializeFirebase();
    return db;
}

function getAuth() {
    if (!auth) initializeFirebase();
    return auth;
}

async function testConnection() {
    try {
        const dbInstance = getDB();
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    testConnection,
    admin
};
