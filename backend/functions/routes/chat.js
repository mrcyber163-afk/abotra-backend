// ============================================================
// CHAT - REST API Version (No Admin SDK)
// ============================================================

const express = require('express');
const router = express.Router();
const { restGet, restPut, restPost, restPatch } = require('../firebase');
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

// GET CHAT MESSAGES
router.get('/:orderId/messages', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.uid;

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const messages = [];
        const messagesData = await restGet(`p2p_chat/${orderId}`);
        if (messagesData) {
            Object.keys(messagesData).forEach(key => {
                messages.push({ id: key, ...messagesData[key] });
            });
        }

        // Mark messages as read
        if (messagesData) {
            for (const [key, msg] of Object.entries(messagesData)) {
                if (msg.senderId !== userId && msg.read === false) {
                    await restPatch(`p2p_chat/${orderId}/${key}`, { read: true, readAt: Date.now() });
                }
            }
        }

        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        res.json({ success: true, messages });
    } catch (error) {
        console.error('[CHAT] Get messages error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// SEND MESSAGE
router.post('/:orderId/messages', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { message, type = 'text' } = req.body;
        const userId = req.user.uid;

        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const userData = await restGet(`users/${userId}`);
        const senderName = userData?.name || userData?.fullName || 'User';

        const messageData = {
            senderId: userId,
            senderName: senderName,
            message: message,
            type: type,
            read: false,
            timestamp: Date.now()
        };

        const newRef = await restPost(`p2p_chat/${orderId}`, messageData);

        await restPatch(`p2p_orders/${orderId}`, {
            lastMessage: message,
            lastMessageAt: Date.now(),
            lastMessageBy: userId
        });

        const notifyUserId = orderData.buyerId === userId ? orderData.merchantUserId : orderData.buyerId;
        await restPost(`notifications/${notifyUserId}`, {
            title: 'New Message',
            message: `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
            type: 'p2p_chat', read: false, timestamp: Date.now()
        });

        res.json({ success: true, messageId: newRef.name, message: { id: newRef.name, ...messageData } });
    } catch (error) {
        console.error('[CHAT] Send message error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// GET UNREAD COUNT
router.get('/unread-count', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        let totalUnread = 0;
        const orderIds = [];

        const p2pOrders = await restGet('p2p_orders');
        if (p2pOrders) {
            Object.keys(p2pOrders).forEach(key => {
                const order = p2pOrders[key];
                if (order.buyerId === userId || order.merchantUserId === userId) {
                    orderIds.push(key);
                }
            });
        }

        for (const orderId of orderIds) {
            const messagesData = await restGet(`p2p_chat/${orderId}`);
            if (messagesData) {
                Object.values(messagesData).forEach(msg => {
                    if (msg.senderId !== userId && msg.read === false) totalUnread++;
                });
            }
        }

        res.json({ success: true, unreadCount: totalUnread });
    } catch (error) {
        console.error('[CHAT] Get unread count error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// MARK ALL AS READ
router.post('/:orderId/read', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.uid;

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const messagesData = await restGet(`p2p_chat/${orderId}`);
        if (messagesData) {
            for (const [key, msg] of Object.entries(messagesData)) {
                if (msg.senderId !== userId && msg.read === false) {
                    await restPatch(`p2p_chat/${orderId}/${key}`, { read: true, readAt: Date.now() });
                }
            }
        }

        res.json({ success: true, message: 'All messages marked as read' });
    } catch (error) {
        console.error('[CHAT] Mark as read error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
