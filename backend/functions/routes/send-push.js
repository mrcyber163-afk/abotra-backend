// ============================================================
// SEND PUSH NOTIFICATION - REST API Version
// ============================================================
// Uses Firebase Cloud Messaging REST API
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');

// Firebase Cloud Messaging REST API
const FCM_URL = 'https://fcm.googleapis.com/v1/projects/abotra-proa1/messages:send';
const API_KEY = process.env.FIREBASE_API_KEY;

// ============================================================
// SEND PUSH NOTIFICATION TO SINGLE USER
// ============================================================
router.post('/send-push', async (req, res) => {
    try {
        const { userId, title, body, data = {} } = req.body;

        if (!userId || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId, title, or body'
            });
        }

        // Store notification in Firebase
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            id: notifRef.key,
            title: title,
            message: body,
            data: data,
            read: false,
            timestamp: Date.now(),
            type: 'push'
        });

        // Note: For FCM REST API, we need the FCM token
        // We'll store the notification and the client will fetch it
        
        return res.json({
            success: true,
            message: 'Notification saved',
            notificationId: notifRef.key,
            note: 'Push notification requires FCM token. Client should fetch notifications.'
        });

    } catch (error) {
        console.error('[SEND PUSH] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// SEND PUSH TO ALL USERS
// ============================================================
router.post('/send-push-all', async (req, res) => {
    try {
        const { title, body, data = {} } = req.body;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Missing title or body'
            });
        }

        // Get all users
        const usersSnap = await db.ref('users').once('value');
        
        if (!usersSnap.exists()) {
            return res.json({
                success: false,
                error: 'No users found'
            });
        }

        // Store notification for all users
        const notifications = [];
        const promises = [];

        usersSnap.forEach(user => {
            const userId = user.key;
            const notifRef = db.ref(`notifications/${userId}`).push();
            promises.push(notifRef.set({
                id: notifRef.key,
                title: title,
                message: body,
                data: data,
                read: false,
                timestamp: Date.now(),
                type: 'broadcast'
            }));
            notifications.push(notifRef.key);
        });

        await Promise.all(promises);

        return res.json({
            success: true,
            message: `Broadcast notification sent to ${notifications.length} users`,
            count: notifications.length
        });

    } catch (error) {
        console.error('[SEND PUSH ALL] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// GET USER NOTIFICATIONS
// ============================================================
router.get('/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId'
            });
        }

        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(50)
            .once('value');

        if (!snapshot.exists()) {
            return res.json({
                success: true,
                notifications: []
            });
        }

        const notifications = [];
        snapshot.forEach(child => {
            notifications.push({
                id: child.key,
                ...child.val()
            });
        });

        // Sort by timestamp descending
        notifications.sort((a, b) => b.timestamp - a.timestamp);

        return res.json({
            success: true,
            notifications: notifications
        });

    } catch (error) {
        console.error('[GET NOTIFICATIONS] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// MARK NOTIFICATION AS READ
// ============================================================
router.patch('/notifications/:userId/:notifId/read', async (req, res) => {
    try {
        const { userId, notifId } = req.params;
        
        await db.ref(`notifications/${userId}/${notifId}/read`).set(true);

        return res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('[MARK READ] Error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
