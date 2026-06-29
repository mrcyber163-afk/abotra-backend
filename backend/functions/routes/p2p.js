// functions/routes/p2p.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../firebase');
const { runTransaction, generateId } = require('../helpers');

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
// MIDDLEWARE: Check if user is merchant
// ============================================================
async function checkMerchant(req, res, next) {
    try {
        const db = getDB();
        const userSnap = await db.ref(`users/${req.user.uid}`).once('value');
        if (!userSnap.exists() || userSnap.val().isMerchant !== true) {
            return res.status(403).json({ success: false, error: 'Merchant access required' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error verifying merchant status' });
    }
}

// ============================================================
// 1. GET ALL OFFERS
// ============================================================
router.get('/offers', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { type, country, status = 'active' } = req.query;
        const userCountry = country || 'Tanzania';
        const offers = [];

        // Get admin merchants (they are sellers - type: 'sell')
        const merchantsSnap = await db.ref('merchants')
            .orderByChild('status')
            .equalTo('active')
            .once('value');
            
        if (merchantsSnap.exists()) {
            merchantsSnap.forEach(child => {
                const merchant = child.val();
                if (merchant.country && merchant.country !== userCountry) return;
                offers.push({
                    id: child.key,
                    ...merchant,
                    type: 'sell', // Admin merchants sell USDT
                    isAdminOffer: true,
                    isOnline: merchant.isOnline || false
                });
            });
        }

        // Get merchant created offers
        const offersSnap = await db.ref('p2p_offers')
            .orderByChild('status')
            .equalTo('active')
            .once('value');
            
        if (offersSnap.exists()) {
            offersSnap.forEach(child => {
                const offer = child.val();
                if (offer.country && offer.country !== userCountry) return;
                offers.push({
                    id: child.key,
                    ...offer,
                    isAdminOffer: false
                });
            });
        }

        // Filter by type if provided
        let filtered = offers;
        if (type && type !== 'all') {
            filtered = filtered.filter(o => o.type === type);
        }

        // Sort by createdAt descending
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Get online status for each merchant
        for (let offer of filtered) {
            if (offer.userId) {
                const userSnap = await db.ref(`users/${offer.userId}/isOnline`).once('value');
                offer.isOnline = userSnap.val() || false;
            }
        }

        res.json({
            success: true,
            offers: filtered,
            total: filtered.length
        });

    } catch (error) {
        console.error('[P2P] Get offers error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 2. GET OFFER BY ID
// ============================================================
router.get('/offers/:offerId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { offerId } = req.params;
        
        // Check in p2p_offers
        let offerSnap = await db.ref(`p2p_offers/${offerId}`).once('value');
        let offer = offerSnap.val();
        let isAdminOffer = false;

        if (!offerSnap.exists()) {
            // Check in merchants
            const merchantSnap = await db.ref(`merchants/${offerId}`).once('value');
            if (!merchantSnap.exists()) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Offer not found' 
                });
            }
            offer = merchantSnap.val();
            isAdminOffer = true;
        }

        // Get user online status
        if (offer.userId) {
            const userSnap = await db.ref(`users/${offer.userId}/isOnline`).once('value');
            offer.isOnline = userSnap.val() || false;
        }

        res.json({
            success: true,
            offer: {
                id: offerId,
                ...offer,
                isAdminOffer
            }
        });

    } catch (error) {
        console.error('[P2P] Get offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 3. CREATE OFFER (MERCHANT ONLY)
// ============================================================
router.post('/offers', verifyToken, checkMerchant, async (req, res) => {
    try {
        const db = getDB();
        const { 
            type,           // 'buy' or 'sell'
            price,          // Price per USDT
            minLimit,       // Minimum limit
            maxLimit,       // Maximum limit
            paymentMethod,  // Payment method
            phone,          // Phone number
            merchantName    // Display name
        } = req.body;
        
        const userId = req.user.uid;
        const userEmail = req.user.email;

        // Validate
        if (!type || !price || !paymentMethod) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        if (type !== 'buy' && type !== 'sell') {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid offer type' 
            });
        }

        if (price <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Price must be greater than 0' 
            });
        }

        if (minLimit && maxLimit && minLimit > maxLimit) {
            return res.status(400).json({ 
                success: false, 
                error: 'Min limit cannot exceed max limit' 
            });
        }

        // Get user data
        const userSnap = await db.ref(`users/${userId}`).once('value');
        const userData = userSnap.exists() ? userSnap.val() : {};
        const userBalance = userData.balance || 0;

        // Check if user has enough balance
        if (type === 'sell' && userBalance < (minLimit || 10)) {
            return res.status(400).json({ 
                success: false, 
                error: `Insufficient balance. Need at least ${minLimit || 10} USDT` 
            });
        }

        const userCountry = userData.country || 'Tanzania';
        const displayName = merchantName || userData.name || userData.fullName || userData.username || userEmail.split('@')[0];

        const offerData = {
            type: type,
            price: price,
            balance: userBalance,
            minLimit: minLimit || 10,
            maxLimit: maxLimit || 1000,
            paymentMethod: paymentMethod,
            phone: phone || userData.phone || '',
            country: userCountry,
            userId: userId,
            merchantName: displayName,
            name: displayName,
            email: userEmail,
            createdAt: Date.now(),
            status: 'active',
            isAdminOffer: false,
            orders: 0,
            isOnline: true
        };

        const newRef = await db.ref('p2p_offers').push(offerData);
        const offerId = newRef.key;

        // Add to user's offers
        await db.ref(`user_offers/${userId}/${offerId}`).set({
            offerId: offerId,
            type: type,
            status: 'active',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            offerId: offerId,
            offer: { id: offerId, ...offerData }
        });

    } catch (error) {
        console.error('[P2P] Create offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 4. UPDATE OFFER (MERCHANT ONLY)
// ============================================================
router.put('/offers/:offerId', verifyToken, checkMerchant, async (req, res) => {
    try {
        const db = getDB();
        const { offerId } = req.params;
        const { price, minLimit, maxLimit, paymentMethod, phone, merchantName } = req.body;
        const userId = req.user.uid;

        const offerSnap = await db.ref(`p2p_offers/${offerId}`).once('value');
        if (!offerSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Offer not found' 
            });
        }

        const offer = offerSnap.val();
        if (offer.userId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'You can only update your own offers' 
            });
        }

        const updates = {};
        if (price) updates.price = price;
        if (minLimit) updates.minLimit = minLimit;
        if (maxLimit) updates.maxLimit = maxLimit;
        if (paymentMethod) updates.paymentMethod = paymentMethod;
        if (phone) updates.phone = phone;
        if (merchantName) updates.merchantName = merchantName;
        updates.updatedAt = Date.now();

        await db.ref(`p2p_offers/${offerId}`).update(updates);

        res.json({
            success: true,
            message: 'Offer updated successfully',
            updates: updates
        });

    } catch (error) {
        console.error('[P2P] Update offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 5. DELETE OFFER (MERCHANT ONLY)
// ============================================================
router.delete('/offers/:offerId', verifyToken, checkMerchant, async (req, res) => {
    try {
        const db = getDB();
        const { offerId } = req.params;
        const userId = req.user.uid;

        const offerSnap = await db.ref(`p2p_offers/${offerId}`).once('value');
        if (!offerSnap.exists()) {
            return res.status(404).json({ 
                success: false, 
                error: 'Offer not found' 
            });
        }

        const offer = offerSnap.val();
        if (offer.userId !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'You can only delete your own offers' 
            });
        }

        await db.ref(`p2p_offers/${offerId}`).update({ 
            status: 'closed', 
            closedAt: Date.now() 
        });

        // Update user_offers
        await db.ref(`user_offers/${userId}/${offerId}`).update({
            status: 'closed',
            closedAt: Date.now()
        });

        res.json({
            success: true,
            message: 'Offer deleted successfully'
        });

    } catch (error) {
        console.error('[P2P] Delete offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 6. GET MERCHANT OFFERS
// ============================================================
router.get('/merchant/:merchantId/offers', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { merchantId } = req.params;
        const offers = [];

        // Get from p2p_offers
        const offersSnap = await db.ref('p2p_offers')
            .orderByChild('userId')
            .equalTo(merchantId)
            .once('value');

        if (offersSnap.exists()) {
            offersSnap.forEach(child => {
                const offer = child.val();
                if (offer.status !== 'closed') {
                    offers.push({
                        id: child.key,
                        ...offer
                    });
                }
            });
        }

        // Check if merchant is admin merchant
        const merchantSnap = await db.ref('merchants')
            .orderByChild('userId')
            .equalTo(merchantId)
            .once('value');

        if (merchantSnap.exists()) {
            merchantSnap.forEach(child => {
                const merchant = child.val();
                if (merchant.status !== 'inactive') {
                    offers.push({
                        id: child.key,
                        ...merchant,
                        isAdminOffer: true,
                        type: 'sell'
                    });
                }
            });
        }

        offers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            offers: offers
        });

    } catch (error) {
        console.error('[P2P] Get merchant offers error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 7. GET USER'S OWN OFFERS
// ============================================================
router.get('/my-offers', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const offers = [];

        const offersSnap = await db.ref('p2p_offers')
            .orderByChild('userId')
            .equalTo(userId)
            .once('value');

        if (offersSnap.exists()) {
            offersSnap.forEach(child => {
                offers.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        offers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            offers: offers
        });

    } catch (error) {
        console.error('[P2P] Get my offers error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 8. CREATE TRADE ORDER
// ============================================================
router.post('/orders', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { 
            merchantId, 
            amount, 
            type,           // 'buy' or 'sell'
            paymentMethod 
        } = req.body;
        
        const buyerId = req.user.uid;
        const buyerEmail = req.user.email;

        if (!merchantId || !amount || !type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        if (type !== 'buy' && type !== 'sell') {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid order type' 
            });
        }

        // Get merchant data
        let merchant = null;
        let merchantSource = null;

        // Check in p2p_offers
        let offerSnap = await db.ref(`p2p_offers/${merchantId}`).once('value');
        if (offerSnap.exists()) {
            merchant = offerSnap.val();
            merchantSource = 'p2p_offers';
        } else {
            // Check in merchants (admin)
            let merchantSnap = await db.ref(`merchants/${merchantId}`).once('value');
            if (merchantSnap.exists()) {
                merchant = merchantSnap.val();
                merchantSource = 'merchants';
            }
        }

        if (!merchant) {
            return res.status(404).json({ 
                success: false, 
                error: 'Merchant not found' 
            });
        }

        const merchantUserId = merchant.userId;

        // Get buyer data
        const buyerSnap = await db.ref(`users/${buyerId}`).once('value');
        const buyer = buyerSnap.val();
        
        if (!buyer) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }

        // Validate amount
        const minLimit = merchant.minLimit || 10;
        const maxLimit = merchant.maxLimit || 1000;
        
        if (amount < minLimit || amount > maxLimit) {
            return res.status(400).json({ 
                success: false, 
                error: `Amount must be between ${minLimit} and ${maxLimit} USDT` 
            });
        }

        // Check balances
        const merchantUserSnap = await db.ref(`users/${merchantUserId}`).once('value');
        const merchantBalance = merchantUserSnap.exists() ? merchantUserSnap.val().balance || 0 : 0;
        const buyerBalance = buyer.balance || 0;

        if (type === 'buy') {
            // User buys USDT from merchant - check merchant balance
            if (amount > merchantBalance) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Merchant only has ${merchantBalance} USDT available` 
                });
            }
        } else {
            // User sells USDT to merchant - check buyer balance
            if (amount > buyerBalance) {
                return res.status(400).json({ 
                    success: false, 
                    error: `You only have ${buyerBalance} USDT available` 
                });
            }
        }

        // Get exchange rate
        const rate = merchant.rate || merchant.price || 2800;
        const currency = merchant.country === 'Tanzania' ? 'TZS' : 
                        merchant.country === 'Malawi' ? 'MWK' : 'ZMW';
        const totalLocal = amount * rate;

        // Payment details
        let paymentDetails = merchant.paymentDetails || '';
        let bankName = merchant.bankName || '';
        let accountNumber = merchant.accountNumber || '';
        let accountName = merchant.accountName || '';

        // If merchant is from p2p_offers, payment method might be in different fields
        if (merchantSource === 'p2p_offers') {
            paymentDetails = merchant.paymentMethod || merchant.paymentDetails || '';
            bankName = merchant.bankName || '';
            accountNumber = merchant.accountNumber || '';
            accountName = merchant.accountName || '';
        }

        // Create order
        const orderRef = db.ref('p2p_orders').push();
        const orderId = orderRef.key;

        const merchantDisplayName = merchant.merchantName || merchant.name || 'Merchant';
        const buyerDisplayName = buyer.name || buyer.fullName || buyerEmail.split('@')[0] || 'User';

        const orderData = {
            orderId: orderId,
            merchantId: merchantId,
            merchantUserId: merchantUserId,
            merchantName: merchantDisplayName,
            merchantPhone: merchant.phone || '',
            merchantPaymentDetails: paymentDetails,
            merchantBankName: bankName,
            merchantAccountNumber: accountNumber,
            merchantAccountName: accountName,
            merchantRate: rate,
            buyerId: buyerId,
            buyerName: buyerDisplayName,
            buyerEmail: buyerEmail,
            buyerPhone: buyer.phone || '',
            amount: amount,
            rate: rate,
            currency: currency,
            totalLocal: totalLocal,
            type: type,
            status: 'pending',
            paymentMethod: paymentMethod || merchant.paymentMethod || 'Bank Transfer',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await orderRef.set(orderData);

        // Add to merchant's orders
        await db.ref(`merchant_orders/${merchantUserId}/${orderId}`).set({
            orderId: orderId,
            buyerId: buyerId,
            amount: amount,
            type: type,
            status: 'pending',
            createdAt: Date.now()
        });

        // Add to buyer's orders
        await db.ref(`user_orders/${buyerId}/${orderId}`).set({
            orderId: orderId,
            merchantId: merchantId,
            amount: amount,
            type: type,
            status: 'pending',
            createdAt: Date.now()
        });

        // Send notification
        await addNotification(merchantUserId, 'New P2P Order', 
            `${buyerDisplayName} wants to ${type === 'buy' ? 'buy' : 'sell'} ${amount} USDT`);

        res.json({
            success: true,
            orderId: orderId,
            order: { id: orderId, ...orderData }
        });

    } catch (error) {
        console.error('[P2P] Create order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 9. GET USER ORDERS
// ============================================================
router.get('/orders/my-orders', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user.uid;
        const { status } = req.query;
        const orders = [];

        // Get orders where user is buyer
        const buyerOrdersSnap = await db.ref('user_orders')
            .orderByChild('buyerId')
            .equalTo(userId)
            .once('value');

        if (buyerOrdersSnap.exists()) {
            buyerOrdersSnap.forEach(child => {
                // Get full order details
                const orderId = child.key;
                // We need to get from p2p_orders
                // We'll handle this below
            });
        }

        // Get orders from p2p_orders where user is buyer
        const p2pOrdersSnap = await db.ref('p2p_orders')
            .orderByChild('buyerId')
            .equalTo(userId)
            .once('value');

        if (p2pOrdersSnap.exists()) {
            p2pOrdersSnap.forEach(child => {
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
        const merchantOrdersSnap = await db.ref('merchant_orders')
            .orderByChild('merchantUserId')
            .equalTo(userId)
            .once('value');

        if (merchantOrdersSnap.exists()) {
            merchantOrdersSnap.forEach(child => {
                const orderId = child.key;
                // Check if order exists in p2p_orders
                const orderExists = orders.some(o => o.id === orderId);
                if (!orderExists) {
                    const merchantOrder = child.val();
                    // Get full order details
                    db.ref(`p2p_orders/${orderId}`).once('value').then(snap => {
                        if (snap.exists()) {
                            const order = snap.val();
                            if (status && order.status !== status) return;
                            orders.push({
                                id: orderId,
                                ...order,
                                userRole: 'merchant'
                            });
                        }
                    });
                }
            });
        }

        // Wait for all promises to resolve
        await new Promise(resolve => setTimeout(resolve, 500));

        // Sort by createdAt descending
        orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        res.json({
            success: true,
            orders: orders
        });

    } catch (error) {
        console.error('[P2P] Get my orders error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 10. GET ORDER BY ID
// ============================================================
router.get('/orders/:orderId', verifyToken, async (req, res) => {
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
        console.error('[P2P] Get order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 11. UPDATE ORDER STATUS
// ============================================================
router.put('/orders/:orderId/status', verifyToken, async (req, res) => {
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
            updatedAt: Date.now()
        };

        if (transactionId) updates.transactionId = transactionId;
        if (notes) updates.notes = notes;

        if (status === 'paid') {
            updates.paidAt = Date.now();
            updates.paidBy = userId;
        }

        if (status === 'confirmed') {
            updates.confirmedAt = Date.now();
            updates.confirmedBy = userId;
        }

        if (status === 'completed') {
            updates.completedAt = Date.now();
            // Handle balance transfer
            await handleOrderCompletion(order);
            await updateMerchantStats(order.merchantUserId);
            await updateUserStats(order.buyerId);
        }

        if (status === 'cancelled') {
            updates.cancelledAt = Date.now();
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
        console.error('[P2P] Update order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 12. CANCEL ORDER
// ============================================================
router.post('/orders/:orderId/cancel', verifyToken, async (req, res) => {
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
            cancelledBy: userId,
            cancelReason: reason || 'Cancelled by user',
            updatedAt: Date.now()
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
        console.error('[P2P] Cancel order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 13. GET EXCHANGE RATES
// ============================================================
router.get('/exchange-rates', async (req, res) => {
    try {
        const db = getDB();
        const ratesSnap = await db.ref('exchangeRates').once('value');
        const rates = ratesSnap.exists() ? ratesSnap.val() : {
            'Tanzania': 2800,
            'Malawi': 5600,
            'Zambia': 30,
            'Congo DRC': 2850,
            'Burundi': 3500,
            'Kenya': 140,
            'Botswana': 13,
            'Namibia': 19,
            'Mozambique': 64,
            'Nigeria': 1500
        };

        res.json({
            success: true,
            rates: rates
        });

    } catch (error) {
        console.error('[P2P] Get exchange rates error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// 14. GET MERCHANT DETAILS (For P2P Chat)
// ============================================================
router.get('/merchant-details/:merchantId', verifyToken, async (req, res) => {
    try {
        const db = getDB();
        const { merchantId } = req.params;
        let merchantData = null;

        // Check in merchants node
        let merchantSnap = await db.ref(`merchants/${merchantId}`).once('value');
        if (merchantSnap.exists()) {
            merchantData = merchantSnap.val();
            merchantData.id = merchantId;
            merchantData.isAdminOffer = true;
        } else {
            // Check in p2p_offers
            let offerSnap = await db.ref(`p2p_offers/${merchantId}`).once('value');
            if (offerSnap.exists()) {
                merchantData = offerSnap.val();
                merchantData.id = merchantId;
                merchantData.isAdminOffer = false;
            }
        }

        if (!merchantData) {
            return res.status(404).json({ 
                success: false, 
                error: 'Merchant not found' 
            });
        }

        // Get user details
        const userId = merchantData.userId;
        if (userId) {
            const userSnap = await db.ref(`users/${userId}`).once('value');
            if (userSnap.exists()) {
                const user = userSnap.val();
                merchantData.isOnline = user.isOnline || false;
                merchantData.lastSeen = user.lastSeen;
                merchantData.balance = user.balance || 0;
                merchantData.phone = user.phone || merchantData.phone || '';
                merchantData.email = user.email || merchantData.email || '';
            }
        }

        res.json({
            success: true,
            merchant: merchantData
        });

    } catch (error) {
        console.error('[P2P] Get merchant details error:', error);
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
        console.error('[P2P] Send notification error:', error);
    }
}

async function handleOrderCompletion(order) {
    try {
        const db = getDB();
        const { buyerId, merchantUserId, amount, type } = order;

        const buyerSnap = await db.ref(`users/${buyerId}`).once('value');
        const buyer = buyerSnap.val();

        const merchantSnap = await db.ref(`users/${merchantUserId}`).once('value');
        const merchant = merchantSnap.val();

        if (!buyer || !merchant) return;

        const buyerBalance = buyer.balance || 0;
        const merchantBalance = merchant.balance || 0;

        let buyerNewBalance, merchantNewBalance;

        if (type === 'buy') {
            // User buys USDT from merchant
            buyerNewBalance = buyerBalance + amount;
            merchantNewBalance = merchantBalance - amount;
        } else {
            // User sells USDT to merchant
            buyerNewBalance = buyerBalance - amount;
            merchantNewBalance = merchantBalance + amount;
        }

        await db.ref(`users/${buyerId}/balance`).set(buyerNewBalance);
        await db.ref(`users/${merchantUserId}/balance`).set(merchantNewBalance);

        // Update offer balance if applicable
        if (order.merchantId) {
            const offerSnap = await db.ref(`p2p_offers/${order.merchantId}`).once('value');
            if (offerSnap.exists()) {
                const offer = offerSnap.val();
                const newBalance = Math.max(0, (offer.balance || 0) - amount);
                await db.ref(`p2p_offers/${order.merchantId}/balance`).set(newBalance);
            }
        }

        // Add transaction record
        const transactionRef = db.ref('transactions').push();
        await transactionRef.set({
            type: 'p2p_completion',
            orderId: order.orderId,
            buyerId: buyerId,
            merchantUserId: merchantUserId,
            amount: amount,
            buyerBalance: buyerNewBalance,
            merchantBalance: merchantNewBalance,
            timestamp: Date.now()
        });

        console.log(`[P2P] Balance transfer completed for order ${order.orderId}`);

    } catch (error) {
        console.error('[P2P] Balance transfer error:', error);
    }
}

async function updateMerchantStats(merchantUserId) {
    try {
        const db = getDB();
        const ordersSnap = await db.ref(`merchant_orders/${merchantUserId}`)
            .orderByChild('status')
            .equalTo('completed')
            .once('value');

        const completedOrders = ordersSnap.numChildren();

        await db.ref(`users/${merchantUserId}`).update({
            totalOrders: completedOrders,
            lastOrderAt: Date.now()
        });

    } catch (error) {
        console.error('[P2P] Update merchant stats error:', error);
    }
}

async function updateUserStats(userId) {
    try {
        const db = getDB();
        const ordersSnap = await db.ref(`user_orders/${userId}`)
            .orderByChild('status')
            .equalTo('completed')
            .once('value');

        const completedOrders = ordersSnap.numChildren();

        await db.ref(`users/${userId}`).update({
            totalP2POrders: completedOrders,
            lastP2POrderAt: Date.now()
        });

    } catch (error) {
        console.error('[P2P] Update user stats error:', error);
    }
}

// ============================================================
// EXPORT
// ============================================================
module.exports = router;