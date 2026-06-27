// ============================================================
// NETLIFY FUNCTION: Change User Password
// ============================================================
// Location: netlify/functions/change-user-password.js
// ============================================================

const { getDB, getAuth, admin } = require('../../functions/firebase');

// Initialize Firebase
let db, auth;
try {
  const firebase = require('../../functions/firebase');
  db = firebase.getDB();
  auth = firebase.getAuth();
  console.log('[FUNCTION] ✅ Firebase initialized');
} catch (error) {
  console.error('[FUNCTION] ❌ Firebase init failed:', error);
}

// ============================================================
// HELPER: Check if user is admin
// ============================================================
async function checkIsAdmin(email, uid) {
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
    console.error('[FUNCTION] Error checking admin:', error);
    return false;
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }
  
  try {
    // 1. Verify admin token
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
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, error: 'Invalid token' })
      };
    }
    
    // 2. Check if admin
    const isAdmin = await checkIsAdmin(decodedToken.email, decodedToken.uid);
    if (!isAdmin) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, error: 'Admin privileges required' })
      };
    }
    
    // 3. Parse request
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
    
    // 4. Change password - THIS IS THE CRITICAL OPERATION
    try {
      await auth.updateUser(targetUid, { password: newPassword });
      console.log(`[FUNCTION] ✅ Password changed for: ${targetUid}`);
      
      // Send notification
      try {
        const notifRef = db.ref(`notifications/${targetUid}`).push();
        await notifRef.set({
          id: notifRef.key,
          title: '🔐 Password Changed',
          message: 'Your password was changed by an administrator.',
          type: 'security',
          read: false,
          timestamp: Date.now()
        });
      } catch (notifError) {
        console.error('[FUNCTION] Notification error:', notifError);
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Password changed successfully!'
        })
      };
      
    } catch (error) {
      console.error('[FUNCTION] Password change error:', error);
      
      let errorMessage = 'Failed to change password.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'User not found.';
      } else if (error.code === 'auth/invalid-password') {
        errorMessage = 'Invalid password format. Must be at least 6 characters.';
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
    console.error('[FUNCTION] Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error'
      })
    };
  }
};