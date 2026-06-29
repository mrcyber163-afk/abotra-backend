// functions/routes/notifications.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');

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
        const { getAuth } = require('../firebase');
        const auth = getAuth();
        const decodedToken = await auth.verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// ============================================================
// 1. GET NOTIFICATIONS
// ============================================================
router.get('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { limit = 50, unreadOnly = false } = req.query;

        const notifications = [];
        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(parseInt(limit))
            .once('value');

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const notif = child.val();
                if (unreadOnly === 'true' && notif.read === true) return;
                notifications.push({
                    id: child.key,
                    ...notif
                });
            });
        }

        // Sort by newest first
        notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            notifications: notifications,
            total: notifications.length
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET UNREAD COUNT
// ============================================================
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        let unreadCount = 0;

        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('read')
            .equalTo(false)
            .once('value');

        if (snapshot.exists()) {
            unreadCount = snapshot.numChildren();
        }

        res.json({
            success: true,
            unreadCount: unreadCount
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Unread count error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. MARK NOTIFICATION AS READ
// ============================================================
router.put('/:notificationId/read', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { notificationId } = req.params;
        const userId = req.user.uid;

        const notifRef = db.ref(`notifications/${userId}/${notificationId}`);
        const snapshot = await notifRef.once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Notification not found' 
            });
        }

        await notifRef.update({
            read: true,
            readAt: Date.now()
        });

        res.json({
            success: true,
            message: 'Marked as read'
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Mark read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. MARK ALL AS READ
// ============================================================
router.put('/mark-all-read', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('read')
            .equalTo(false)
            .once('value');

        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(child => {
                updates[`${child.key}/read`] = true;
                updates[`${child.key}/readAt`] = Date.now();
            });
            await db.ref(`notifications/${userId}`).update(updates);
        }

        res.json({
            success: true,
            message: 'All notifications marked as read',
            count: snapshot.numChildren()
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Mark all read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. DELETE NOTIFICATION
// ============================================================
router.delete('/:notificationId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { notificationId } = req.params;
        const userId = req.user.uid;

        const notifRef = db.ref(`notifications/${userId}/${notificationId}`);
        const snapshot = await notifRef.once('value');
        
        if (!snapshot.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Notification not found' 
            });
        }

        await notifRef.remove();

        res.json({
            success: true,
            message: 'Notification deleted'
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Delete error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. CLEAR ALL NOTIFICATIONS
// ============================================================
router.delete('/clear-all', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        await db.ref(`notifications/${userId}`).remove();

        res.json({
            success: true,
            message: 'All notifications cleared'
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Clear all error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. CREATE NOTIFICATION (System/Admin)
// ============================================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { userId, title, message, type = 'info', link = null, actionData = null } = req.body;

        if (!userId || !title || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'userId, title, and message are required' 
            });
        }

        // Check if user exists
        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Check if requester is admin or the user themselves
        const requesterId = req.user.uid;
        if (requesterId !== userId) {
            const adminSnap = await db.ref('admin').once('value');
            const adminList = adminSnap.val() || [];
            if (!adminList.includes(requesterId)) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Unauthorized to create notification for this user' 
                });
            }
        }

        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: title,
            message: message,
            type: type,
            read: false,
            timestamp: Date.now(),
            date: new Date().toISOString(),
            link: link,
            actionData: actionData
        });

        res.json({
            success: true,
            notificationId: notifRef.key,
            message: 'Notification created successfully'
        });

    } catch (error) {
        console.error('[NOTIFICATIONS] Create error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = router;