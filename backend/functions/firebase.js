// ============================================================
// FIREBASE ADMIN SDK - Workload Identity Federation
// ============================================================
// Location: backend/functions/firebase.js
// ============================================================

const admin = require('firebase-admin');

// ============================================================
// STATE
// ============================================================
let db = null;
let auth = null;
let firebaseApp = null;
let initialized = false;

// ============================================================
// INITIALIZE FIREBASE ADMIN SDK
// ============================================================
function initializeFirebase() {
    // Check if already initialized
    if (admin.apps.length > 0) {
        firebaseApp = admin.apps[0];
        db = admin.database();
        auth = admin.auth();
        initialized = true;
        console.log('[FIREBASE] ✅ Already initialized');
        return { db, auth, app: firebaseApp };
    }
    
    try {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        
        if (!projectId) {
            throw new Error('FIREBASE_PROJECT_ID is missing');
        }
        if (!databaseURL) {
            throw new Error('FIREBASE_DATABASE_URL is missing');
        }
        
        console.log(`[FIREBASE] 🔑 Initializing with Workload Identity...`);
        console.log(`[FIREBASE] 📁 Project: ${projectId}`);
        console.log(`[FIREBASE] 🌐 Database: ${databaseURL}`);
        
        // ============================================================
        // WORKLOAD IDENTITY - NO PRIVATE KEY NEEDED!
        // ============================================================
        // applicationDefault() inatumia:
        //   - GCP Metadata Server (kwa Railway)
        //   - GOOGLE_APPLICATION_CREDENTIALS (kwa local)
        // ============================================================
        firebaseApp = admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            databaseURL: databaseURL,
            projectId: projectId
        });
        
        db = admin.database();
        auth = admin.auth();
        initialized = true;
        
        console.log('[FIREBASE] ✅ Admin SDK initialized with Workload Identity');
        return { db, auth, app: firebaseApp };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Initialization failed:', error.message);
        console.error('[FIREBASE] ❌ Full error:', error);
        initialized = false;
        throw error;
    }
}

// ============================================================
// GETTER FUNCTIONS
// ============================================================
function getDB() {
    if (!db) {
        const init = initializeFirebase();
        db = init.db;
    }
    return db;
}

function getAuth() {
    if (!auth) {
        const init = initializeFirebase();
        auth = init.auth;
    }
    return auth;
}

function getApp() {
    if (!firebaseApp) {
        const init = initializeFirebase();
        firebaseApp = init.app;
    }
    return firebaseApp;
}

function isInitialized() {
    return initialized;
}

// ============================================================
// TEST CONNECTION
// ============================================================
async function testConnection() {
    try {
        const dbInstance = getDB();
        const testRef = dbInstance.ref('.info/connected');
        const snapshot = await testRef.once('value');
        console.log('[FIREBASE] ✅ Connection test passed:', snapshot.val());
        return true;
    } catch (error) {
        console.error('[FIREBASE] ❌ Connection test failed:', error.message);
        return false;
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    getApp,
    isInitialized,
    testConnection,
    admin
};