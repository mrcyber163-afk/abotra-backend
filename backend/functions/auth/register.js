// ============================================================
// AUTH/REGISTER.JS - REST API Version (No Admin SDK)
// ============================================================

// ✅ FIXED: Added restPatch to imports
const { authSignUp, restGet, restPut, restPost, restPatch } = require('../firebase');

// ============================================================
// GENERATE UNIQUE REFERRAL CODE
// ============================================================
async function generateUniqueReferralCode() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ABOTRA${timestamp.slice(-4)}${random}`;
}

// ============================================================
// VERIFY REFERRAL CODE
// ============================================================
async function verifyReferralCode(refCode) {
    if (!refCode) return null;
    
    try {
        const upperRefCode = refCode.toUpperCase();
        console.log(`[REFERRAL] 🔍 Verifying code: ${upperRefCode}`);
        
        const users = await restGet('users');
        if (!users) {
            console.log(`[REFERRAL] ❌ No users found`);
            return null;
        }

        for (const [userId, userData] of Object.entries(users)) {
            if (userData.referralCode && 
                userData.referralCode.toUpperCase() === upperRefCode) {
                console.log(`[REFERRAL] ✅ Valid referral code from user: ${userId}`);
                return userId;
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
// REGISTER WITH EMAIL - REST API Version
// ============================================================
async function registerWithEmail(email, password, fullName, username, country, referredBy) {
    try {
        console.log(`[REGISTER] 📧 Creating user: ${email}`);

        // 1. Create user using Firebase REST Auth
        const authResult = await authSignUp(email, password);
        
        if (!authResult || !authResult.idToken) {
            throw new Error('Failed to create user. Email may already be in use.');
        }

        const uid = authResult.localId;
        console.log(`[REGISTER] ✅ User created: ${uid}`);

        // 2. Generate referral code
        const referralCode = await generateUniqueReferralCode();

        // 3. Save user data to database
        const userData = {
            uid: uid,
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

        // Save to Firebase Realtime Database
        await restPut(`users/${uid}`, userData);
        console.log(`[REGISTER] ✅ User data saved`);

        // 4. Process referral if exists
        if (referredBy) {
            await processReferral(referredBy, fullName);
        }

        return {
            success: true,
            uid: uid,
            email: email,
            referralCode: referralCode,
            idToken: authResult.idToken,
            refreshToken: authResult.refreshToken,
            expiresIn: authResult.expiresIn,
            message: 'Account created successfully'
        };

    } catch (error) {
        console.error('[REGISTER] ❌ Error:', error.message);
        throw error;
    }
}

// ============================================================
// PROCESS REFERRAL
// ============================================================
async function processReferral(referredBy, fullName) {
    try {
        // Get referrer data
        const referrerData = await restGet(`users/${referredBy}`);
        if (!referrerData) {
            console.log('[REFERRAL] ❌ Referrer not found');
            return;
        }

        // Update referral count - ✅ restPatch is now available
        const referralCount = (referrerData.referralCount || 0) + 1;
        await restPatch(`users/${referredBy}`, { referralCount });

        // Create notification
        const notification = {
            title: 'New Referral! 🎉',
            message: `${fullName || 'Someone'} joined using your referral link!`,
            type: 'success',
            read: false,
            timestamp: Date.now()
        };

        await restPost(`notifications/${referredBy}`, notification);
        console.log(`[REFERRAL] ✅ Processed for user: ${referredBy}`);

    } catch (error) {
        console.error('[REFERRAL] ❌ Processing error:', error.message);
    }
}

// ============================================================
// SAVE GOOGLE USER - REST API Version
// ============================================================
async function saveGoogleUser(uid, email, fullName, username, referredBy) {
    try {
        console.log(`[GOOGLE] 📧 Saving Google user: ${email} (${uid})`);

        // Check if user already exists
        const existingUser = await restGet(`users/${uid}`);
        
        if (existingUser) {
            // Update existing user
            await restPatch(`users/${uid}`, {
                lastLogin: Date.now(),
                lastActive: Date.now(),
                email: email
            });
            console.log(`[GOOGLE] ✅ User updated: ${uid}`);
            return {
                success: true,
                uid: uid,
                referralCode: existingUser.referralCode,
                message: 'User updated'
            };
        }

        // Generate referral code
        const referralCode = await generateUniqueReferralCode();
        const usernameFinal = username || email.split('@')[0] + Math.floor(Math.random() * 1000);

        // Save new user
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

        await restPut(`users/${uid}`, userData);
        console.log(`[GOOGLE] ✅ User saved: ${uid}`);

        if (referredBy) {
            await processReferral(referredBy, fullName);
        }

        return {
            success: true,
            uid: uid,
            referralCode: referralCode,
            message: 'Account created successfully'
        };

    } catch (error) {
        console.error('[GOOGLE] ❌ Error:', error.message);
        throw error;
    }
}

// ============================================================
// SAVE PHONE USER - REST API Version (NEW)
// ============================================================
async function savePhoneUser(uid, fullName, username, phone, phoneRaw, phoneCountryCode, country, referredBy) {
    try {
        console.log(`[PHONE] 📱 Saving phone user: ${phone} (${uid})`);

        // Check if user already exists
        const existingUser = await restGet(`users/${uid}`);
        
        if (existingUser) {
            await restPatch(`users/${uid}`, {
                lastLogin: Date.now(),
                lastActive: Date.now(),
                phone: phone
            });
            console.log(`[PHONE] ✅ User updated: ${uid}`);
            return {
                success: true,
                uid: uid,
                referralCode: existingUser.referralCode,
                message: 'User updated'
            };
        }

        // Generate referral code
        const referralCode = await generateUniqueReferralCode();

        // Save new user
        const userData = {
            uid: uid,
            fullName: fullName || 'User',
            username: username || phone,
            phone: phone,
            phoneRaw: phoneRaw || phone.replace(/\D/g, ''),
            phoneCountryCode: phoneCountryCode || '+255',
            country: country || 'Tanzania',
            method: 'phone',
            emailVerified: false,
            phoneVerified: true,
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
            isPhoneUser: true,
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

        await restPut(`users/${uid}`, userData);
        console.log(`[PHONE] ✅ User saved: ${uid}`);

        if (referredBy) {
            await processReferral(referredBy, fullName);
        }

        return {
            success: true,
            uid: uid,
            referralCode: referralCode,
            message: 'Phone account created successfully'
        };

    } catch (error) {
        console.error('[PHONE] ❌ Error:', error.message);
        throw error;
    }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    registerWithEmail,
    saveGoogleUser,
    savePhoneUser,
    verifyReferralCode,
    generateUniqueReferralCode
};
