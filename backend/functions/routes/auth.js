// ============================================================
// AUTH ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, authSignUp, authSignIn, authGetUser } = require('../firebase');

// Helper: Verify Token (REST API)
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await authGetUser(token);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = { uid: userInfo.users[0].localId, email: userInfo.users[0].email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, password, username, fullName, phone, country } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
        if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

        const authResult = await authSignUp(email, password);
        if (!authResult || !authResult.idToken) {
            return res.status(400).json({ success: false, error: 'Failed to create user. Email may already be in use.' });
        }

        const uid = authResult.localId;
        const displayName = username || fullName || email.split('@')[0];
        await restPut(`users/${uid}`, {
            uid, email, username: displayName, fullName: fullName || displayName,
            phone: phone || '', country: country || 'Tanzania',
            balance: 0, totalDeposited: 0, createdAt: Date.now(), isVerified: false, isActive: true
        });

        return res.json({
            success: true, message: 'User registered successfully',
            data: { uid, email, username: displayName, idToken: authResult.idToken, refreshToken: authResult.refreshToken, expiresIn: authResult.expiresIn }
        });
    } catch (error) {
        console.error('[REGISTER] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });

        const authResult = await authSignIn(email, password);
        if (!authResult || !authResult.idToken) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const uid = authResult.localId;
        const userData = await restGet(`users/${uid}`);
        return res.json({
            success: true, message: 'Login successful',
            data: { uid, email, user: userData || { uid, email }, idToken: authResult.idToken, refreshToken: authResult.refreshToken, expiresIn: authResult.expiresIn }
        });
    } catch (error) {
        console.error('[LOGIN] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Verify Token
router.post('/verify-token', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ success: false, error: 'ID token required' });

        const userInfo = await authGetUser(idToken);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const user = userInfo.users[0];
        const uid = user.localId;
        const userData = await restGet(`users/${uid}`);
        return res.json({
            success: true,
            user: { uid, email: user.email, emailVerified: user.emailVerified, displayName: user.displayName, userData: userData || { uid, email: user.email } }
        });
    } catch (error) {
        console.error('[VERIFY TOKEN] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Get User Profile
router.get('/profile/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ success: false, error: 'User ID required' });
        const userData = await restGet(`users/${uid}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });
        return res.json({ success: true, user: userData });
    } catch (error) {
        console.error('[GET PROFILE] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Update User Profile
router.patch('/profile/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const updates = req.body;
        if (!uid) return res.status(400).json({ success: false, error: 'User ID required' });
        delete updates.uid; delete updates.idToken; delete updates.password;
        updates.updatedAt = Date.now();
        await restPatch(`users/${uid}`, updates);
        const userData = await restGet(`users/${uid}`);
        return res.json({ success: true, message: 'Profile updated successfully', user: userData });
    } catch (error) {
        console.error('[UPDATE PROFILE] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/logout', (req, res) => {
    return res.json({ success: true, message: 'Logout successful' });
});

module.exports = router;
