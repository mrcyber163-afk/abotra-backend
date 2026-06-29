// ============================================================
// INDEX.JS - SIMPLE STABLE VERSION
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// FIREBASE INIT - SIMPLE
// ============================================================
console.log('[FIREBASE] 🔑 Using REST API mode');

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    console.log('[HEALTH] ✅ Health check called');
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: 'REST API',
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'production'
    });
});

// ============================================================
// ROOT
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'ABOTRA-PROAI Backend',
        status: 'running',
        version: '2.0.0',
        mode: 'REST API'
    });
});

// ============================================================
// AUTH ROUTES - DIRECT IMPLEMENTATION
// ============================================================

// Firebase REST API helpers
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM';
const axios = require('axios');

async function restGet(path) {
    try {
        const url = `${FIREBASE_DB_URL}/${path}.json`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function restPut(path, data) {
    try {
        const url = `${FIREBASE_DB_URL}/${path}.json`;
        const response = await axios.put(url, data);
        return response.data;
    } catch (error) {
        return null;
    }
}

async function authSignUp(email, password) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;
        const response = await axios.post(url, { email, password, returnSecureToken: true });
        return response.data;
    } catch (error) {
        console.error('[AUTH] SignUp error:', error.response?.data || error.message);
        return null;
    }
}

async function authSignIn(email, password) {
    try {
        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
        const response = await axios.post(url, { email, password, returnSecureToken: true });
        return response.data;
    } catch (error) {
        console.error('[AUTH] SignIn error:', error.response?.data || error.message);
        return null;
    }
}

// REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        console.log('[REGISTER] Request:', req.body.email);
        const { email, password, username, fullName, country } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const authResult = await authSignUp(email, password);
        if (!authResult || !authResult.idToken) {
            return res.status(400).json({ success: false, error: 'Failed to create user' });
        }

        const uid = authResult.localId;
        const displayName = username || fullName || email.split('@')[0];

        const userData = {
            uid: uid,
            email: email,
            username: displayName,
            fullName: fullName || displayName,
            country: country || 'Tanzania',
            balance: 0,
            tradingBalance: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true,
            referralCode: 'ABOTRA' + Math.random().toString(36).substring(2, 8).toUpperCase()
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER] ✅ User created:', uid);

        res.json({
            success: true,
            message: 'User registered successfully',
            data: {
                uid: uid,
                email: email,
                username: displayName,
                idToken: authResult.idToken,
                refreshToken: authResult.refreshToken,
                expiresIn: authResult.expiresIn
            }
        });

    } catch (error) {
        console.error('[REGISTER] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('[LOGIN] Request:', req.body.email);
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const authResult = await authSignIn(email, password);
        if (!authResult || !authResult.idToken) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const uid = authResult.localId;
        const userData = await restGet(`users/${uid}`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                uid: uid,
                email: email,
                user: userData || { uid, email },
                idToken: authResult.idToken,
                refreshToken: authResult.refreshToken,
                expiresIn: authResult.expiresIn
            }
        });

    } catch (error) {
        console.error('[LOGIN] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// USER PROFILE
// ============================================================
app.get('/api/user/profile', async (req, res) => {
    try {
        // Get uid from query or body (simplified)
        const uid = req.query.uid || req.body?.uid;
        if (!uid) {
            return res.status(400).json({ success: false, error: 'User ID required' });
        }
        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.json({ success: true, user: userData });
    } catch (error) {
        console.error('[USER] Profile error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// 404 & ERROR HANDLING
// ============================================================
app.use((req, res) => {
    console.log('[404] Not found:', req.method, req.path);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
    });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] 🚀 Running on port ${PORT}`);
    console.log(`[SERVER] 🔗 Health: http://0.0.0.0:${PORT}/api/health`);
});
