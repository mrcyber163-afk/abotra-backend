// ============================================================
// NETLIFY FUNCTION: Change User Password
// ============================================================
const admin = require('firebase-admin');

let db = null;
let auth = null;

// ============================================================
// NO CREDENTIAL! JUST databaseURL
// ============================================================
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        auth = admin.auth();
        console.log('[change-user-password] ✅ Firebase initialized');
    } catch (error) {
        console.error('[change-user-password] ❌ Firebase init error:', error);
    }
} else {
    db = admin.database();
    auth = admin.auth();
}

async function checkIsAdmin(email, uid) {
    if (!db) return false;
    try {
        const snapshot = await db.ref('admins').once('value');
        if (snapshot.exists()) {
            const admins = snapshot.val();
            for (const key in admins) {
                const adminData = admins[key];
                if (adminData === true && key === uid) return true;
                if (typeof adminData === 'object' && adminData.email === email) return true;
            }
        }
        return false;
    } catch (error) {
        console.error('[change-user-password] Error:', error);
        return false;
    }
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, error: 'Method not allowed' })
        };
    }
    
    try {
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                body: JSON.stringify({ success: false, error: 'No token provided' })
            };
        }
        
        const token = authHeader.split('Bearer ')[1];
        let decodedToken;
        
        try {
            if (!auth) throw new Error('Firebase Auth not initialized');
            decodedToken = await auth.verifyIdToken(token);
        } catch (error) {
            return {
                statusCode: 401,
                body: JSON.stringify({ success: false, error: 'Invalid token' })
            };
        }
        
        const isAdmin = await checkIsAdmin(decodedToken.email, decodedToken.uid);
        if (!isAdmin) {
            return {
                statusCode: 403,
                body: JSON.stringify({ success: false, error: 'Admin privileges required' })
            };
        }
        
        const { targetUid, newPassword } = JSON.parse(event.body);
        if (!targetUid || !newPassword || newPassword.length < 8) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Valid UID and password (min 8 chars) required'
                })
            };
        }
        
        try {
            if (!auth) throw new Error('Firebase Auth not initialized');
            await auth.updateUser(targetUid, { password: newPassword });
            console.log(`[change-user-password] ✅ Password changed for: ${targetUid}`);
            
            try {
                if (db) {
                    const notifRef = db.ref(`notifications/${targetUid}`).push();
                    await notifRef.set({
                        title: '🔐 Password Changed',
                        message: 'Your password was changed by an administrator.',
                        type: 'security',
                        read: false,
                        timestamp: Date.now()
                    });
                }
            } catch (notifError) {
                console.error('[change-user-password] Notification error:', notifError);
            }
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: 'Password changed successfully!'
                })
            };
            
        } catch (error) {
            console.error('[change-user-password] Password change error:', error);
            
            let errorMessage = 'Failed to change password.';
            if (error.code === 'auth/user-not-found') {
                errorMessage = 'User not found.';
            } else if (error.code === 'auth/invalid-password') {
                errorMessage = 'Invalid password format.';
            }
            
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: errorMessage,
                    code: error.code
                })
            };
        }
        
    } catch (error) {
        console.error('[change-user-password] Handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message
            })
        };
    }
};
