// ============================================================
// AUTH ROUTES - REST API ONLY
// ============================================================

const express = require('express');
const router = express.Router();
const {
    restGet,
    restPut,
    restPatch,
    restPost,
    restDelete,
    authSignIn,
    authSignUp,
    authGetUser,
    authRefreshToken,
    verifyIdToken
} = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// HELPERS
// ============================================================
function createUserObject(data) {
    const { uid, email, fullName, username, country, phone, method = 'email', referralCode = null } = data;
    const refCode = referralCode || 'ABOTRA' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    return {
        uid: uid,
        email: email || '',
        fullName: fullName || email?.split('@')[0] || 'User',
        username: username || email?.split('@')[0] + Math.floor(Math.random() * 1000),
        country: country || 'Tanzania',
        phone: phone || '',
        method: method,
        emailVerified: false,
        phoneVerified: false,
        referredBy: referralCode || null,
        referralCode: refCode,
        referralCount: 0,
        commissionEarned: 0,
        balance: 0,
        tradingBalance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalProfit: 0,
        dailyPnL: 0,
        dailyLoss: 0,
        winRate: 0,
        activeTrades: 0,
        aiScore: 0,
        status: 'active',
        isVerified: false,
        isOnline: true,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        kycStatus: 'none'
    };
}

// ============================================================
// 1. REGISTER
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, username, country, referralCode } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }
        
        let authResult;
        try {
            authResult = await authSignUp(email, password);
        } catch (authError) {
            return res.status(400).json({ success: false, error: authError.message || 'Email already exists' });
        }
        
        const uid = authResult.localId;
        const idToken = authResult.idToken;
        
        const userData = createUserObject({ uid, email, fullName, username, country, referralCode, method: 'email' });
        await restPut(`users/${uid}`, userData);
        
        res.json({
            success: true,
            data: {
                uid: uid,
                email: email,
                idToken: idToken,
                referralCode: userData.referralCode,
                message: 'Account created successfully'
            }
        });
    } catch (error) {
        console.error('[AUTH] Register error:', error);
        res.status(400).json({ success: false, error: error.message || 'Registration failed' });
    }
});

// ============================================================
// 2. LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }
        
        let authResult;
        try {
            authResult = await authSignIn(email, password);
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        const uid = authResult.localId;
        const idToken = authResult.idToken;
        const refreshToken = authResult.refreshToken;
        
        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        await restPatch(`users/${uid}`, {
            lastLogin: Date.now(),
            lastActive: Date.now(),
            isOnline: true
        });
        
        res.json({
            success: true,
            data: {
                uid: uid,
                email: userData.email,
                idToken: idToken,
                refreshToken: refreshToken,
                username: userData.username,
                fullName: userData.fullName,
                referralCode: userData.referralCode,
                balance: userData.balance || 0,
                tradingBalance: userData.tradingBalance || 0,
                isVerified: userData.isVerified || false,
                kycStatus: userData.kycStatus || 'none'
            }
        });
    } catch (error) {
        console.error('[AUTH] Login error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET PROFILE
// ============================================================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const userData = await restGet(`users/${userId}`);
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                id: userId,
                email: userData.email,
                fullName: userData.fullName || '',
                username: userData.username || '',
                phone: userData.phone || '',
                country: userData.country || 'Tanzania',
                balance: userData.balance || 0,
                tradingBalance: userData.tradingBalance || 0,
                totalDeposited: userData.totalDeposited || 0,
                totalWithdrawn: userData.totalWithdrawn || 0,
                totalProfit: userData.totalProfit || 0,
                dailyPnL: userData.dailyPnL || 0,
                dailyLoss: userData.dailyLoss || 0,
                winRate: userData.winRate || 0,
                activeTrades: userData.activeTrades || 0,
                aiScore: userData.aiScore || 0,
                isVerified: userData.isVerified || false,
                isOnline: userData.isOnline || false,
                referralCode: userData.referralCode || '',
                referralCount: userData.referralCount || 0,
                kycStatus: userData.kycStatus || 'none',
                createdAt: userData.createdAt || Date.now()
            }
        });
    } catch (error) {
        console.error('[AUTH] Profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. UPDATE PROFILE
// ============================================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { fullName, username, phone, country } = req.body;
        
        const updates = {};
        if (fullName !== undefined) updates.fullName = fullName;
        if (username !== undefined) updates.username = username;
        if (phone !== undefined) updates.phone = phone;
        if (country !== undefined) updates.country = country;
        updates.updatedAt = Date.now();
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        
        await restPatch(`users/${userId}`, updates);
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('[AUTH] Update error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. REFRESH TOKEN
// ============================================================
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, error: 'Refresh token required' });
        }
        
        const result = await authRefreshToken(refreshToken);
        res.json({
            success: true,
            idToken: result.id_token,
            refreshToken: result.refresh_token,
            expiresIn: result.expires_in
        });
    } catch (error) {
        console.error('[AUTH] Refresh token error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. VERIFY TOKEN
// ============================================================
router.post('/verify', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, error: 'Token required' });
        }
        
        const user = await verifyIdToken(token);
        res.json({ success: true, user: user });
    } catch (error) {
        console.error('[AUTH] Verify error:', error);
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
});

module.exports = router;