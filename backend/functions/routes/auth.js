// ============================================================
// AUTH ROUTES - Complete Authentication System
// ============================================================
// Location: backend/functions/routes/auth.js
// ============================================================

const express = require('express');
const router = express.Router();
const { admin } = require('../firebase');
const { 
    registerWithEmail, 
    saveGoogleUser, 
    verifyReferralCode,
    generateUniqueReferralCode 
} = require('../auth/register');
const { isValidEmail, isValidPhone } = require('../helpers');

// ============================================================
// MIDDLEWARE: Verify Token
// ============================================================
async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'Missing or invalid authorization token' 
            });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
        
    } catch (error) {
        console.error('[AUTH] Token verification error:', error);
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token' 
        });
    }
}

// ============================================================
// MIDDLEWARE: Get Firebase from Request
// ============================================================
function getFirebase(req) {
    if (req.firebase && req.firebase.db) {
        return req.firebase;
    }
    const { getDB } = require('../firebase');
    return { db: getDB() };
}

// ============================================================
// 1. CHECK EMAIL EXISTS
// ============================================================
router.post('/check-email', async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email is required' 
            });
        }
        
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format' 
            });
        }
        
        const usersSnap = await db.ref('users').once('value');
        let emailFound = false;
        let userData = null;
        
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const user = child.val();
                if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
                    emailFound = true;
                    userData = {
                        uid: child.key,
                        email: user.email,
                        username: user.username || user.fullName || user.name || '',
                        fullName: user.fullName || user.name || '',
                        phone: user.phone || '',
                        country: user.country || 'Tanzania'
                    };
                }
            });
        }
        
        res.json({
            success: true,
            exists: emailFound,
            user: emailFound ? userData : null,
            message: emailFound ? 'Email found' : 'Email not found'
        });
        
    } catch (error) {
        console.error('[AUTH] Check email error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to check email' 
        });
    }
});

// ============================================================
// 2. CHECK PHONE EXISTS
// ============================================================
router.post('/check-phone', async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                error: 'Phone number is required' 
            });
        }
        
        const usersSnap = await db.ref('users').once('value');
        let phoneFound = false;
        let userData = null;
        
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const user = child.val();
                if (user.phone && user.phone === phone) {
                    phoneFound = true;
                    userData = {
                        uid: child.key,
                        email: user.email || '',
                        username: user.username || user.fullName || '',
                        fullName: user.fullName || user.name || '',
                        phone: user.phone,
                        country: user.country || 'Tanzania'
                    };
                }
            });
        }
        
        res.json({
            success: true,
            exists: phoneFound,
            user: phoneFound ? userData : null,
            message: phoneFound ? 'Phone found' : 'Phone not found'
        });
        
    } catch (error) {
        console.error('[AUTH] Check phone error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to check phone' 
        });
    }
});

// ============================================================
// 3. REGISTER WITH EMAIL
// ============================================================
router.post('/register/email', async (req, res) => {
    try {
        const { 
            email, 
            password, 
            fullName, 
            username, 
            country, 
            phone,
            referralCode 
        } = req.body;
        
        if (!email || !password || !fullName) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email, password, and full name are required' 
            });
        }
        
        if (!isValidEmail(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                error: 'Password must be at least 6 characters' 
            });
        }
        
        let referredBy = null;
        if (referralCode) {
            referredBy = await verifyReferralCode(referralCode);
            if (!referredBy) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid referral code' 
                });
            }
        }
        
        const result = await registerWithEmail(
            email,
            password,
            fullName,
            username,
            country || 'Tanzania',
            referredBy
        );
        
        if (phone && isValidPhone(phone)) {
            const { db } = getFirebase(req);
            await db.ref(`users/${result.uid}`).update({ phone: phone });
        }
        
        res.json({
            success: true,
            data: {
                uid: result.uid,
                email: result.email,
                referralCode: result.referralCode,
                message: result.message || 'Account created successfully'
            }
        });
        
    } catch (error) {
        console.error('[AUTH] Register error:', error);
        
        let errorMessage = 'Registration failed';
        let statusCode = 400;
        
        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password too weak (min 6 characters)';
        } else if (error.code === 'auth/operation-not-allowed') {
            errorMessage = 'Email/password accounts are not enabled';
            statusCode = 403;
        } else {
            errorMessage = error.message || 'Registration failed';
        }
        
        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            code: error.code 
        });
    }
});

