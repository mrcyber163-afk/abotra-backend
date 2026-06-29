// ============================================================
// NOTIFICATIONS - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch, restDelete } = require('../firebase');
const { authGetUser } = require('../firebase');

async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing authorization token' });
    }
    const token = authHeader.split('Bearer ')[1];
    try {
        const userInfo = await authGetUser(token);
        if (!userInfo || !userInfo.users || userInfo.users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = { uid: userInfo.users[0].localId, email: userInfo.users[0].email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// GET NOTIFICATIONS
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { limit = 50, unreadOnly = false } = req.query;
        const notifications = [];

        const data = await restGet(`notifications/${userId}`);
        if (data) {
            Object.keys(data).forEach(key => {
                const notif = data[key];
                if (unreadOnly === 'true' && notif.read === true) return;
                notifications.push({ id: key, ...notif });
            });
        }

        notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({ success: true, notifications: notifications.slice(0, parseInt(limit)), total: notifications.length });
    } catch (error) {
        console.error('[NOTIFICATIONS] Get error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// GET UNREAD COUNT
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        let unreadCount = 0;
        const data = await restGet(`notifications/${userId}`);
        if (data) {
            Object.values(data).forEach(notif => {
                if (notif.read === false) unreadCount++;
            });
        }
        res.json({ success: true, unreadCount });
    } catch (error) {
        console.error('[NOTIFICATIONS] Unread count error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// MARK NOTIFICATION AS READ
router.put('/:notificationId/read', verifyToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.uid;

        const notifData = await restGet(`notifications/${userId}/${notificationId}`);
        if (!notifData) return res.status(404).json({ success: false, error: 'Notification not found' });

        await restPatch(`notifications/${userId}/${notificationId}`, {
            read: true,
            readAt: Date.now()
        });

        res.json({ success: true, message: 'Marked as read' });
    } catch (error) {
        console.error('[NOTIFICATIONS] Mark read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// MARK ALL AS READ
router.put('/mark-all-read', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const data = await restGet(`notifications/${userId}`);
        let count = 0;
        if (data) {
            for (const [key, notif] of Object.entries(data)) {
                if (notif.read === false) {
                    await restPatch(`notifications/${userId}/${key}`, { read: true, readAt: Date.now() });
                    count++;
                }
            }
        }
        res.json({ success: true, message: 'All notifications marked as read', count });
    } catch (error) {
        console.error('[NOTIFICATIONS] Mark all read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// DELETE NOTIFICATION
router.delete('/:notificationId', verifyToken, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.uid;

        const notifData = await restGet(`notifications/${userId}/${notificationId}`);
        if (!notifData) return res.status(404).json({ success: false, error: 'Notification not found' });

        await restDelete(`notifications/${userId}/${notificationId}`);
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('[NOTIFICATIONS] Delete error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// CLEAR ALL NOTIFICATIONS
router.delete('/clear-all', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        await restDelete(`notifications/${userId}`);
        res.json({ success: true, message: 'All notifications cleared' });
    } catch (error) {
        console.error('[NOTIFICATIONS] Clear all error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// CREATE NOTIFICATION (System/Admin)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { userId, title, message, type = 'info', link = null, actionData = null } = req.body;

        if (!userId || !title || !message) {
            return res.status(400).json({ success: false, error: 'userId, title, and message are required' });
        }

        const userData = await restGet(`users/${userId}`);
        if (!userData) return res.status(404).json({ success: false, error: 'User not found' });

        const requesterId = req.user.uid;
        if (requesterId !== userId) {
            const adminList = await restGet('admin');
            const isAdmin = adminList && (adminList[requesterId] === true || (adminList.includes && adminList.includes(requesterId)));
            if (!isAdmin) return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const notifData = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            title, message, type, read: false, timestamp: Date.now(),
            date: new Date().toISOString(), link, actionData
        };

        await restPut(`notifications/${userId}/${notifData.id}`, notifData);

        res.json({ success: true, notificationId: notifData.id, message: 'Notification created successfully' });
    } catch (error) {
        console.error('[NOTIFICATIONS] Create error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
