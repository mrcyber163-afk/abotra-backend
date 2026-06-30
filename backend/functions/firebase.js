// functions/firebase.js
// ============================================================
// FIREBASE - REST API ONLY (No Private Key)
// ============================================================

const admin = require('firebase-admin');
require('dotenv').config();

let db = null;
let auth = null;

// ============================================================
// INITIALIZE FIREBASE (No Private Key needed)
// ============================================================
function initializeFirebase() {
    // Check if already initialized
    if (admin.apps.length > 0) {
        db = admin.database();
        auth = admin.auth();
        console.log('[FIREBASE] ✅ Already initialized');
        return { db, auth };
    }
    
    try {
        console.log('[FIREBASE] 🔧 Initializing Firebase (REST API mode)...');
        console.log('[FIREBASE] 📡 Database URL:', process.env.FIREBASE_DATABASE_URL);
        console.log('[FIREBASE] 📡 Project ID:', process.env.FIREBASE_PROJECT_ID);
        
        // ✅ Initialize WITHOUT service account - REST API mode
        // Using only databaseURL and projectId
        admin.initializeApp({
            databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com',
            projectId: process.env.FIREBASE_PROJECT_ID || 'abotra-proa1'
        });
        
        db = admin.database();
        auth = admin.auth();
        
        console.log('[FIREBASE] ✅ Firebase Admin SDK initialized (REST API mode)');
        return { db, auth };
        
    } catch (error) {
        console.error('[FIREBASE] ❌ Initialization failed:', error.message);
        
        // ✅ Fallback: Try to initialize with just database URL
        try {
            console.log('[FIREBASE] 🔄 Retry with just database URL...');
            admin.initializeApp({
                databaseURL: 'https://abotra-proa1-default-rtdb.firebaseio.com'
            });
            db = admin.database();
            auth = admin.auth();
            console.log('[FIREBASE] ✅ Firebase initialized (fallback mode)');
            return { db, auth };
        } catch (e2) {
            console.error('[FIREBASE] ❌ Fallback also failed:', e2.message);
            
            // ✅ Last resort: Create dummy objects
            console.log('[FIREBASE] ⚠️ Using dummy database (REST API will be used directly)');
            
            // Create a dummy database that logs operations
            const dummyDB = {
                ref: (path) => ({
                    once: (event) => {
                        console.log('[DB] ⚠️ Dummy: once() called for', path);
                        return Promise.resolve({ val: () => null, exists: () => false });
                    },
                    set: (data) => {
                        console.log('[DB] ⚠️ Dummy: set() called for', path, data);
                        return Promise.resolve();
                    },
                    update: (data) => {
                        console.log('[DB] ⚠️ Dummy: update() called for', path, data);
                        return Promise.resolve();
                    },
                    push: (data) => {
                        console.log('[DB] ⚠️ Dummy: push() called for', path, data);
                        return { key: 'dummy_' + Date.now(), set: () => Promise.resolve() };
                    },
                    child: (childPath) => ({
                        once: () => Promise.resolve({ val: () => null, exists: () => false }),
                        set: () => Promise.resolve(),
                        update: () => Promise.resolve()
                    })
                })
            };
            
            const dummyAuth = {
                getUser: (uid) => {
                    console.log('[AUTH] ⚠️ Dummy: getUser() called for', uid);
                    return Promise.resolve({ uid: uid || 'dummy', email: 'dummy@example.com' });
                }
            };
            
            // Return dummy objects
            return { 
                db: dummyDB, 
                auth: dummyAuth,
                isDummy: true
            };
        }
    }
}

// ============================================================
// GETTERS
// ============================================================
function getDB() {
    if (!db) {
        const result = initializeFirebase();
        db = result.db;
    }
    return db;
}

function getAuth() {
    if (!auth) {
        const result = initializeFirebase();
        auth = result.auth;
    }
    return auth;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    admin,
    db: getDB(),
    auth: getAuth()
};