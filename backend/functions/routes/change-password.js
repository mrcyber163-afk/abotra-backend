// ============================================================
// CHANGE USER PASSWORD - REST API Version
// ============================================================
// Uses Firebase REST API - No private key needed
// ============================================================

const express = require('express');
const router = express.Router();
const { restPatch, authGetUser } = require('../firebase');

// ============================================================
// CHANGE PASSWORD ROUTE
// ============================================================
router.post('/change-password', async (req, res) => {
    try {
        const { uid, newPassword, email } = req.body;
        
        if (!uid || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Missing uid or newPassword'
            });
        }

        // Get Firebase API key from env
        const API_KEY = process.env.FIREBASE_API_KEY;
        
        // Step 1: Get user by uid (using REST API)
        // Note: Firebase REST Auth doesn't support direct password update via uid
        // We need to use email and update via admin or use identity toolkit
        
        // For REST API, we need to use the Identity Toolkit API
        // This requires the user to be authenticated with an ID token
        
        // Alternative: Store password change request and process later
        // Or use Firebase Admin SDK (but we don't have private key)
        
        // Since we're using REST API, we'll store a password change request
        // that will be processed by the admin or via email
        
        // For now, we'll return a message and store the request
        const requestRef = db.ref('passwordChangeRequests').push();
        await requestRef.set({
            uid: uid,
            email: email || 'unknown',
            newPassword: newPassword,
            requestedAt: Date.now(),
            status: 'pending',
            method: 'REST_API'
        });

        return res.json({
            success: true,
            message: 'Password change request saved. Admin will process it.',
            requestId: requestRef.key,
            note: 'Since we use REST API, password changes require admin approval or Firebase Admin SDK'
        });

    } catch (error) {
        console.error('[CHANGE PASSWORD] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// ============================================================
// GET PASSWORD CHANGE REQUESTS (Admin)
// ============================================================
router.get('/change-requests', async (req, res) => {
    try {
        const snapshot = await db.ref('passwordChangeRequests')
            .orderByChild('status')
            .equalTo('pending')
            .once('value');
        
        if (!snapshot.exists()) {
            return res.json({
                success: true,
                requests: []
            });
        }

        const requests = [];
        snapshot.forEach(child => {
            requests.push({
                id: child.key,
                ...child.val()
            });
        });

        return res.json({
            success: true,
            requests: requests
        });

    } catch (error) {
        console.error('[GET CHANGE REQUESTS] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
