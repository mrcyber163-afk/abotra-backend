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
    authUpdateUser,
    authDeleteUser,
    authSendPasswordReset,
    authSendEmailVerification,
    authRefreshToken,
    verifyIdToken,
    FIREBASE_DATABASE_URL
} = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token (REST API)
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
// HELPER: Create user object
// ============================================================
function createUserObject(data) {
    const {
        uid,
        email,
        fullName,
        username,
        country,
        phone,
        method = 'email',
        referralCode = null,
        isPhoneUser = false
    } = data;

    const userId = uid || 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const refCode = referralCode || 'ABOTRA' + Math.random().toString(36).substring(2, 8).toUpperCase();

    return {
        uid: userId,
        email: email || '',
        fullName: fullName || email?.split('@')[0] || 'User',
        username: username || email?.split('@')[0] + Math.floor(Math.random() * 1000),
        country: country || 'Tanzania',
        phone: phone || '',
        method: method,
        emailVerified: false,
        phoneVerified: false,
        isPhoneUser: isPhoneUser,
        referredBy: referralCode || null,
        referralCode: refCode,
        referralCount: 0,
        commissionEarned: 0,
        depositCommissionEarned: 0,
        botProfitCommissionEarned: 0,
        affiliateWithdrawn: 0,
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
        isMerchant: false,
        isOnline: true,
        profilePic: null,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        lastActive: Date.now(),
        kycStatus: 'none',
        subscriptionMultiplier: 1,
        subscriptionExpiry: 0
    };
}

