// functions/notifications/notifications.js
const { getDB } = require('../firebase');

async function sendNotification(userId, notification) {
    try {
        const db = getDB();
        const notifRef = db.ref(`notifications/${userId}`).push();
        await notifRef.set({
            title: notification.title || 'Notification',
            message: notification.message || '',
            type: notification.type || 'info',
            read: false,
            timestamp: Date.now()
        });
        console.log(`[NOTIFY] ✅ Sent to ${userId}: ${notification.title}`);
    } catch (error) {
        console.error('[NOTIFY] Error:', error);
    }
}

async function sendBroadcast(userIds, notification) {
    const results = [];
    for (const userId of userIds) {
        try {
            await sendNotification(userId, notification);
            results.push({ userId, success: true });
        } catch (error) {
            results.push({ userId, success: false, error: error.message });
        }
    }
    return results;
}

module.exports = {
    sendNotification,
    sendBroadcast
};