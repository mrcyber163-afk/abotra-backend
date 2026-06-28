// ============================================================
// FIREBASE - SIMPLEST VERSION FOR RAILWAY
// ============================================================
const admin = require('firebase-admin');

let db = null;
let auth = null;

function initializeFirebase() {
    if (admin.apps.length > 0) {
        db = admin.database();
        auth = admin.auth();
        return { db, auth };
    }
    
    try {
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        
        console.log(`[FIREBASE] 🔑 Initializing...`);
        
        admin.initializeApp({
            databaseURL: databaseURL
        });
        
        db = admin.database();
        auth = admin.auth();
        
        console.log('[FIREBASE] ✅ Initialized');
        return { db, auth };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Failed:', error.message);
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
        await testRef.once('value');
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
