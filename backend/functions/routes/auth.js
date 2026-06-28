// ============================================================
// AUTH ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { 
    restGet, 
    restPut, 
    restPost, 
    restPatch, 
    restDelete,
    authSignUp,
    authSignIn,
    authGetUser
} = require('../firebase');

// ============================================================
// REGISTER - Using Firebase REST Auth
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, username, fullName, phone, country } = req.body;

        // Validation
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

        // 1. Create user using Firebase REST Auth
        const authResult = await authSignUp(email, password);
        
        if (!authResult || !authResult.idToken) {
            return res.status(400).json({
                success: false,
                error: 'Failed to create user. Email may already be in use.'
            });
        }

        const uid = authResult.localId;
        const displayName = username || fullName || email.split('@')[0];

        // 2. Save user data to database
        const userData = {
            uid: uid,
            email: email,
            username: displayName,
            fullName: fullName || displayName,
            phone: phone || '',
            country: country || 'Tanzania',
            balance: 0,
            totalDeposited: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true
        };

        // Save to Firebase Realtime Database
        await restPut(`users/${uid}`, userData);

        // 3. Return success with token
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
        console.error('[REGISTER] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message || 'Registration failed'
        });
    }
});

// ============================================================
// LOGIN - Using Firebase REST Auth
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // 1. Sign in with Firebase REST Auth
        const authResult = await authSignIn(email, password);

        if (!authResult || !authResult.idToken) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const uid = authResult.localId;

        // 2. Get user data from database
        const userData = await restGet(`users/${uid}`);

        return res.json({
            success: true,
            message: 'Login successful',
            data: {
                uid: uid,
                email: email,
                user: userData || { uid: uid, email: email },
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
// VERIFY TOKEN - Using Firebase REST Auth
// ============================================================
router.post('/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: 'ID token is required'
            });
        }

        // Verify token using Firebase REST API
        const userInfo = await authGetUser(idToken);

        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const user = userInfo.users[0];
        const uid = user.localId;

        // Get user data from database
        const userData = await restGet(`users/${uid}`);

        return res.json({
            success: true,
            user: {
                uid: uid,
                email: user.email,
                emailVerified: user.emailVerified,
                displayName: user.displayName,
                userData: userData || { uid: uid, email: user.email }
            }
        });

    } catch (error) {
        console.error('[VERIFY TOKEN] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message || 'Token verification failed'
        });
    }
});

// ============================================================
// GET USER PROFILE
// ============================================================
router.get('/profile/:uid', async (req, res) => {
    try {
        const { uid } = req.params;

        if (!uid) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        const userData = await restGet(`users/${uid}`);

        if (!userData) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        return res.json({
            success: true,
            user: userData
        });

    } catch (error) {
        console.error('[GET PROFILE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// UPDATE USER PROFILE
// ============================================================
router.patch('/profile/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const updates = req.body;

        if (!uid) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }

        // Remove sensitive fields
        delete updates.uid;
        delete updates.idToken;
        delete updates.password;

        // Add updated timestamp
        updates.updatedAt = Date.now();

        await restPatch(`users/${uid}`, updates);

        const userData = await restGet(`users/${uid}`);

        return res.json({
            success: true,
            message: 'Profile updated successfully',
            user: userData
        });

    } catch (error) {
        console.error('[UPDATE PROFILE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// LOGOUT (Client side only - no server action needed)
// ============================================================
router.post('/logout', (req, res) => {
    return res.json({
        success: true,
        message: 'Logout successful'
    });
});

module.exports = router;
