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
        const { email, password, username, fullName, phone, country, referralCode } = req.body;

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

        console.log('[REGISTER] Creating user:', email);

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

        console.log('[REGISTER] User created:', uid);

        // 2. Generate referral code
        const referralCodeGen = await generateReferralCode();

        // 3. Save user data to database
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
            isActive: true,
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER] User data saved');

        // 4. Process referral if exists
        if (referralCode) {
            await processReferral(referralCode, displayName);
        }

        // 5. Return success with token
        return res.json({
            success: true,
            message: 'User registered successfully',
            data: {
                uid: uid,
                email: email,
                username: displayName,
                referralCode: referralCodeGen,
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

        console.log('[LOGIN] User:', email);

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
// GOOGLE REGISTER
// ============================================================
router.post('/register/google', async (req, res) => {
    try {
        const { uid, email, fullName, username, referralCode } = req.body;

        if (!uid || !email) {
            return res.status(400).json({
                success: false,
                error: 'uid and email are required'
            });
        }

        console.log('[GOOGLE] Saving user:', email);

        // Check if user exists
        const existingUser = await restGet(`users/${uid}`);
        if (existingUser) {
            return res.json({
                success: true,
                message: 'User already exists',
                data: { uid, email }
            });
        }

        // Generate referral code
        const referralCodeGen = await generateReferralCode();

        // Save user data
        const userData = {
            uid: uid,
            email: email,
            username: username || email.split('@')[0],
            fullName: fullName || email.split('@')[0],
            balance: 0,
            totalDeposited: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true,
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0,
            authProvider: 'google'
        };

        await restPut(`users/${uid}`, userData);

        if (referralCode) {
            await processReferral(referralCode, fullName || email.split('@')[0]);
        }

        return res.json({
            success: true,
            message: 'Google user registered successfully',
            data: { uid, email, referralCode: referralCodeGen }
        });

    } catch (error) {
        console.error('[GOOGLE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// PHONE REGISTER
// ============================================================
router.post('/register/phone', async (req, res) => {
    try {
        const { uid, fullName, username, phone, phoneRaw, phoneCountryCode, country, referralCode } = req.body;

        if (!uid || !phone) {
            return res.status(400).json({
                success: false,
                error: 'uid and phone are required'
            });
        }

        console.log('[PHONE] Saving user:', phone);

        // Check if user exists
        const existingUser = await restGet(`users/${uid}`);
        if (existingUser) {
            return res.json({
                success: true,
                message: 'User already exists',
                data: { uid, phone }
            });
        }

        // Generate referral code
        const referralCodeGen = await generateReferralCode();

        const userData = {
            uid: uid,
            fullName: fullName || 'User',
            username: username || phone,
            phone: phone,
            phoneRaw: phoneRaw || phone.replace(/\D/g, ''),
            phoneCountryCode: phoneCountryCode || '+255',
            country: country || 'Tanzania',
            balance: 0,
            totalDeposited: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true,
            isPhoneUser: true,
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0
        };

        await restPut(`users/${uid}`, userData);

        if (referralCode) {
            await processReferral(referralCode, fullName || 'User');
        }

        return res.json({
            success: true,
            message: 'Phone user registered successfully',
            data: { uid, phone, referralCode: referralCodeGen }
        });

    } catch (error) {
        console.error('[PHONE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// HELPERS
// ============================================================

async function generateReferralCode() {
    function generateCode() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ABOTRA${timestamp.slice(-4)}${random}`;
    }

    let code = generateCode();
    let attempts = 0;
    
    while (attempts < 50) {
        const users = await restGet('users');
        let found = false;
        if (users) {
            for (const [uid, userData] of Object.entries(users)) {
                if (userData.referralCode === code) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) return code;
        code = generateCode();
        attempts++;
    }
    return `ABOTRA${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

async function processReferral(referralCode, referrerName) {
    try {
        const users = await restGet('users');
        if (!users) return;

        let referrerUid = null;
        for (const [uid, userData] of Object.entries(users)) {
            if (userData.referralCode === referralCode) {
                referrerUid = uid;
                break;
            }
        }

        if (!referrerUid) return;

        // Update referral count
        const referrerData = users[referrerUid];
        const referralCount = (referrerData.referralCount || 0) + 1;
        await restPatch(`users/${referrerUid}`, { referralCount });

        // Create notification
        const notification = {
            title: 'New Referral! 🎉',
            message: `${referrerName || 'Someone'} joined using your referral link!`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        };

        await restPost(`notifications/${referrerUid}`, notification);
        console.log('[REFERRAL] Processed for:', referrerUid);

    } catch (error) {
        console.error('[REFERRAL] Error:', error.message);
    }
}

// ============================================================
// VERIFY TOKEN
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

        const userInfo = await authGetUser(idToken);

        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        const user = userInfo.users[0];
        const uid = user.localId;
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

module.exports = router;
