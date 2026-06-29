// ============================================================
// KYC ROUTES - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete } = require('../firebase');

// ============================================================
// MIDDLEWARE: Verify Firebase Token (REST API Version)
// ============================================================
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
        const { authGetUser } = require('../firebase');
        const userInfo = await authGetUser(token);
        
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        
        req.user = {
            uid: userInfo.users[0].localId,
            email: userInfo.users[0].email
        };
        next();
    } catch (error) {
        console.error('[KYC] Token verification error:', error);
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET KYC STATUS
// ============================================================
router.get('/status', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        
        const kycData = await restGet(`kyc/${userId}`);
        
        if (!kycData) {
            return res.json({
                success: true,
                status: 'not_submitted',
                level: null
            });
        }

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
        const userId = req.user.uid;
        const { 
            fullName, country, documentNumber, documentType, 
            dateOfBirth, level, documentFront, documentBack, selfie 
        } = req.body;

        if (!fullName || !country || !documentNumber || !documentType || !dateOfBirth) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Check if user already has pending/verified KYC
        const existingKyc = await restGet(`kyc/${userId}`);
        if (existingKyc) {
            if (existingKyc.status === 'verified' || existingKyc.status === 'approved') {
                return res.status(400).json({ success: false, error: 'KYC already verified' });
            }
            if (existingKyc.status === 'pending') {
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

        await restPut(`kyc/${userId}`, kycData);

        await restPut(`pendingKyc/${userId}`, {
            uid: userId,
            email: req.user.email,
            fullName: fullName,
            submittedAt: Date.now(),
            level: level || 'basic',
            documentType: documentType,
            country: country
        });

        await restPatch(`users/${userId}`, {
            kycStatus: 'pending',
            kycLevel: level || 'basic',
            kycSubmittedAt: Date.now(),
            fullName: fullName,
            country: country
        });

        await restPost(`notifications/${userId}`, {
            title: '📋 KYC Submitted',
            message: `Your ${level || 'basic'} KYC verification has been submitted. Admin will review within 24-48 hours.`,
            type: 'info',
            read: false,
            timestamp: Date.now()
        });

        await restPost(`adminNotifications`, {
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
        const userId = req.user.uid;

        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || adminList.includes && adminList.includes(userId));
        
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const pendingData = await restGet('pendingKyc');
        const pending = [];
        
        if (pendingData) {
            Object.keys(pendingData).forEach(key => {
                pending.push({
                    id: key,
                    ...pendingData[key]
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
        const userId = req.user.uid;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'Target user ID required' });
        }

        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || adminList.includes && adminList.includes(userId));
        
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const kycData = await restGet(`kyc/${targetUserId}`);
        if (!kycData) {
            return res.status(404).json({ success: false, error: 'KYC not found' });
        }

        await restPatch(`kyc/${targetUserId}`, {
            status: 'verified',
            reviewedAt: Date.now(),
            reviewedBy: userId,
            reviewedByEmail: req.user.email
        });

        await restPatch(`users/${targetUserId}`, {
            kycStatus: 'verified',
            isVerified: true,
            kycVerifiedAt: Date.now()
        });

        await restDelete(`pendingKyc/${targetUserId}`);

        await restPost(`notifications/${targetUserId}`, {
            title: '✅ KYC Approved!',
            message: 'Your KYC verification has been approved! You now have full access to all features.',
            type: 'success',
            read: false,
            timestamp: Date.now()
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
        const userId = req.user.uid;
        const { targetUserId, reason } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'Target user ID required' });
        }

        const adminList = await restGet('admin');
        const isAdmin = adminList && (adminList[userId] === true || adminList.includes && adminList.includes(userId));
        
        if (!isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const kycData = await restGet(`kyc/${targetUserId}`);
        if (!kycData) {
            return res.status(404).json({ success: false, error: 'KYC not found' });
        }

        await restPatch(`kyc/${targetUserId}`, {
            status: 'rejected',
            rejectedReason: reason || 'No reason provided',
            reviewedAt: Date.now(),
            reviewedBy: userId,
            reviewedByEmail: req.user.email
        });

        await restPatch(`users/${targetUserId}`, {
            kycStatus: 'rejected',
            isVerified: false
        });

        await restDelete(`pendingKyc/${targetUserId}`);

        await restPost(`notifications/${targetUserId}`, {
            title: '❌ KYC Rejected',
            message: `Your KYC verification was rejected. Reason: ${reason || 'No reason provided'}. Please resubmit with correct documents.`,
            type: 'error',
            read: false,
            timestamp: Date.now()
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
        const userId = req.user.uid;

        const kycData = await restGet(`kyc/${userId}`);
        
        if (!kycData) {
            return res.json({
                success: true,
                data: null,
                message: 'No KYC submission found'
            });
        }

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

module.exports = router;
