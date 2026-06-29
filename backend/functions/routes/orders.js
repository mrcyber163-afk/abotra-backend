// functions/routes/orders.js
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
// 1. GET USER ORDERS
// ============================================================
router.get('/my-orders', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { status, limit = 100 } = req.query;
        const orders = [];

        // Get orders where user is buyer
        const buyerOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('buyerId')
            .equalTo(userId)
            .once('value');

        if (buyerOrdersSnap.exists()) {
            buyerOrdersSnap.forEach(child => {
                const order = child.val();
                if (status && order.status !== status) return;
                orders.push({
                    id: child.key,
                    ...order,
                    userRole: 'buyer'
                });
            });
        }

        // Get orders where user is merchant
        const merchantOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('merchantUserId')
            .equalTo(userId)
            .once('value');

        if (merchantOrdersSnap.exists()) {
            merchantOrdersSnap.forEach(child => {
                const order = child.val();
                // Check if already exists (user could be both buyer and merchant)
                const exists = orders.some(o => o.id === child.key);
                if (!exists) {
                    if (status && order.status !== status) return;
                    orders.push({
                        id: child.key,
                        ...order,
                        userRole: 'merchant'
                    });
                }
            });
        }

        // Sort by createdAt descending (newest first)
        orders.sort((a, b) => (b.createdAtMillis || b.createdAt || 0) - (a.createdAtMillis || a.createdAt || 0));

        // Apply limit
        const limitedOrders = orders.slice(0, parseInt(limit));

        // Get user details for each order
        for (let order of limitedOrders) {
            // Get buyer details if not already present
            if (order.buyerId && !order.buyerName) {
                const buyerSnap = await db.ref(`users/${order.buyerId}/name`).once('value');
                order.buyerName = buyerSnap.val() || 'User';
            }
            // Get merchant details if not already present
            if (order.merchantUserId && !order.merchantName) {
                const merchantSnap = await db.ref(`users/${order.merchantUserId}/name`).once('value');
                order.merchantName = merchantSnap.val() || 'Merchant';
            }
        }

        res.json({
            success: true,
            orders: limitedOrders,
            total: orders.length
        });

    } catch (error) {
        console.error('[ORDERS] Get my orders error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET ORDER BY ID
// ============================================================
router.get('/:orderId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const userId = req.user.uid;

        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();

        // Check authorization
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Get user details
        let buyerDetails = null;
        let merchantDetails = null;

        if (order.buyerId) {
            const buyerSnap = await db.ref(`users/${order.buyerId}`).once('value');
            if (buyerSnap.exists()) {
                const buyer = buyerSnap.val();
                buyerDetails = {
                    name: buyer.name || buyer.fullName || 'User',
                    email: buyer.email,
                    phone: buyer.phone || '',
                    isOnline: buyer.isOnline || false
                };
            }
        }

        if (order.merchantUserId) {
            const merchantSnap = await db.ref(`users/${order.merchantUserId}`).once('value');
            if (merchantSnap.exists()) {
                const merchant = merchantSnap.val();
                merchantDetails = {
                    name: merchant.name || merchant.fullName || 'Merchant',
                    email: merchant.email,
                    phone: merchant.phone || '',
                    isOnline: merchant.isOnline || false
                };
            }
        }

        res.json({
            success: true,
            order: {
                ...order,
                buyerDetails: buyerDetails,
                merchantDetails: merchantDetails
            }
        });

    } catch (error) {
        console.error('[ORDERS] Get order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. UPDATE ORDER STATUS
// ============================================================
router.put('/:orderId/status', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const { status, transactionId, notes } = req.body;
        const userId = req.user.uid;

        const validStatuses = ['pending', 'paid', 'confirmed', 'completed', 'cancelled', 'disputed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status' 
            });
        }

        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();

        // Check authorization
        const isMerchant = order.merchantUserId === userId;
        const isBuyer = order.buyerId === userId;

        if (!isMerchant && !isBuyer) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Check if order can be updated
        if (order.status === 'completed' || order.status === 'cancelled') {
            return res.status(400).json({ 
                success: false, 
                error: 'Order is already final' 
            });
        }

        const updates = {
            status: status,
            updatedAt: Date.now(),
            updatedAtMillis: Date.now()
        };

        if (transactionId) updates.transactionId = transactionId;
        if (notes) updates.notes = notes;

        if (status === 'paid') {
            updates.paidAt = Date.now();
            updates.paidAtMillis = Date.now();
            updates.paidBy = userId;
        }

        if (status === 'confirmed') {
            updates.confirmedAt = Date.now();
            updates.confirmedAtMillis = Date.now();
            updates.confirmedBy = userId;
        }

        if (status === 'completed') {
            updates.completedAt = Date.now();
            updates.completedAtMillis = Date.now();
        }

        if (status === 'cancelled') {
            updates.cancelledAt = Date.now();
            updates.cancelledAtMillis = Date.now();
            updates.cancelledBy = userId;
            updates.cancelReason = notes || 'Cancelled by user';
        }

        await db.ref(`p2p_orders/${orderId}`).update(updates);

        // Update merchant_orders
        await db.ref(`merchant_orders/${order.merchantUserId}/${orderId}`).update({
            status: status,
            updatedAt: Date.now()
        });

        // Update user_orders
        await db.ref(`user_orders/${order.buyerId}/${orderId}`).update({
            status: status,
            updatedAt: Date.now()
        });

        // Send notification
        const notifyUserId = isMerchant ? order.buyerId : order.merchantUserId;
        await addNotification(notifyUserId, 'Order Update', 
            `Order ${orderId} status updated to: ${status}`);

        res.json({
            success: true,
            orderId: orderId,
            status: status
        });

    } catch (error) {
        console.error('[ORDERS] Update order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. CANCEL ORDER
// ============================================================
router.post('/:orderId/cancel', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { orderId } = req.params;
        const { reason } = req.body;
        const userId = req.user.uid;

        const orderSnap = await db.ref(`p2p_orders/${orderId}`).once('value');
        if (!orderSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Order not found' 
            });
        }

        const order = orderSnap.val();

        // Check authorization
        if (order.buyerId !== userId && order.merchantUserId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Unauthorized' 
            });
        }

        // Check if order can be cancelled
        if (order.status !== 'pending' && order.status !== 'paid') {
            return res.status(400).json({ 
                success: false, 
                error: `Order cannot be cancelled in ${order.status} status` 
            });
        }

        const updates = {
            status: 'cancelled',
            cancelledAt: Date.now(),
            cancelledAtMillis: Date.now(),
            cancelledBy: userId,
            cancelReason: reason || 'Cancelled by user',
            updatedAt: Date.now(),
            updatedAtMillis: Date.now()
        };

        await db.ref(`p2p_orders/${orderId}`).update(updates);

        // Update merchant_orders
        await db.ref(`merchant_orders/${order.merchantUserId}/${orderId}`).update({
            status: 'cancelled',
            updatedAt: Date.now()
        });

        // Update user_orders
        await db.ref(`user_orders/${order.buyerId}/${orderId}`).update({
            status: 'cancelled',
            updatedAt: Date.now()
        });

        // Send notification
        const notifyUserId = order.buyerId === userId ? order.merchantUserId : order.buyerId;
        await addNotification(notifyUserId, 'Order Cancelled', 
            `Order ${orderId} has been cancelled`);

        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });

    } catch (error) {
        console.error('[ORDERS] Cancel order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. GET MERCHANT ORDERS (For Merchant Dashboard)
// ============================================================
router.get('/merchant/:merchantId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { merchantId } = req.params;
        const { status, limit = 100 } = req.query;
        const userId = req.user.uid;

        // Check if user is authorized (is the merchant or admin)
        if (merchantId !== userId) {
            const adminSnap = await db.ref('admin').once('value');
            const adminList = adminSnap.val() || [];
            if (!adminList.includes(userId)) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Unauthorized' 
                });
            }
        }

        const orders = [];
        const ordersSnap = await db.ref(`p2p_orders`)
            .orderByChild('merchantUserId')
            .equalTo(merchantId)
            .once('value');

        if (ordersSnap.exists()) {
            ordersSnap.forEach(child => {
                const order = child.val();
                if (status && order.status !== status) return;
                orders.push({
                    id: child.key,
                    ...order
                });
            });
        }

        // Sort by createdAt descending
        orders.sort((a, b) => (b.createdAtMillis || b.createdAt || 0) - (a.createdAtMillis || a.createdAt || 0));

        // Apply limit
        const limitedOrders = orders.slice(0, parseInt(limit));

        res.json({
            success: true,
            orders: limitedOrders,
            total: orders.length
        });

    } catch (error) {
        console.error('[ORDERS] Get merchant orders error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET ORDER STATS
// ============================================================
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;

        // Get user's orders
        const orders = [];
        
        const buyerOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('buyerId')
            .equalTo(userId)
            .once('value');

        if (buyerOrdersSnap.exists()) {
            buyerOrdersSnap.forEach(child => {
                orders.push(child.val());
            });
        }

        const merchantOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('merchantUserId')
            .equalTo(userId)
            .once('value');

        if (merchantOrdersSnap.exists()) {
            merchantOrdersSnap.forEach(child => {
                const order = child.val();
                const exists = orders.some(o => o.id === child.key);
                if (!exists) {
                    orders.push(order);
                }
            });
        }

        // Calculate stats
        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length,
            disputed: orders.filter(o => o.status === 'disputed').length,
            totalVolume: orders.reduce((sum, o) => sum + (o.amount || 0), 0)
        };

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('[ORDERS] Get stats error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function addNotification(userId, title, message, type = 'info') {
    try {
        const db = getDB();
        const notificationRef = db.ref(`notifications/${userId}`).push();
        await notificationRef.set({
            title: title,
            message: message,
            type: type,
            read: false,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[ORDERS] Send notification error:', error);
    }
}

// ============================================================
// EXPORT
// ============================================================
module.exports = router;