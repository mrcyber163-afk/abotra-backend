// functions/routes/auth.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

// ============================================================
// 1. CHECK EMAIL EXISTS
// ============================================================
router.post('/check-email', async (req, res) => {
    try {
        const db = getDB();
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email required' });
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
                        username: user.username || user.fullName || user.name || ''
                    };
                }
            });
        }
        
        if (emailFound) {
            res.json({
                success: true,
                exists: true,
                user: userData
            });
        } else {
            res.json({
                success: true,
                exists: false,
                message: 'Email not found'
            });
        }
        
    } catch (error) {
        console.error('[AUTH] Check email error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. REGISTER USER
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const db = getDB();
        const { email, password, name, country, phone } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }
        
        // Create user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name || email.split('@')[0]
        });
        
        // Save user data in RTDB
        const userData = {
            uid: userRecord.uid,
            email: email,
            name: name || email.split('@')[0],
            username: name || email.split('@')[0],
            country: country || 'Tanzania',
            phone: phone || '',
            balance: 0,
            tradingBalance: 0,
            isMerchant: false,
            isVerified: false,
            isOnline: true,
            createdAt: Date.now(),
            date: new Date().toISOString()
        };
        
        await db.ref(`users/${userRecord.uid}`).set(userData);
        
        // Generate referral code
        const refCode = 'ABOTRA' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await db.ref(`users/${userRecord.uid}`).update({ referralCode: refCode });
        
        res.json({
            success: true,
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName
            }
        });
        
    } catch (error) {
        console.error('[AUTH] Register error:', error);
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'Email already registered';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password too weak (min 6 characters)';
        }
        res.status(400).json({ success: false, error: errorMessage });
    }
});

// ============================================================
// 3. GET USER PROFILE
// ============================================================
router.get('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing token' });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
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
                name: user.name || user.username || '',
                username: user.username || '',
                phone: user.phone || '',
                country: user.country || 'Tanzania',
                balance: user.balance || 0,
                tradingBalance: user.tradingBalance || 0,
                isMerchant: user.isMerchant || false,
                isVerified: user.isVerified || false,
                isOnline: user.isOnline || false,
                lastSeen: user.lastSeen || null,
                createdAt: user.createdAt || Date.now(),
                referralCode: user.referralCode || ''
            }
        });
        
    } catch (error) {
        console.error('[AUTH] Profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. UPDATE USER PROFILE
// ============================================================
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing token' });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        
        const { name, username, phone, country } = req.body;
        const db = getDB();
        
        const updates = {};
        if (name) updates.name = name;
        if (username) updates.username = username;
        if (phone) updates.phone = phone;
        if (country) updates.country = country;
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
        console.error('[AUTH] Update profile error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. UPDATE ONLINE STATUS
// ============================================================
router.put('/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Missing token' });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        
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

// ============================================================
// EXPORT
// ============================================================
module.exports = router;