// ============================================================
// 4. REGISTER WITH GOOGLE
// ============================================================
router.post('/register/google', async (req, res) => {
    try {
        const { uid, email, fullName, username, referralCode } = req.body;
        
        if (!uid || !email) {
            return res.status(400).json({ 
                success: false, 
                error: 'UID and email are required' 
            });
        }
        
        let referredBy = null;
        if (referralCode) {
            referredBy = await verifyReferralCode(referralCode);
        }
        
        const result = await saveGoogleUser(uid, email, fullName, username, referredBy);
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        console.error('[AUTH] Google register error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Google registration failed' 
        });
    }
});

// ============================================================
// 5. GET USER PROFILE
// ============================================================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const userId = req.user.uid;
        
        const userSnap = await db.ref(`users/${userId}`).once('value');
        
        if (!userSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const user = userSnap.val();
        
        res.json({
            success: true,
            user: {
                id: userId,
                uid: userId,
                email: user.email,
                fullName: user.fullName || user.name || '',
                name: user.name || user.fullName || '',
                username: user.username || '',
                phone: user.phone || '',
                country: user.country || 'Tanzania',
                balance: user.balance || 0,
                tradingBalance: user.tradingBalance || 0,
                totalDeposited: user.totalDeposited || 0,
                totalWithdrawn: user.totalWithdrawn || 0,
                totalProfit: user.totalProfit || 0,
                winRate: user.winRate || 0,
                isMerchant: user.isMerchant || false,
                isVerified: user.isVerified || false,
                isOnline: user.isOnline || false,
                kycStatus: user.kycStatus || 'none',
                referralCode: user.referralCode || '',
                referralCount: user.referralCount || 0,
                createdAt: user.createdAt || Date.now(),
                lastActive: user.lastActive || Date.now(),
                lastSeen: user.lastSeen || null,
                profilePic: user.profilePic || null
            }
        });
        
    } catch (error) {
        console.error('[AUTH] Profile error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to get profile' 
        });
    }
});

// ============================================================
// 6. UPDATE USER PROFILE
// ============================================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const userId = req.user.uid;
        
        const { fullName, username, phone, country, profilePic } = req.body;
        
        if (phone && !isValidPhone(phone)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid phone number format' 
            });
        }
        
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (username) updates.username = username;
        if (phone) updates.phone = phone;
        if (country) updates.country = country;
        if (profilePic) updates.profilePic = profilePic;
        updates.updatedAt = Date.now();
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'No fields to update' 
            });
        }
        
        await db.ref(`users/${userId}`).update(updates);
        
        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
        
    } catch (error) {
        console.error('[AUTH] Update profile error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to update profile' 
        });
    }
});

// ============================================================
// 7. UPDATE ONLINE STATUS
// ============================================================
router.put('/status', verifyToken, async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const userId = req.user.uid;
        
        const { isOnline } = req.body;
        
        await db.ref(`users/${userId}`).update({
            isOnline: isOnline === true,
            lastSeen: Date.now()
        });
        
        res.json({
            success: true,
            isOnline: isOnline === true,
            lastSeen: Date.now()
        });
        
    } catch (error) {
        console.error('[AUTH] Status error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to update status' 
        });
    }
});

// ============================================================
// 8. GENERATE REFERRAL CODE
// ============================================================
router.post('/generate-referral', verifyToken, async (req, res) => {
    try {
        const { db } = getFirebase(req);
        const userId = req.user.uid;
        
        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const user = userSnap.val();
        let referralCode = user.referralCode;
        
        if (!referralCode) {
            referralCode = await generateUniqueReferralCode();
            await db.ref(`users/${userId}`).update({ referralCode });
        }
        
        res.json({
            success: true,
            referralCode: referralCode,
            referralLink: `${process.env.FRONTEND_URL || 'https://your-domain.com'}/register.html?ref=${referralCode}`
        });
        
    } catch (error) {
        console.error('[AUTH] Generate referral error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to generate referral code' 
        });
    }
});

// ============================================================
// 9. VERIFY REFERRAL CODE (Public)
// ============================================================
router.get('/verify-referral/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const result = await verifyReferralCode(code);
        
        res.json({
            success: true,
            valid: result !== null,
            referrerId: result
        });
        
    } catch (error) {
        console.error('[AUTH] Verify referral error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to verify referral code' 
        });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;