// ============================================================
// FIREBASE - REST API ONLY (No Admin SDK)
// ============================================================

const axios = require('axios');

// Firebase REST API endpoints
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM';
const REST_URL = `${FIREBASE_DB_URL}`;

let initialized = false;

function initializeFirebase() {
    try {
        console.log('[FIREBASE] Using REST API mode');
        initialized = true;
        return { initialized: true, mode: 'REST' };
    } catch (error) {
        console.error('[FIREBASE] Init error:', error.message);
        initialized = false;
        return { initialized: false, error: error.message };
    }
}

// ============================================================
// REST API HELPERS
// ============================================================

async function restGet(path) {
    try {
        const url = `${REST_URL}/${path}.json`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST GET error:`, error.message);
        return null;
    }
}

async function restPut(path, data) {
    try {
        const url = `${REST_URL}/${path}.json`;
        const response = await axios.put(url, data);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST PUT error:`, error.message);
        return null;
    }
}

async function restPost(path, data) {
    try {
        const url = `${REST_URL}/${path}.json`;
        const response = await axios.post(url, data);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST POST error:`, error.message);
        return null;
    }
}

async function restPatch(path, data) {
    try {
        const url = `${REST_URL}/${path}.json`;
        const response = await axios.patch(url, data);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST PATCH error:`, error.message);
        return null;
    }
}

async function restDelete(path) {
    try {
        const url = `${REST_URL}/${path}.json`;
        const response = await axios.delete(url);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST DELETE error:`, error.message);
        return null;
    }
}

async function restQuery(path, queryParams) {
    try {
        const params = new URLSearchParams(queryParams).toString();
        const url = `${REST_URL}/${path}.json?${params}`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`[FIREBASE] REST QUERY error:`, error.message);
        return null;
    }
}

// ============================================================
// AUTH - Using Firebase REST Auth
// ============================================================

async function authSignUp(email, password) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
        const response = await axios.post(url, {
            email,
            password,
            returnSecureToken: true
        });
        return response.data;
    } catch (error) {
        console.error('[AUTH] SignUp error:', error.response?.data || error.message);
        return null;
    }
}

async function authSignIn(email, password) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
        const response = await axios.post(url, {
            email,
            password,
            returnSecureToken: true
        });
        return response.data;
    } catch (error) {
        console.error('[AUTH] SignIn error:', error.response?.data || error.message);
        return null;
    }
}

async function authGetUser(idToken) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`;
        const response = await axios.post(url, { idToken });
        return response.data;
    } catch (error) {
        console.error('[AUTH] GetUser error:', error.response?.data || error.message);
        return null;
    }
}

function getDB() { return { restGet, restPut, restPost, restPatch, restDelete, restQuery }; }
function getAuth() { return { authSignUp, authSignIn, authGetUser }; }
function isInitialized() { return initialized; }

async function testConnection() {
    try {
        await axios.get(`${REST_URL}/.json?shallow=true`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeFirebase,
    getDB,
    getAuth,
    isInitialized,
    testConnection,
    // Export REST helpers directly
    restGet,
    restPut,
    restPost,
    restPatch,
    restDelete,
    restQuery,
    authSignUp,
    authSignIn,
    authGetUser
};
