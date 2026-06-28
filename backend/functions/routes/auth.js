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
    authSignUp,
    authSignIn,
    authGetUser
} = require('../firebase');

// ============================================================
// 📧 REGISTER WITH EMAIL
// ============================================================
router.post('/register/email', async (req, res) => {
    try {
        const { email, password, username, fullName, country, referralCode } = req.body;

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

        console.log('[REGISTER-EMAIL] Creating user:', email);

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

        console.log('[REGISTER-EMAIL] User created:', uid);

        // 2. Generate referral code
        const referralCodeGen = await generateReferralCode();

        // 3. Save user data
        const userData = {
            uid: uid,
            email: email,
            username: displayName,
            fullName: fullName || displayName,
            country: country || 'Tanzania',
            balance: 0,
            totalDeposited: 0,
            createdAt: Date.now(),
            isVerified: false,
            isActive: true,
            method: 'email',
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER-EMAIL] User data saved');

        // 4. Process referral
        if (referralCode) {
            await processReferral(referralCode, displayName);
        }

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
        console.error('[REGISTER-EMAIL] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message || 'Registration failed'
        });
    }
});

// ============================================================
// 📱 REGISTER WITH PHONE
// ============================================================
router.post('/register/phone', async (req, res) => {
    try {
        const { 
            uid, 
            fullName, 
            username, 
            phone, 
            phoneRaw, 
            phoneCountryCode, 
            country, 
            referralCode,
            password 
        } = req.body;

        if (!uid || !phone) {
            return res.status(400).json({
                success: false,
                error: 'uid and phone are required'
            });
        }

        console.log('[REGISTER-PHONE] Saving user:', phone);

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
            method: 'phone',
            isPhoneUser: true,
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER-PHONE] User data saved');

        if (referralCode) {
            await processReferral(referralCode, fullName || 'User');
        }

        return res.json({
            success: true,
            message: 'Phone user registered successfully',
            data: {
                uid: uid,
                phone: phone,
                username: username || phone,
                referralCode: referralCodeGen
            }
        });

    } catch (error) {
        console.error('[REGISTER-PHONE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 🔵 REGISTER WITH GOOGLE
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

        console.log('[REGISTER-GOOGLE] Saving user:', email);

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
            method: 'google',
            referralCode: referralCodeGen,
            referredBy: referralCode || null,
            referralCount: 0,
            authProvider: 'google'
        };

        await restPut(`users/${uid}`, userData);
        console.log('[REGISTER-GOOGLE] User data saved');

        if (referralCode) {
            await processReferral(referralCode, fullName || email.split('@')[0]);
        }

        return res.json({
            success: true,
            message: 'Google user registered successfully',
            data: {
                uid: uid,
                email: email,
                username: username || email.split('@')[0],
                referralCode: referralCodeGen
            }
        });

    } catch (error) {
        console.error('[REGISTER-GOOGLE] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 🔐 LOGIN
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

        const authResult = await authSignIn(email, password);

        if (!authResult || !authResult.idToken) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        const uid = authResult.localId;
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
// ✅ VERIFY TOKEN
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

// ============================================================
// 🔍 VERIFY REFERRAL CODE
// ============================================================
router.get('/verify-referral/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Referral code is required'
            });
        }

        const users = await restGet('users');
        if (!users) {
            return res.json({
                success: true,
                valid: false,
                referrer: null
            });
        }

        const upperCode = code.toUpperCase();
        let referrer = null;

        for (const [uid, userData] of Object.entries(users)) {
            if (userData.referralCode && userData.referralCode.toUpperCase() === upperCode) {
                referrer = {
                    uid: uid,
                    username: userData.username,
                    fullName: userData.fullName
                };
                break;
            }
        }

        return res.json({
            success: true,
            valid: !!referrer,
            referrer: referrer
        });

    } catch (error) {
        console.error('[VERIFY REFERRAL] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 🚪 LOGOUT
// ============================================================
router.post('/logout', (req, res) => {
    return res.json({
        success: true,
        message: 'Logout successful'
    });
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

        const referrerData = users[referrerUid];
        const referralCount = (referrerData.referralCount || 0) + 1;
        await restPatch(`users/${referrerUid}`, { referralCount });

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

module.exports = router;
