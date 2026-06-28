// functions/auth/register.js
const { getDB, getAuth } = require('../firebase');

async function generateUniqueReferralCode() {
    const db = getDB();
    function generateCode() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ABOTRA${timestamp.slice(-4)}${random}`;
    }
    
    let code = generateCode();
    let attempts = 0;
    while (attempts < 50) {
        const snapshot = await db.ref('users').orderByChild('referralCode').equalTo(code).once('value');
        if (!snapshot.exists()) return code;
        code = generateCode();
        attempts++;
    }
    return `ABOTRA${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

async function verifyReferralCode(refCode) {
    if (!refCode) return null;
    try {
        const db = getDB();
        const upperRefCode = refCode.toUpperCase();
        const snapshot = await db.ref('users').orderByChild('referralCode').equalTo(upperRefCode).once('value');
        if (snapshot.exists()) {
            for (const [userId, userData] of Object.entries(snapshot.val())) {
                if (userData.referralCode && userData.referralCode.toUpperCase() === upperRefCode) {
                    return userId;
                }
            }
        }
        return null;
    } catch (error) {
        console.error('[REFERRAL] Error:', error);
        return null;
    }
}

async function registerWithEmail(email, password, fullName, username, country, referredBy) {
    const auth = getAuth();
    const db = getDB();
    
    try {
        const userRecord = await auth.createUser({
            email: email,
            password: password,
            displayName: fullName,
            emailVerified: false
        });
        
        const referralCode = await generateUniqueReferralCode();
        
        const userData = {
            uid: userRecord.uid,
            fullName: fullName,
            username: username || email.split('@')[0],
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
        
        if (referredBy) {
            try {
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
                }
            } catch (error) {
                console.error('[REFERRAL] Processing error:', error);
            }
        }
        
        return {
            success: true,
            uid: userRecord.uid,
            email: userRecord.email,
            referralCode: referralCode,
            message: 'Account created successfully'
        };
    } catch (error) {
        console.error('[REGISTER] Error:', error);
        throw error;
    }
}

async function saveGoogleUser(uid, email, fullName, username, referredBy) {
    const db = getDB();
    try {
        const userSnap = await db.ref(`users/${uid}`).once('value');
        if (userSnap.exists()) {
            await db.ref(`users/${uid}`).update({ lastLogin: Date.now(), lastActive: Date.now() });
            return { success: true, uid: uid, referralCode: userSnap.val().referralCode, message: 'User updated' };
        }
        
        const referralCode = await generateUniqueReferralCode();
        const userData = {
            uid: uid,
            fullName: fullName || email.split('@')[0],
            username: username || email.split('@')[0] + Math.floor(Math.random() * 1000),
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
        
        if (referredBy) {
            try {
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
                }
            } catch (error) {
                console.error('[REFERRAL] Processing error:', error);
            }
        }
        
        return { success: true, uid: uid, referralCode: referralCode, message: 'Account created successfully' };
    } catch (error) {
        console.error('[GOOGLE REGISTER] Error:', error);
        throw error;
    }
}

module.exports = {
    registerWithEmail,
    saveGoogleUser,
    verifyReferralCode,
    generateUniqueReferralCode
};