// ============================================================
// 1. REGISTER - Email (Using Firebase Auth REST)
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, username, country, referralCode } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        // ✅ Create user in Firebase Authentication (REST)
        let authResult;
        try {
            authResult = await authSignUp(email, password);
        } catch (authError) {
            return res.status(400).json({ success: false, error: authError.message || 'Email already exists or invalid' });
        }

        const uid = authResult.localId;
        const idToken = authResult.idToken;

        // Check referral code
        if (referralCode) {
            const refSnap = await restGet('users');
            let valid = false;
            if (refSnap) {
                Object.keys(refSnap).forEach(key => {
                    if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                        valid = true;
                    }
                });
            }
            if (!valid) {
                return res.status(400).json({ success: false, error: 'Invalid referral code' });
            }
        }

        const userData = createUserObject({
            uid,
            email,
            fullName,
            username,
            country,
            referralCode,
            method: 'email'
        });

        // Save user to database
        await restPut(`users/${uid}`, userData);

        // Process referral
        if (referralCode) {
            try {
                const refSnap = await restGet('users');
                if (refSnap) {
                    Object.keys(refSnap).forEach(async (key) => {
                        if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                            await restPatch(`users/${key}`, {
                                referralCount: (refSnap[key].referralCount || 0) + 1
                            });
                            await restPost(`notifications/${key}`, {
                                title: 'New Referral! 🎉',
                                message: `${fullName || email} joined using your referral link!`,
                                type: 'success',
                                read: false,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('[REFERRAL] Error:', e);
            }
        }

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
// 2. REGISTER - Google
// ============================================================
router.post('/register/google', async (req, res) => {
    try {
        const { uid, email, fullName, username, referralCode } = req.body;

        if (!uid || !email) {
            return res.status(400).json({ success: false, error: 'UID and email required' });
        }

        // Check if user already exists
        const existingUser = await restGet(`users/${uid}`);
        if (existingUser) {
            await restPatch(`users/${uid}`, {
                lastLogin: Date.now(),
                isOnline: true
            });
            return res.json({
                success: true,
                data: {
                    uid: uid,
                    email: email,
                    message: 'User already exists, logged in'
                }
            });
        }

        // Check if email exists
        const usersSnap = await restGet('users');
        let emailExists = false;
        if (usersSnap) {
            Object.keys(usersSnap).forEach(key => {
                if (usersSnap[key].email && usersSnap[key].email.toLowerCase() === email.toLowerCase()) {
                    emailExists = true;
                }
            });
        }

        if (emailExists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Check referral code
        if (referralCode) {
            let valid = false;
            const refSnap = await restGet('users');
            if (refSnap) {
                Object.keys(refSnap).forEach(key => {
                    if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                        valid = true;
                    }
                });
            }
            if (!valid) {
                return res.status(400).json({ success: false, error: 'Invalid referral code' });
            }
        }

        const userData = createUserObject({
            uid: uid,
            email: email,
            fullName: fullName || email.split('@')[0],
            username: username || email.split('@')[0] + Math.floor(Math.random() * 1000),
            referralCode: referralCode,
            method: 'google'
        });

        await restPut(`users/${uid}`, userData);

        // Process referral
        if (referralCode) {
            try {
                const refSnap = await restGet('users');
                if (refSnap) {
                    Object.keys(refSnap).forEach(async (key) => {
                        if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                            await restPatch(`users/${key}`, {
                                referralCount: (refSnap[key].referralCount || 0) + 1
                            });
                            await restPost(`notifications/${key}`, {
                                title: 'New Referral! 🎉',
                                message: `${fullName || email} joined using your referral link!`,
                                type: 'success',
                                read: false,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('[REFERRAL] Error:', e);
            }
        }

        res.json({
            success: true,
            data: {
                uid: uid,
                email: email,
                referralCode: userData.referralCode,
                message: 'Google account created successfully'
            }
        });

    } catch (error) {
        console.error('[AUTH] Google register error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. REGISTER - Phone
// ============================================================
router.post('/register/phone', async (req, res) => {
    try {
        const { uid, phone, fullName, username, country, referralCode } = req.body;

        if (!uid || !phone) {
            return res.status(400).json({ success: false, error: 'UID and phone required' });
        }

        // Check if user already exists
        const existingUser = await restGet(`users/${uid}`);
        if (existingUser) {
            await restPatch(`users/${uid}`, {
                lastLogin: Date.now(),
                isOnline: true
            });
            return res.json({
                success: true,
                data: {
                    uid: uid,
                    phone: phone,
                    message: 'User already exists'
                }
            });
        }

        // Check if phone exists
        const usersSnap = await restGet('users');
        let phoneExists = false;
        if (usersSnap) {
            Object.keys(usersSnap).forEach(key => {
                if (usersSnap[key].phone && usersSnap[key].phone === phone) {
                    phoneExists = true;
                }
            });
        }

        if (phoneExists) {
            return res.status(400).json({ success: false, error: 'Phone number already registered' });
        }

        // Check referral code
        if (referralCode) {
            let valid = false;
            const refSnap = await restGet('users');
            if (refSnap) {
                Object.keys(refSnap).forEach(key => {
                    if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                        valid = true;
                    }
                });
            }
            if (!valid) {
                return res.status(400).json({ success: false, error: 'Invalid referral code' });
            }
        }

        const userData = createUserObject({
            uid: uid,
            email: phone + '@phone.user',
            fullName: fullName || 'Phone User',
            username: username || 'user_' + Math.floor(Math.random() * 10000),
            country: country || 'Tanzania',
            phone: phone,
            referralCode: referralCode,
            method: 'phone',
            isPhoneUser: true
        });

        await restPut(`users/${uid}`, userData);

        // Process referral
        if (referralCode) {
            try {
                const refSnap = await restGet('users');
                if (refSnap) {
                    Object.keys(refSnap).forEach(async (key) => {
                        if (refSnap[key].referralCode && refSnap[key].referralCode.toUpperCase() === referralCode.toUpperCase()) {
                            await restPatch(`users/${key}`, {
                                referralCount: (refSnap[key].referralCount || 0) + 1
                            });
                            await restPost(`notifications/${key}`, {
                                title: 'New Referral! 🎉',
                                message: `${fullName || phone} joined using your referral link!`,
                                type: 'success',
                                read: false,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
            } catch (e) {
                console.error('[REFERRAL] Error:', e);
            }
        }

        res.json({
            success: true,
            data: {
                uid: uid,
                phone: phone,
                referralCode: userData.referralCode,
                message: 'Phone account created successfully'
            }
        });

    } catch (error) {
        console.error('[AUTH] Phone register error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. LOGIN (Using Firebase Auth REST)
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        // ✅ Sign in using Firebase Auth REST
        let authResult;
        try {
            authResult = await authSignIn(email, password);
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const uid = authResult.localId;
        const idToken = authResult.idToken;
        const refreshToken = authResult.refreshToken;

        // Get user data from database
        const userData = await restGet(`users/${uid}`);
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Update last login
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
                isMerchant: userData.isMerchant || false,
                kycStatus: userData.kycStatus || 'none'
            }
        });

    } catch (error) {
        console.error('[AUTH] Login error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET PROFILE (Using REST)
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
                fullName: userData.fullName || userData.name || '',
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
                isMerchant: userData.isMerchant || false,
                isVerified: userData.isVerified || false,
                isOnline: userData.isOnline || false,
                isPhoneUser: userData.isPhoneUser || false,
                referralCode: userData.referralCode || '',
                referralCount: userData.referralCount || 0,
                commissionEarned: userData.commissionEarned || 0,
                affiliateWithdrawn: userData.affiliateWithdrawn || 0,
                kycStatus: userData.kycStatus || 'none',
                subscriptionMultiplier: userData.subscriptionMultiplier || 1,
                subscriptionExpiry: userData.subscriptionExpiry || 0,
                createdAt: userData.createdAt || Date.now(),
                lastActive: userData.lastActive || null,
                profilePic: userData.profilePic || null
            }
        });

    } catch (error) {
        console.error('[AUTH] Profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. UPDATE PROFILE
// ============================================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { fullName, username, phone, country, profilePic } = req.body;

        const updates = {};
        if (fullName !== undefined) updates.fullName = fullName;
        if (username !== undefined) updates.username = username;
        if (phone !== undefined) updates.phone = phone;
        if (country !== undefined) updates.country = country;
        if (profilePic !== undefined) updates.profilePic = profilePic;
        updates.updatedAt = Date.now();

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }

        await restPatch(`users/${userId}`, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('[AUTH] Update error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. VERIFY REFERRAL CODE
// ============================================================
router.get('/verify-referral/:code', async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) {
            return res.status(400).json({ success: false, error: 'Referral code required' });
        }

        const upperCode = code.toUpperCase();
        const usersSnap = await restGet('users');
        let found = false;
        let userId = null;

        if (usersSnap) {
            Object.keys(usersSnap).forEach(key => {
                if (usersSnap[key].referralCode && usersSnap[key].referralCode.toUpperCase() === upperCode) {
                    found = true;
                    userId = key;
                }
            });
        }

        res.json({
            success: true,
            valid: found,
            userId: userId
        });

    } catch (error) {
        console.error('[AUTH] Verify referral error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. UPDATE ONLINE STATUS
// ============================================================
router.put('/status', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { isOnline } = req.body;

        await restPatch(`users/${userId}`, {
            isOnline: isOnline || false,
            lastSeen: Date.now()
        });

        res.json({
            success: true,
            isOnline: isOnline
        });

    } catch (error) {
        console.error('[AUTH] Status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. REFRESH TOKEN
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
// 10. SEND PASSWORD RESET
// ============================================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email required' });
        }

        await authSendPasswordReset(email);
        res.json({
            success: true,
            message: 'Password reset email sent'
        });

    } catch (error) {
        console.error('[AUTH] Reset password error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 11. DELETE ACCOUNT
// ============================================================
router.delete('/account', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const authHeader = req.headers.authorization;
        const idToken = authHeader.split('Bearer ')[1];

        // Delete from Firebase Auth
        await authDeleteUser(idToken);

        // Delete user data from database
        await restDelete(`users/${userId}`);
        await restDelete(`trades/${userId}`);
        await restDelete(`userRobots/${userId}`);
        await restDelete(`notifications/${userId}`);
        await restDelete(`signals/${userId}`);
        await restDelete(`signalStats/${userId}`);
        await restDelete(`robotStats/${userId}`);
        await restDelete(`tradingLogs/${userId}`);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('[AUTH] Delete account error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;