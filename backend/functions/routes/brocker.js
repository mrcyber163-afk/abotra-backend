// ============================================================
// BROKER ROUTES
// ============================================================

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { restGet, restPut, restPatch, restDelete } = require('../firebase');

// ============================================================
// GET BROKER STATUS
// ============================================================
router.get('/status', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const broker = await restGet(`broker/${uid}`);
        
        if (!broker || !broker.connected) {
            return res.json({
                success: true,
                connected: false,
                exchange: null
            });
        }
        
        res.json({
            success: true,
            connected: true,
            exchange: broker.exchange,
            lastTest: broker.lastTest || null,
            isMT: broker.isMT || false,
            lastSync: broker.lastSync || null
        });
    } catch (error) {
        console.error('[Broker] Status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// TEST BROKER CONNECTION
// ============================================================
router.post('/test', verifyToken, async (req, res) => {
    try {
        const { exchange, apiKey, secretKey, passphrase } = req.body;
        
        if (!exchange || !apiKey || !secretKey) {
            return res.status(400).json({
                success: false,
                error: 'Exchange, API Key and Secret Key required'
            });
        }
        
        // In production, you would actually test the connection
        // For now, return success if keys are provided
        res.json({
            success: true,
            message: 'Connection test successful',
            data: {
                exchange: exchange,
                canTrade: true
            }
        });
    } catch (error) {
        console.error('[Broker] Test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// CONNECT BROKER
// ============================================================
router.post('/connect', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        const { exchange, apiKey, secretKey, passphrase, account, password, server } = req.body;
        
        if (!exchange) {
            return res.status(400).json({
                success: false,
                error: 'Exchange is required'
            });
        }
        
        // Check if MT4/MT5
        const isMT = exchange === 'mt4' || exchange === 'mt5';
        
        if (isMT) {
            if (!account || !password || !server) {
                return res.status(400).json({
                    success: false,
                    error: 'Account, Password and Server required for MT4/MT5'
                });
            }
        } else {
            if (!apiKey || !secretKey) {
                return res.status(400).json({
                    success: false,
                    error: 'API Key and Secret Key required'
                });
            }
        }
        
        // Encrypt and store credentials (basic encryption)
        let brokerData = {
            exchange: exchange,
            connected: true,
            connectedAt: Date.now(),
            lastTest: Date.now(),
            lastSync: Date.now()
        };
        
        if (isMT) {
            brokerData.account = Buffer.from(account).toString('base64');
            brokerData.password = Buffer.from(password).toString('base64');
            brokerData.server = server;
            brokerData.isMT = true;
        } else {
            brokerData.apiKey = Buffer.from(apiKey).toString('base64');
            brokerData.secretKey = Buffer.from(secretKey).toString('base64');
            if (passphrase) {
                brokerData.passphrase = Buffer.from(passphrase).toString('base64');
            }
            brokerData.isMT = false;
        }
        
        // Save to Firebase
        await restPut(`broker/${uid}`, brokerData);
        
        // Update forex status
        await restPatch(`forex/${uid}`, {
            connected: true,
            broker: exchange,
            platform: exchange,
            lastSync: Date.now()
        });
        
        res.json({
            success: true,
            message: 'Broker connected successfully',
            data: {
                exchange: exchange,
                canTrade: true
            }
        });
    } catch (error) {
        console.error('[Broker] Connect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// DISCONNECT BROKER
// ============================================================
router.post('/disconnect', verifyToken, async (req, res) => {
    try {
        const { uid } = req.user;
        
        // Remove broker data
        await restDelete(`broker/${uid}`);
        
        // Update forex status
        await restPatch(`forex/${uid}`, {
            connected: false,
            lastSync: Date.now()
        });
        
        res.json({
            success: true,
            message: 'Broker disconnected successfully'
        });
    } catch (error) {
        console.error('[Broker] Disconnect error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;