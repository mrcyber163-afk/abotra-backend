// functions/notifications/notifications.js
const { getDB } = require('../firebase');

async function sendNotification(userId, notification) {
    try {
        const db = getDB();
        if (!db) {
            console.error('[NOTIFICATION] Database not initialized');
            return false;
        }

        const { title, message, type = 'info', data = {} } = notification;
        
        if (!userId || !title || !message) {
            console.error('[NOTIFICATION] Missing required fields');
            return false;
        }

        // Generate notification ID
        const timestamp = Date.now();
        const notifId = `${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
        
        // Create notification object
        const notifData = {
            id: notifId,
            title: title,
            message: message,
            type: type,
            read: false,
            timestamp: timestamp,
            date: new Date().toISOString(),
            data: data
        };

        // Save to Firebase - use push instead of direct path
        const notifRef = db.ref(`notifications/${userId}`);
        const result = await notifRef.push(notifData);
        
        console.log(`[NOTIFICATION] ✅ Sent to ${userId}: ${title}`);
        return result.key;

    } catch (error) {
        console.error('[NOTIFICATION] Error:', error.message);
        return false;
    }
}

async function getNotifications(userId, limit = 20) {
    try {
        const db = getDB();
        if (!db) return [];

        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('timestamp')
            .limitToLast(limit)
            .once('value');

        const notifications = [];
        const data = snapshot.val();
        
        if (data && typeof data === 'object') {
            for (const key of Object.keys(data)) {
                const notif = data[key];
                notifications.push({
                    id: key,
                    ...notif
                });
            }
        }

        // Sort by timestamp descending
        notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return notifications;

    } catch (error) {
        console.error('[NOTIFICATION] Get error:', error.message);
        return [];
    }
}

async function markAsRead(userId, notificationId) {
    try {
        const db = getDB();
        if (!db) return false;

        await db.ref(`notifications/${userId}/${notificationId}`).update({
            read: true,
            readAt: Date.now()
        });

        return true;
    } catch (error) {
        console.error('[NOTIFICATION] Mark read error:', error.message);
        return false;
    }
}

async function markAllAsRead(userId) {
    try {
        const db = getDB();
        if (!db) return false;

        const snapshot = await db.ref(`notifications/${userId}`)
            .orderByChild('read')
            .equalTo(false)
            .once('value');

        const updates = {};
        const data = snapshot.val();
        
        if (data && typeof data === 'object') {
            for (const key of Object.keys(data)) {
                updates[`${key}/read`] = true;
                updates[`${key}/readAt`] = Date.now();
            }
        }

        if (Object.keys(updates).length > 0) {
            await db.ref(`notifications/${userId}`).update(updates);
        }

        return true;
    } catch (error) {
        console.error('[NOTIFICATION] Mark all read error:', error.message);
        return false;
    }
}

async function deleteNotification(userId, notificationId) {
    try {
        const db = getDB();
        if (!db) return false;

        await db.ref(`notifications/${userId}/${notificationId}`).remove();
        return true;
    } catch (error) {
        console.error('[NOTIFICATION] Delete error:', error.message);
        return false;
    }
}

module.exports = {
    sendNotification,
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
};
