// ============================================================
// AUTH/REGISTER.JS - User Registration Logic
// ============================================================
// Location: backend/functions/auth/register.js
// ============================================================

const { getDB, getAuth, testConnection } = require('../firebase');

// ============================================================
// GENERATE UNIQUE REFERRAL CODE
// ============================================================
async function generateUniqueReferralCode() {
    const db = getDB();
    
    if (!db) {
        console.error('[REFERRAL] ❌ Database not initialized');
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ABOTRA${timestamp.slice(-4)}${random}`;
    }
    
    function generateCode() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ABOTRA${timestamp.slice(-4)}${random}`;
    }
    
    let code = generateCode();
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
        try {
            const snapshot = await db.ref('users')
                .orderByChild('referralCode')
                .equalTo(code)
                .once('value');
            
            if (!snapshot.exists()) {
                return code;
            }
            
            code = generateCode();
            attempts++;
            
        } catch (error) {
            console.error(`[REFERRAL] ❌ Check attempt ${attempts + 1} failed:`, error.message);
            if (attempts > 5) {
                console.warn('[REFERRAL] ⚠️ Returning code without verification due to errors');
                return code;
            }
            code = generateCode();
            attempts++;
        }
    }
    
    console.warn('[REFERRAL] ⚠️ Max attempts reached, using fallback code');
    return `ABOTRA${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ============================================================
// VERIFY REFERRAL CODE
// ============================================================
async function verifyReferralCode(refCode) {
    if (!refCode) return null;
    
    const db = getDB();
    if (!db) {
        console.error('[REFERRAL] ❌ Database not initialized');
        return null;
    }
    
    try {
        const upperRefCode = refCode.toUpperCase();
        console.log(`[REFERRAL] 🔍 Verifying code: ${upperRefCode}`);
        
        const snapshot = await db.ref('users')
            .orderByChild('referralCode')
            .equalTo(upperRefCode)
            .once('value');
        
        if (snapshot.exists()) {
            for (const [userId, userData] of Object.entries(snapshot.val())) {
                if (userData.referralCode && 
                    userData.referralCode.toUpperCase() === upperRefCode) {
                    console.log(`[REFERRAL] ✅ Valid referral code from user: ${userId}`);
                    return userId;
                }
            }
        }
        
        console.log(`[REFERRAL] ❌ Code not found: ${upperRefCode}`);
        return null;
        
    } catch (error) {
        console.error('[REFERRAL] ❌ Verification error:', error);
        return null;
    }
}

// ============================================================
// REGISTER WITH EMAIL
// ============================================================
async function registerWithEmail(email, password, fullName, username, country, referredBy) {
    const auth = getAuth();
    const db = getDB();
    
    if (!auth || !db) {
        throw new Error('Firebase services not initialized');
    }
    
    try {
        console.log(`[REGISTER] 📧 Creating user: ${email}`);
        
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: fullName,
            emailVerified: false
        });
        
        console.log(`[REGISTER] ✅ User created: ${userRecord.uid}`);
        
        const referralCode = await generateUniqueReferralCode();
        
        const userData = {
            uid: userRecord.uid,
            fullName: fullName || email.split('@')[0],
            username: username || email.split('@')[0] + Math.floor(Math.random() * 1000),
            email: email,
            country: country || 'Tanzania',
            method: 'email',
            emailVerified: false,
            phoneVerified: false,
            referredBy: referredBy || null,
            referralCode: referralCode,
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
            isPhoneUser: false,
            isOnline: false,
            profilePic: null,
            registrationIP: 'unknown',
            userAgent: 'backend',
            createdAt: Date.now(),
            lastLogin: Date.now(),
            lastActive: Date.now(),
            kycStatus: 'none',
            subscriptionMultiplier: 1,
            subscriptionExpiry: 0
        };
        
        await db.ref(`users/${userRecord.uid}`).set(userData);
        console.log(`[REGISTER] ✅ User data saved`);
        
        if (referredBy) {
            await processReferral(referredBy, fullName, db);
        }
        
        return {
            success: true,
            uid: userRecord.uid,
            email: userRecord.email,
            referralCode: referralCode,
            message: 'Account created successfully'
        };
        
    } catch (error) {
        console.error('[REGISTER] ❌ Error:', error);
        throw error;
    }
}

// ============================================================
// PROCESS REFERRAL
// ============================================================
async function processReferral(referredBy, fullName, db) {
    try {
        if (!db) db = getDB();
        if (!db) return;
        
        const referrerRef = db.ref(`users/${referredBy}`);
        const referrerSnap = await referrerRef.once('value');
        
        if (referrerSnap.exists()) {
            await referrerRef.update({
                referralCount: (referrerSnap.val().referralCount || 0) + 1
            });
            
            const notifRef = db.ref(`notifications/${referredBy}`).push();
            await notifRef.set({
                title: 'New Referral! 🎉',
                message: `${fullName} joined using your referral link!`,
                type: 'success',
                read: false,
                timestamp: Date.now()
            });
            
            console.log(`[REFERRAL] ✅ Processed for user: ${referredBy}`);
        }
        
    } catch (error) {
        console.error('[REFERRAL] ❌ Processing error:', error);
    }
}

// ============================================================
// SAVE GOOGLE USER
// ============================================================
async function saveGoogleUser(uid, email, fullName, username, referredBy) {
    const db = getDB();
    
    if (!db) {
        throw new Error('Firebase database not initialized');
    }
    
    try {
        console.log(`[GOOGLE] 📧 Saving Google user: ${email} (${uid})`);
        
        const userSnap = await db.ref(`users/${uid}`).once('value');
        
        if (userSnap.exists()) {
            await db.ref(`users/${uid}`).update({
                lastLogin: Date.now(),
                lastActive: Date.now(),
                email: email
            });
            
            console.log(`[GOOGLE] ✅ User updated: ${uid}`);
            return {
                success: true,
                uid: uid,
                referralCode: userSnap.val().referralCode,
                message: 'User updated'
            };
        }
        
        const referralCode = await generateUniqueReferralCode();
        const usernameFinal = username || 
            email.split('@')[0] + Math.floor(Math.random() * 1000);
        
        const userData = {
            uid: uid,
            fullName: fullName || email.split('@')[0],
            username: usernameFinal,
            email: email,
            country: 'Auto',
            method: 'google',
            emailVerified: true,
            phoneVerified: false,
            referredBy: referredBy || null,
            referralCode: referralCode,
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
            isPhoneUser: false,
            isOnline: false,
            profilePic: null,
            registrationIP: 'unknown',
            userAgent: 'backend',
            createdAt: Date.now(),
            lastLogin: Date.now(),
            lastActive: Date.now(),
            kycStatus: 'none',
            subscriptionMultiplier: 1,
            subscriptionExpiry: 0
        };
        
        await db.ref(`users/${uid}`).set(userData);
        console.log(`[GOOGLE] ✅ User saved: ${uid}`);
        
        if (referredBy) {
            await processReferral(referredBy, fullName, db);
        }
        
        return {
            success: true,
            uid: uid,
            referralCode: referralCode,
            message: 'Account created successfully'
        };
        
    } catch (error) {
        console.error('[GOOGLE] ❌ Error:', error);
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    registerWithEmail,
    saveGoogleUser,
    verifyReferralCode,
    generateUniqueReferralCode
};