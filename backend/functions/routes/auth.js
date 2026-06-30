// functions/routes/auth.js
const express = require('express');
const router = express.Router();
const { getDB, admin, getAuth } = require('../firebase');

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
// 1. REGISTER - Email
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, fullName, username, country, referralCode } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const db = getDB();

        // Check if email exists
        const usersSnap = await db.ref('users').once('value');
        let emailExists = false;
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                if (child.val().email && child.val().email.toLowerCase() === email.toLowerCase()) {
                    emailExists = true;
                }
            });
        }

        if (emailExists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Check referral code
        if (referralCode) {
            const refSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
            if (!refSnap.exists()) {
                return res.status(400).json({ success: false, error: 'Invalid referral code' });
            }
        }

        const userData = createUserObject({
            email,
            fullName,
            username,
            country,
            referralCode,
            method: 'email'
        });

        const userId = userData.uid;

        // Save user
        await db.ref(`users/${userId}`).set(userData);

        // Process referral
        if (referralCode) {
            try {
                const referrerSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
                if (referrerSnap.exists()) {
                    referrerSnap.forEach(async (child) => {
                        const referrerId = child.key;
                        const referrerData = child.val();
                        await db.ref(`users/${referrerId}`).update({
                            referralCount: (referrerData.referralCount || 0) + 1
                        });
                        const notifRef = db.ref(`notifications/${referrerId}`).push();
                        await notifRef.set({
                            title: 'New Referral! 🎉',
                            message: `${fullName || email} joined using your referral link!`,
                            type: 'success',
                            read: false,
                            timestamp: Date.now()
                        });
                    });
                }
            } catch (e) {
                console.error('[REFERRAL] Error:', e);
            }
        }

        res.json({
            success: true,
            data: {
                uid: userId,
                email: email,
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
// 2. REGISTER - Google ✅
// ============================================================
router.post('/register/google', async (req, res) => {
    try {
        const { uid, email, fullName, username, referralCode } = req.body;

        if (!uid || !email) {
            return res.status(400).json({ success: false, error: 'UID and email required' });
        }

        const db = getDB();

        // Check if user already exists
        const userSnap = await db.ref(`users/${uid}`).once('value');
        if (userSnap.exists()) {
            await db.ref(`users/${uid}`).update({
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
        const usersSnap = await db.ref('users').once('value');
        let emailExists = false;
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                if (child.val().email && child.val().email.toLowerCase() === email.toLowerCase()) {
                    emailExists = true;
                }
            });
        }

        if (emailExists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Check referral code
        if (referralCode) {
            const refSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
            if (!refSnap.exists()) {
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

        await db.ref(`users/${uid}`).set(userData);

        // Process referral
        if (referralCode) {
            try {
                const referrerSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
                if (referrerSnap.exists()) {
                    referrerSnap.forEach(async (child) => {
                        const referrerId = child.key;
                        const referrerData = child.val();
                        await db.ref(`users/${referrerId}`).update({
                            referralCount: (referrerData.referralCount || 0) + 1
                        });
                        const notifRef = db.ref(`notifications/${referrerId}`).push();
                        await notifRef.set({
                            title: 'New Referral! 🎉',
                            message: `${fullName || email} joined using your referral link!`,
                            type: 'success',
                            read: false,
                            timestamp: Date.now()
                        });
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
// 3. REGISTER - Phone ✅
// ============================================================
router.post('/register/phone', async (req, res) => {
    try {
        const { uid, phone, fullName, username, country, referralCode } = req.body;

        if (!uid || !phone) {
            return res.status(400).json({ success: false, error: 'UID and phone required' });
        }

        const db = getDB();

        // Check if user already exists
        const userSnap = await db.ref(`users/${uid}`).once('value');
        if (userSnap.exists()) {
            await db.ref(`users/${uid}`).update({
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
        const usersSnap = await db.ref('users').once('value');
        let phoneExists = false;
        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                if (child.val().phone && child.val().phone === phone) {
                    phoneExists = true;
                }
            });
        }

        if (phoneExists) {
            return res.status(400).json({ success: false, error: 'Phone number already registered' });
        }

        // Check referral code
        if (referralCode) {
            const refSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
            if (!refSnap.exists()) {
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

        await db.ref(`users/${uid}`).set(userData);

        // Process referral
        if (referralCode) {
            try {
                const referrerSnap = await db.ref('users').orderByChild('referralCode').equalTo(referralCode.toUpperCase()).once('value');
                if (referrerSnap.exists()) {
                    referrerSnap.forEach(async (child) => {
                        const referrerId = child.key;
                        const referrerData = child.val();
                        await db.ref(`users/${referrerId}`).update({
                            referralCount: (referrerData.referralCount || 0) + 1
                        });
                        const notifRef = db.ref(`notifications/${referrerId}`).push();
                        await notifRef.set({
                            title: 'New Referral! 🎉',
                            message: `${fullName || phone} joined using your referral link!`,
                            type: 'success',
                            read: false,
                            timestamp: Date.now()
                        });
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
// 4. LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const db = getDB();

        // Find user by email
        const usersSnap = await db.ref('users').once('value');
        let foundUser = null;
        let userId = null;

        if (usersSnap.exists()) {
            usersSnap.forEach(child => {
                const user = child.val();
                if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
                    foundUser = user;
                    userId = child.key;
                }
            });
        }

        if (!foundUser || !userId) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Update last login
        await db.ref(`users/${userId}`).update({
            lastLogin: Date.now(),
            lastActive: Date.now(),
            isOnline: true
        });

        res.json({
            success: true,
            data: {
                uid: userId,
                email: foundUser.email,
                username: foundUser.username,
                fullName: foundUser.fullName,
                referralCode: foundUser.referralCode,
                balance: foundUser.balance || 0,
                tradingBalance: foundUser.tradingBalance || 0,
                isVerified: foundUser.isVerified || false,
                isMerchant: foundUser.isMerchant || false,
                kycStatus: foundUser.kycStatus || 'none'
            }
        });

    } catch (error) {
        console.error('[AUTH] Login error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET PROFILE
// ============================================================
router.get('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing authorization token' });
        }

        const token = authHeader.split('Bearer ')[1];

        // Verify token
        let decodedToken;
        try {
            const auth = getAuth();
            decodedToken = await auth.verifyIdToken(token);
        } catch (error) {
            try {
                const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken: token })
                });
                const data = await response.json();
                if (data.users && data.users.length > 0) {
                    decodedToken = { uid: data.users[0].localId, email: data.users[0].email };
                } else {
                    throw new Error('Invalid token');
                }
            } catch (e) {
                return res.status(401).json({ success: false, error: 'Invalid or expired token' });
            }
        }

        const userId = decodedToken.uid;
        const db = getDB();

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = userSnap.val();

        res.json({
            success: true,
            user: {
                id: userId,
                email: user.email,
                fullName: user.fullName || user.name || '',
                username: user.username || '',
                phone: user.phone || '',
                country: user.country || 'Tanzania',
                balance: user.balance || 0,
                tradingBalance: user.tradingBalance || 0,
                totalDeposited: user.totalDeposited || 0,
                totalWithdrawn: user.totalWithdrawn || 0,
                totalProfit: user.totalProfit || 0,
                dailyPnL: user.dailyPnL || 0,
                dailyLoss: user.dailyLoss || 0,
                winRate: user.winRate || 0,
                activeTrades: user.activeTrades || 0,
                aiScore: user.aiScore || 0,
                isMerchant: user.isMerchant || false,
                isVerified: user.isVerified || false,
                isOnline: user.isOnline || false,
                isPhoneUser: user.isPhoneUser || false,
                referralCode: user.referralCode || '',
                referralCount: user.referralCount || 0,
                commissionEarned: user.commissionEarned || 0,
                affiliateWithdrawn: user.affiliateWithdrawn || 0,
                kycStatus: user.kycStatus || 'none',
                subscriptionMultiplier: user.subscriptionMultiplier || 1,
                subscriptionExpiry: user.subscriptionExpiry || 0,
                createdAt: user.createdAt || Date.now(),
                lastActive: user.lastActive || null,
                profilePic: user.profilePic || null
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
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing authorization token' });
        }

        const token = authHeader.split('Bearer ')[1];
        let userId;

        try {
            const auth = getAuth();
            const decoded = await auth.verifyIdToken(token);
            userId = decoded.uid;
        } catch (e) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const db = getDB();
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

        await db.ref(`users/${userId}`).update(updates);

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

        const db = getDB();
        const upperCode = code.toUpperCase();
        const snapshot = await db.ref('users').orderByChild('referralCode').equalTo(upperCode).once('value');

        if (snapshot.exists()) {
            let userId = null;
            snapshot.forEach(child => {
                userId = child.key;
            });
            return res.json({
                success: true,
                valid: true,
                userId: userId
            });
        }

        res.json({
            success: true,
            valid: false
        });

    } catch (error) {
        console.error('[AUTH] Verify referral error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. UPDATE ONLINE STATUS
// ============================================================
router.put('/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing token' });
        }

        const token = authHeader.split('Bearer ')[1];
        let userId;

        try {
            const auth = getAuth();
            const decoded = await auth.verifyIdToken(token);
            userId = decoded.uid;
        } catch (e) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { isOnline } = req.body;
        const db = getDB();

        await db.ref(`users/${userId}`).update({
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

module.exports = router;