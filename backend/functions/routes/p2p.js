// ============================================================
// P2P - REST API Version (No Admin SDK)
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

async function checkMerchant(req, res, next) {
    try {
        const userData = await restGet(`users/${req.user.uid}`);
        if (!userData || userData.isMerchant !== true) {
            return res.status(403).json({ success: false, error: 'Merchant access required' });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Error verifying merchant status' });
    }
}

// GET OFFERS
router.get('/offers', verifyToken, async (req, res) => {
    try {
        const { type, country, status = 'active' } = req.query;
        const userCountry = country || 'Tanzania';
        const offers = [];

        const merchantsData = await restGet('merchants');
        if (merchantsData) {
            Object.keys(merchantsData).forEach(key => {
                const merchant = merchantsData[key];
                if (merchant.status === 'active') {
                    if (merchant.country && merchant.country !== userCountry) return;
                    offers.push({
                        id: key, ...merchant, type: 'sell',
                        isAdminOffer: true, isOnline: merchant.isOnline || false
                    });
                }
            });
        }

        const offersData = await restGet('p2p_offers');
        if (offersData) {
            Object.keys(offersData).forEach(key => {
                const offer = offersData[key];
                if (offer.status === 'active') {
                    if (offer.country && offer.country !== userCountry) return;
                    offers.push({ id: key, ...offer, isAdminOffer: false });
                }
            });
        }

        let filtered = offers;
        if (type && type !== 'all') {
            filtered = filtered.filter(o => o.type === type);
        }
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        for (let offer of filtered) {
            if (offer.userId) {
                const userData = await restGet(`users/${offer.userId}`);
                offer.isOnline = userData?.isOnline || false;
            }
        }

        res.json({ success: true, offers: filtered, total: filtered.length });
    } catch (error) {
        console.error('[P2P] Get offers error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// GET OFFER BY ID
router.get('/offers/:offerId', verifyToken, async (req, res) => {
    try {
        const { offerId } = req.params;
        let offer = null;
        let isAdminOffer = false;

        let offerData = await restGet(`p2p_offers/${offerId}`);
        if (offerData) {
            offer = offerData;
            isAdminOffer = false;
        } else {
            let merchantData = await restGet(`merchants/${offerId}`);
            if (merchantData) {
                offer = merchantData;
                isAdminOffer = true;
            }
        }

        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        if (offer.userId) {
            const userData = await restGet(`users/${offer.userId}`);
            offer.isOnline = userData?.isOnline || false;
        }

        res.json({ success: true, offer: { id: offerId, ...offer, isAdminOffer } });
    } catch (error) {
        console.error('[P2P] Get offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// CREATE OFFER (MERCHANT ONLY)
router.post('/offers', verifyToken, checkMerchant, async (req, res) => {
    try {
        const { type, price, minLimit, maxLimit, paymentMethod, phone, merchantName } = req.body;
        const userId = req.user.uid;
        const userEmail = req.user.email;

        if (!type || !price || !paymentMethod) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        if (type !== 'buy' && type !== 'sell') {
            return res.status(400).json({ success: false, error: 'Invalid offer type' });
        }
        if (price <= 0) return res.status(400).json({ success: false, error: 'Price must be greater than 0' });

        const userData = await restGet(`users/${userId}`);
        const userBalance = userData?.balance || 0;

        if (type === 'sell' && userBalance < (minLimit || 10)) {
            return res.status(400).json({ success: false, error: `Insufficient balance. Need at least ${minLimit || 10} USDT` });
        }

        const userCountry = userData?.country || 'Tanzania';
        const displayName = merchantName || userData?.name || userData?.fullName || userData?.username || userEmail.split('@')[0];

        const offerData = {
            type, price, balance: userBalance, minLimit: minLimit || 10,
            maxLimit: maxLimit || 1000, paymentMethod, phone: phone || userData?.phone || '',
            country: userCountry, userId, merchantName: displayName, name: displayName,
            email: userEmail, createdAt: Date.now(), status: 'active',
            isAdminOffer: false, orders: 0, isOnline: true
        };

        const newRef = await restPost('p2p_offers', offerData);
        const offerId = newRef.name;

        await restPut(`user_offers/${userId}/${offerId}`, {
            offerId, type, status: 'active', createdAt: Date.now()
        });

        res.json({ success: true, offerId, offer: { id: offerId, ...offerData } });
    } catch (error) {
        console.error('[P2P] Create offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// UPDATE OFFER (MERCHANT ONLY)
router.put('/offers/:offerId', verifyToken, checkMerchant, async (req, res) => {
    try {
        const { offerId } = req.params;
        const { price, minLimit, maxLimit, paymentMethod, phone, merchantName } = req.body;
        const userId = req.user.uid;

        const offerData = await restGet(`p2p_offers/${offerId}`);
        if (!offerData) return res.status(404).json({ success: false, error: 'Offer not found' });
        if (offerData.userId !== userId) {
            return res.status(403).json({ success: false, error: 'You can only update your own offers' });
        }

        const updates = {};
        if (price) updates.price = price;
        if (minLimit) updates.minLimit = minLimit;
        if (maxLimit) updates.maxLimit = maxLimit;
        if (paymentMethod) updates.paymentMethod = paymentMethod;
        if (phone) updates.phone = phone;
        if (merchantName) updates.merchantName = merchantName;
        updates.updatedAt = Date.now();

        await restPatch(`p2p_offers/${offerId}`, updates);
        res.json({ success: true, message: 'Offer updated successfully', updates });
    } catch (error) {
        console.error('[P2P] Update offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// DELETE OFFER (MERCHANT ONLY)
router.delete('/offers/:offerId', verifyToken, checkMerchant, async (req, res) => {
    try {
        const { offerId } = req.params;
        const userId = req.user.uid;

        const offerData = await restGet(`p2p_offers/${offerId}`);
        if (!offerData) return res.status(404).json({ success: false, error: 'Offer not found' });
        if (offerData.userId !== userId) {
            return res.status(403).json({ success: false, error: 'You can only delete your own offers' });
        }

        await restPatch(`p2p_offers/${offerId}`, { status: 'closed', closedAt: Date.now() });
        await restPatch(`user_offers/${userId}/${offerId}`, { status: 'closed', closedAt: Date.now() });

        res.json({ success: true, message: 'Offer deleted successfully' });
    } catch (error) {
        console.error('[P2P] Delete offer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.get('/exchange-rates', async (req, res) => {
    try {
        const ratesData = await restGet('exchangeRates') || {
            'Tanzania': 2800, 'Malawi': 5600, 'Zambia': 30,
            'Congo DRC': 2850, 'Burundi': 3500, 'Kenya': 140,
            'Botswana': 13, 'Namibia': 19, 'Mozambique': 64, 'Nigeria': 1500
        };
        res.json({ success: true, rates: ratesData });
    } catch (error) {
        console.error('[P2P] Get exchange rates error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// CREATE ORDER
router.post('/orders', verifyToken, async (req, res) => {
    try {
        const { merchantId, amount, type, paymentMethod } = req.body;
        const buyerId = req.user.uid;
        const buyerEmail = req.user.email;

        if (!merchantId || !amount || !type) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        let merchant = null;
        let merchantSource = null;

        let offerData = await restGet(`p2p_offers/${merchantId}`);
        if (offerData) {
            merchant = offerData;
            merchantSource = 'p2p_offers';
        } else {
            let merchantData = await restGet(`merchants/${merchantId}`);
            if (merchantData) {
                merchant = merchantData;
                merchantSource = 'merchants';
            }
        }

        if (!merchant) return res.status(404).json({ success: false, error: 'Merchant not found' });

        const merchantUserId = merchant.userId;
        const buyerData = await restGet(`users/${buyerId}`);
        if (!buyerData) return res.status(404).json({ success: false, error: 'User not found' });

        const minLimit = merchant.minLimit || 10;
        const maxLimit = merchant.maxLimit || 1000;
        if (amount < minLimit || amount > maxLimit) {
            return res.status(400).json({ success: false, error: `Amount must be between ${minLimit} and ${maxLimit} USDT` });
        }

        const merchantUserData = await restGet(`users/${merchantUserId}`);
        const merchantBalance = merchantUserData?.balance || 0;
        const buyerBalance = buyerData.balance || 0;

        if (type === 'buy' && amount > merchantBalance) {
            return res.status(400).json({ success: false, error: `Merchant only has ${merchantBalance} USDT available` });
        }
        if (type === 'sell' && amount > buyerBalance) {
            return res.status(400).json({ success: false, error: `You only have ${buyerBalance} USDT available` });
        }

        const rate = merchant.rate || merchant.price || 2800;
        const currency = merchant.country === 'Tanzania' ? 'TZS' : merchant.country === 'Malawi' ? 'MWK' : 'ZMW';
        const totalLocal = amount * rate;

        const orderData = {
            orderId: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 6),
            merchantId, merchantUserId, merchantName: merchant.merchantName || merchant.name || 'Merchant',
            merchantPhone: merchant.phone || '', merchantRate: rate,
            buyerId, buyerName: buyerData.name || buyerData.fullName || 'User',
            buyerEmail, buyerPhone: buyerData.phone || '',
            amount, rate, currency, totalLocal, type,
            status: 'pending', paymentMethod: paymentMethod || merchant.paymentMethod || 'Bank Transfer',
            createdAt: Date.now(), updatedAt: Date.now()
        };

        const orderRef = await restPost('p2p_orders', orderData);
        const orderId = orderRef.name;

        await restPost(`merchant_orders/${merchantUserId}/${orderId}`, {
            orderId, buyerId, amount, type, status: 'pending', createdAt: Date.now()
        });
        await restPost(`user_orders/${buyerId}/${orderId}`, {
            orderId, merchantId, amount, type, status: 'pending', createdAt: Date.now()
        });

        await restPost(`notifications/${merchantUserId}`, {
            title: 'New P2P Order',
            message: `${buyerData.name || 'User'} wants to ${type === 'buy' ? 'buy' : 'sell'} ${amount} USDT`,
            type: 'info', read: false, timestamp: Date.now()
        });

        res.json({ success: true, orderId, order: { id: orderId, ...orderData } });
    } catch (error) {
        console.error('[P2P] Create order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// GET MY ORDERS
router.get('/orders/my-orders', verifyToken, async (req, res) => {
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
        res.json({ success: true, orders });
    } catch (error) {
        console.error('[P2P] Get my orders error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// UPDATE ORDER STATUS
router.put('/orders/:orderId/status', verifyToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, transactionId, notes } = req.body;
        const userId = req.user.uid;

        const validStatuses = ['pending', 'paid', 'confirmed', 'completed', 'cancelled', 'disputed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const orderData = await restGet(`p2p_orders/${orderId}`);
        if (!orderData) return res.status(404).json({ success: false, error: 'Order not found' });

        const isMerchant = orderData.merchantUserId === userId;
        const isBuyer = orderData.buyerId === userId;
        if (!isMerchant && !isBuyer) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        if (orderData.status === 'completed' || orderData.status === 'cancelled') {
            return res.status(400).json({ success: false, error: 'Order is already final' });
        }

        const updates = { status, updatedAt: Date.now() };
        if (transactionId) updates.transactionId = transactionId;
        if (notes) updates.notes = notes;
        if (status === 'paid') { updates.paidAt = Date.now(); updates.paidBy = userId; }
        if (status === 'confirmed') { updates.confirmedAt = Date.now(); updates.confirmedBy = userId; }
        if (status === 'completed') { updates.completedAt = Date.now(); }
        if (status === 'cancelled') {
            updates.cancelledAt = Date.now(); updates.cancelledBy = userId;
            updates.cancelReason = notes || 'Cancelled by user';
        }

        await restPatch(`p2p_orders/${orderId}`, updates);
        await restPatch(`merchant_orders/${orderData.merchantUserId}/${orderId}`, { status, updatedAt: Date.now() });
        await restPatch(`user_orders/${orderData.buyerId}/${orderId}`, { status, updatedAt: Date.now() });

        const notifyUserId = isMerchant ? orderData.buyerId : orderData.merchantUserId;
        await restPost(`notifications/${notifyUserId}`, {
            title: 'Order Update', message: `Order ${orderId} status updated to: ${status}`,
            type: 'info', read: false, timestamp: Date.now()
        });

        res.json({ success: true, orderId, status });
    } catch (error) {
        console.error('[P2P] Update order error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
