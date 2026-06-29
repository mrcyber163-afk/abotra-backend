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

router.get('/my-orders', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const orders = [];
        const p2pOrders = await restGet('p2p_orders');
        if (p2pOrders) {
            Object.keys(p2pOrders).forEach(key => {
                const order = p2pOrders[key];
                if (order.buyerId === userId || order.merchantUserId === userId) {
                    orders.push({ id: key, ...order, userRole: order.buyerId === userId ? 'buyer' : 'merchant' });
                }
            });
        }
        orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        res.json({ success: true, orders: orders.slice(0, 100) });
    } catch (error) {
        console.error('[ORDERS] Get my orders error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/:orderId', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.user.uid;
        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        res.json({ success: true, order: { id: orderId, ...orderData } });
    } catch (error) {
        console.error('[ORDERS] Get order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.put('/:orderId/status', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, transactionId, notes } = req.body;
        const userId = req.user.uid;
        const validStatuses = ['pending', 'paid', 'confirmed', 'completed', 'cancelled', 'disputed'];
        if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        if (orderData.status === 'completed' || orderData.status === 'cancelled') {
            return res.status(400).json({ success: false, error: 'Order is already final' });
        }

        const updates = { status, updatedAt: Date.now() };
        if (transactionId) updates.transactionId = transactionId;
        if (notes) updates.notes = notes;
        if (status === 'paid') updates.paidAt = Date.now();
        if (status === 'confirmed') updates.confirmedAt = Date.now();
        if (status === 'completed') updates.completedAt = Date.now();

        await restPatch(`p2p_orders/${orderId}`, updates);
        await restPatch(`merchant_orders/${orderData.merchantUserId}/${orderId}`, { status, updatedAt: Date.now() });
        await restPatch(`user_orders/${orderData.buyerId}/${orderId}`, { status, updatedAt: Date.now() });

        const notifyUserId = orderData.buyerId === userId ? orderData.merchantUserId : orderData.buyerId;
        await restPost(`notifications/${notifyUserId}`, {
            title: 'Order Update', message: `Order ${orderId} status updated to: ${status}`,
            type: 'info', read: false, timestamp: Date.now()
        });

        res.json({ success: true, orderId, status });
    } catch (error) {
        console.error('[ORDERS] Update order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/:orderId/cancel', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.user.uid;

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });
        if (orderData.buyerId !== userId && orderData.merchantUserId !== userId) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
        if (orderData.status !== 'pending' && orderData.status !== 'paid') {
            return res.status(400).json({ success: false, error: `Order cannot be cancelled in ${orderData.status} status` });
        }

        await restPatch(`p2p_orders/${orderId}`, {
            status: 'cancelled', cancelledAt: Date.now(), cancelledBy: userId,
            cancelReason: reason || 'Cancelled by user', updatedAt: Date.now()
        });

        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        console.error('[ORDERS] Cancel order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
