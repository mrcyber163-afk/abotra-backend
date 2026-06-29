// ============================================================
// INDEX.JS - WITH BETTER ERROR HANDLING
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const axios = require('axios');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
// FIREBASE CONFIG
// ============================================================
const FIREBASE_DB_URL = process.env.FIREBASE_DATABASE_URL || 'https://abotra-proa1-default-rtdb.firebaseio.com';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCAr7b_5VOqQWCLXb8JlJ1zOcoDNg0V4tM';

console.log('[FIREBASE] 🔑 Using REST API mode');

// ============================================================
// FIREBASE HELPERS
// ============================================================

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
        const response = await axios.post(url, { 
            email, 
            password, 
            returnSecureToken: true 
        });
        return response.data;
    } catch (error) {
        // ✅ Extract Firebase error message
        const firebaseError = error.response?.data?.error?.message || error.message;
        const errorData = error.response?.data?.error || {};
        
        // ✅ Return error with proper message
        return { 
            error: true, 
            code: errorData.code || 400,
            message: firebaseError,
            details: errorData
        };
    }
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: 'REST API',
        version: '2.0.0'
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'ABOTRA-PROAI Backend',
        status: 'running',
        version: '2.0.0',
        mode: 'REST API'
    });
});

// ============================================================
// ✅ FIXED REGISTRATION - WITH PROPER ERROR HANDLING
// ============================================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, username, fullName, country } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters' 
            });
        }

        console.log('[REGISTER] Creating user:', email);

        // ✅ Create user with Firebase Auth
        const authResult = await authSignUp(email, password);
        
        // ✅ Check if there was an error from Firebase
        if (authResult && authResult.error) {
            console.error('[REGISTER] Firebase error:', authResult.message);
            
            // ✅ Return user-friendly error message
            let errorMessage = 'Registration failed';
            if (authResult.message === 'EMAIL_EXISTS') {
                errorMessage = 'This email is already registered. Please login or use a different email.';
            } else if (authResult.message === 'INVALID_EMAIL') {
                errorMessage = 'Invalid email address. Please check and try again.';
            } else if (authResult.message === 'WEAK_PASSWORD') {
                errorMessage = 'Password is too weak. Please use a stronger password.';
            } else {
                errorMessage = authResult.message || 'Registration failed. Please try again.';
            }
            
            return res.status(400).json({ 
                success: false, 
                error: errorMessage,
                code: authResult.code
            });
        }

        // ✅ Check if authResult is valid
        if (!authResult || !authResult.idToken) {
            return res.status(400).json({ 
                success: false, 
                error: 'Failed to create user. Please try again.' 
            });
        }

        const uid = authResult.localId;
        const displayName = username || fullName || email.split('@')[0];

        console.log('[REGISTER] ✅ User created in Auth:', uid);

        // ✅ Save user data to database
        const userData = {
            uid: uid,
            email: email,
            username: displayName,
            fullName: fullName || displayName,
            country: country || 'Tanzania',
            balance: 0,
            tradingBalance: 0,
            totalDeposited: 0,
            totalWithdrawn: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true,
            referralCode: 'ABOTRA' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            referralCount: 0,
            commissionEarned: 0
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER] ✅ User saved to database:', uid);

        return res.json({
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
        console.error('[REGISTER] ❌ Error:', error.message);
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Registration failed' 
        });
    }
});

// ============================================================
// LOGIN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email and password are required' 
            });
        }

        const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
        const response = await axios.post(url, { 
            email, 
            password, 
            returnSecureToken: true 
        });

        if (!response.data || !response.data.idToken) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }

        const authResult = response.data;
        const uid = authResult.localId;
        const userData = await restGet(`users/${uid}`);

        return res.json({
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
        return res.status(500).json({ 
            success: false, 
            error: error.message || 'Login failed' 
        });
    }
});

// ============================================================
// USER PROFILE
// ============================================================
app.get('/api/user/profile', async (req, res) => {
    try {
        const uid = req.query.uid || req.body?.uid;
        if (!uid) {
            return res.status(400).json({ 
                success: false, 
                error: 'User ID required' 
            });
        }
        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
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
});

// ============================================================
// TRADE ROUTES
// ============================================================
try {
    const tradeRoutes = require('./routes/trade');
    app.use('/api/trades', tradeRoutes);
    console.log('[ROUTES] ✅ /api/trades loaded');
} catch (error) {
    console.error('[ROUTES] ❌ /api/trades error:', error.message);
}
