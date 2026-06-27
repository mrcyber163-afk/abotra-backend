// functions/routes/chat.js
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
// 1. GET CHAT MESSAGES
// ============================================================
router.get('/:orderId/messages', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this order
        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        const messages = [];
        const messagesSnap = await db.ref(`p2p_chat/${orderId}`)
            .orderByChild('timestamp')
            .once('value');

        if (messagesSnap.exists()) {
            messagesSnap.forEach(child => {
                messages.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        // Mark messages as read
        await db.ref(`p2p_chat/${orderId}`)
            .orderByChild('read')
            .equalTo(false)
            .once('value', async (snap) => {
                if (snap.exists()) {
                    const updates = {};
                    snap.forEach(child => {
                        const msg = child.val();
                        if (msg.senderId !== userId) {
                            updates[`${child.key}/read`] = true;
                            updates[`${child.key}/readAt`] = Date.now();
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        await db.ref(`p2p_chat/${orderId}`).update(updates);
                    }
                }
            });

        res.json({
            success: true,
            messages: messages
        });

    } catch (error) {
        console.error('[CHAT] Get messages error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. SEND MESSAGE
// ============================================================
router.post('/:orderId/messages', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const { message, type = 'text' } = req.body;
        const userId = req.user.uid;

        if (!message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Message is required' 
            });
        }

        // Verify user is part of this order
        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Get sender info
        const userSnap = await db.ref(`users/${userId}`).once('value');
        const user = userSnap.val() || {};
        const senderName = user.name || user.fullName || 'User';

        const messageData = {
            senderId: userId,
            senderName: senderName,
            message: message,
            type: type,
            read: false,
            timestamp: Date.now()
        };

        const newRef = await db.ref(`p2p_chat/${orderId}`).push(messageData);

        // Update last message in order
        await db.ref(`p2p_orders/${orderId}`).update({
            lastMessage: message,
            lastMessageAt: Date.now(),
            lastMessageBy: userId
        });

        // Send notification to other user
        const notifyUserId = order.buyerId === userId ? order.merchantUserId : order.buyerId;
        await sendNotification(notifyUserId, 'New Message', 
            `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

        res.json({
            success: true,
            messageId: newRef.key,
            message: { id: newRef.key, ...messageData }
        });

    } catch (error) {
        console.error('[CHAT] Send message error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. GET UNREAD COUNT
// ============================================================
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        let totalUnread = 0;
        const orderIds = [];

        // Get all orders where user is buyer
        const buyerOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('buyerId')
            .equalTo(userId)
            .once('value');

        if (buyerOrdersSnap.exists()) {
            buyerOrdersSnap.forEach(child => {
                orderIds.push(child.key);
            });
        }

        // Get all orders where user is merchant
        const merchantOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('merchantUserId')
            .equalTo(userId)
            .once('value');

        if (merchantOrdersSnap.exists()) {
            merchantOrdersSnap.forEach(child => {
                if (!orderIds.includes(child.key)) {
                    orderIds.push(child.key);
                }
            });
        }

        // Count unread messages
        for (const orderId of orderIds) {
            const messagesSnap = await db.ref(`p2p_chat/${orderId}`)
                .orderByChild('read')
                .equalTo(false)
                .once('value');

            if (messagesSnap.exists()) {
                messagesSnap.forEach(child => {
                    const msg = child.val();
                    if (msg.senderId !== userId) {
                        totalUnread++;
                    }
                });
            }
        }

        res.json({
            success: true,
            unreadCount: totalUnread
        });

    } catch (error) {
        console.error('[CHAT] Get unread count error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. MARK ALL AS READ
// ============================================================
router.post('/:orderId/read', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const userId = req.user.uid;

        // Verify user is part of this order
        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Mark all messages as read
        const messagesSnap = await db.ref(`p2p_chat/${orderId}`)
            .orderByChild('read')
            .equalTo(false)
            .once('value');

        if (messagesSnap.exists()) {
            const updates = {};
            messagesSnap.forEach(child => {
                const msg = child.val();
                if (msg.senderId !== userId) {
                    updates[`${child.key}/read`] = true;
                    updates[`${child.key}/readAt`] = Date.now();
                }
            });
            if (Object.keys(updates).length > 0) {
                await db.ref(`p2p_chat/${orderId}`).update(updates);
            }
        }

        res.json({
            success: true,
            message: 'All messages marked as read'
        });

    } catch (error) {
        console.error('[CHAT] Mark as read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. UPLOAD IMAGE
// ============================================================
router.post('/:orderId/images', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const { imageData, message = 'Payment Proof' } = req.body;
        const userId = req.user.uid;

        if (!imageData) {
            return res.status(400).json({ 
                success: false, 
                error: 'Image data is required' 
            });
        }

        // Verify user is part of this order
        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Get sender info
        const userSnap = await db.ref(`users/${userId}`).once('value');
        const user = userSnap.val() || {};
        const senderName = user.name || user.fullName || 'User';

        const messageData = {
            senderId: userId,
            senderName: senderName,
            message: message,
            imageData: imageData,
            isImage: true,
            read: false,
            timestamp: Date.now()
        };

        const newRef = await db.ref(`p2p_chat/${orderId}`).push(messageData);

        res.json({
            success: true,
            messageId: newRef.key,
            message: { id: newRef.key, ...messageData }
        });

    } catch (error) {
        console.error('[CHAT] Upload image error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function sendNotification(userId, title, message) {
    try {
        const db = getDB();
        const notificationRef = db.ref(`notifications/${userId}`).push();
        await notificationRef.set({
            title: title,
            message: message,
            type: 'p2p_chat',
            read: false,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[CHAT] Send notification error:', error);
    }
}

// ============================================================
// EXPORT
// ============================================================
module.exports = router;