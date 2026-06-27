// functions/routes/kyc.js
const express = require('express');
const router = express.Router();
const { getDB, admin } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET KYC STATUS
// ============================================================
router.get('/status', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const kycSnap = await db.ref(`kyc/${userId}`).once('value');
        
        if (!kycSnap.exists()) {
            return res.json({
                success: true,
                status: 'not_submitted',
                level: null
            });
        }

        const kycData = kycSnap.val();
        res.json({
            success: true,
            status: kycData.status || 'pending',
            level: kycData.level || 'basic',
            submittedAt: kycData.submittedAt || null,
            documentType: kycData.documentType || null
        });

    } catch (error) {
        console.error('[KYC] Status error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. SUBMIT KYC APPLICATION
// ============================================================
router.post('/submit', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { 
            fullName, country, documentNumber, documentType, 
            dateOfBirth, level, documentFront, documentBack, selfie 
        } = req.body;

        if (!fullName || !country || !documentNumber || !documentType || !dateOfBirth) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Check if user already has pending/verified KYC
        const existingKycSnap = await db.ref(`kyc/${userId}`).once('value');
        if (existingKycSnap.exists()) {
            const existing = existingKycSnap.val();
            if (existing.status === 'verified' || existing.status === 'approved') {
                return res.status(400).json({ success: false, error: 'KYC already verified' });
            }
            if (existing.status === 'pending') {
                return res.status(400).json({ success: false, error: 'KYC already pending review' });
            }
        }

        const kycData = {
            uid: userId,
            email: req.user.email,
            fullName: fullName,
            country: country,
            documentNumber: documentNumber,
            documentType: documentType,
            dateOfBirth: dateOfBirth,
            level: level || 'basic',
            status: 'pending',
            submittedAt: Date.now(),
            date: new Date().toISOString(),
            documentFront: documentFront || '',
            documentBack: documentBack || '',
            selfie: selfie || ''
        };

        // Save KYC data
        await db.ref(`kyc/${userId}`).set(kycData);

        // Add to pending KYC queue for admin
        await db.ref(`pendingKyc/${userId}`).set({
            uid: userId,
            email: req.user.email,
            fullName: fullName,
            submittedAt: Date.now(),
            level: level || 'basic',
            documentType: documentType,
            country: country
        });

        // Update user profile
        await db.ref(`users/${userId}`).update({
            kycStatus: 'pending',
            kycLevel: level || 'basic',
            kycSubmittedAt: Date.now(),
            fullName: fullName,
            country: country
        });

        // Add notification for user
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: '📋 KYC Submitted',
            message: `Your ${level || 'basic'} KYC verification has been submitted. Admin will review within 24-48 hours.`,
            type: 'info',
            read: false,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });

        // Add admin notification
        await db.ref('adminNotifications').push({
            type: 'kyc_pending',
            userId: userId,
            userEmail: req.user.email,
            userName: fullName,
            level: level || 'basic',
            timestamp: Date.now(),
            read: false
        });

        res.json({
            success: true,
            message: 'KYC submitted successfully',
            status: 'pending'
        });

    } catch (error) {
        console.error('[KYC] Submit error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. ADMIN - GET ALL PENDING KYC
// ============================================================
router.get('/admin/pending', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const pending = [];
        const snapshot = await db.ref('pendingKyc').once('value');
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                pending.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        pending.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

        res.json({
            success: true,
            pending: pending
        });

    } catch (error) {
        console.error('[KYC] Admin pending error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. ADMIN - APPROVE KYC
// ============================================================
router.post('/admin/approve', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'Target user ID required' });
        }

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        // Get KYC data
        const kycSnap = await db.ref(`kyc/${targetUserId}`).once('value');
        if (!kycSnap.exists()) {
            return res.status(404).json({ success: false, error: 'KYC not found' });
        }

        const kycData = kycSnap.val();
        
        // Update KYC status
        await db.ref(`kyc/${targetUserId}`).update({
            status: 'verified',
            reviewedAt: Date.now(),
            reviewedBy: userId,
            reviewedByEmail: req.user.email
        });

        // Update user profile
        await db.ref(`users/${targetUserId}`).update({
            kycStatus: 'verified',
            isVerified: true,
            kycVerifiedAt: Date.now()
        });

        // Remove from pending
        await db.ref(`pendingKyc/${targetUserId}`).remove();

        // Add notification for user
        const notifRef = db.ref(`notifications/${targetUserId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: '✅ KYC Approved!',
            message: `Your KYC verification has been approved! You now have full access to all features.`,
            type: 'success',
            read: false,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'KYC approved successfully'
        });

    } catch (error) {
        console.error('[KYC] Admin approve error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. ADMIN - REJECT KYC
// ============================================================
router.post('/admin/reject', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { targetUserId, reason } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'Target user ID required' });
        }

        // Check if user is admin
        const adminSnap = await db.ref('admin').once('value');
        const adminList = adminSnap.val() || [];
        if (!adminList.includes(userId)) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        // Get KYC data
        const kycSnap = await db.ref(`kyc/${targetUserId}`).once('value');
        if (!kycSnap.exists()) {
            return res.status(404).json({ success: false, error: 'KYC not found' });
        }

        // Update KYC status
        await db.ref(`kyc/${targetUserId}`).update({
            status: 'rejected',
            rejectedReason: reason || 'No reason provided',
            reviewedAt: Date.now(),
            reviewedBy: userId,
            reviewedByEmail: req.user.email
        });

        // Update user profile
        await db.ref(`users/${targetUserId}`).update({
            kycStatus: 'rejected',
            isVerified: false
        });

        // Remove from pending
        await db.ref(`pendingKyc/${targetUserId}`).remove();

        // Add notification for user
        const notifRef = db.ref(`notifications/${targetUserId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: '❌ KYC Rejected',
            message: `Your KYC verification was rejected. Reason: ${reason || 'No reason provided'}. Please resubmit with correct documents.`,
            type: 'error',
            read: false,
            timestamp: Date.now(),
            date: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'KYC rejected successfully'
        });

    } catch (error) {
        console.error('[KYC] Admin reject error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET KYC DATA (For user to view their submission)
// ============================================================
router.get('/my-data', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const kycSnap = await db.ref(`kyc/${userId}`).once('value');
        
        if (!kycSnap.exists()) {
            return res.json({
                success: true,
                data: null,
                message: 'No KYC submission found'
            });
        }

        const kycData = kycSnap.val();
        
        // Remove sensitive image data before sending
        const sanitized = {
            fullName: kycData.fullName,
            country: kycData.country,
            documentNumber: kycData.documentNumber,
            documentType: kycData.documentType,
            dateOfBirth: kycData.dateOfBirth,
            level: kycData.level,
            status: kycData.status,
            submittedAt: kycData.submittedAt,
            reviewedAt: kycData.reviewedAt || null,
            rejectedReason: kycData.rejectedReason || null
        };

        res.json({
            success: true,
            data: sanitized
        });

    } catch (error) {
        console.error('[KYC] My data error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;