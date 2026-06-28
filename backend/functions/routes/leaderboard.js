const express = require('express');
const router = express.Router();
const { restGet } = require('../firebase');

router.get('/', async (req, res) => {
    try {
        const users = await restGet('users');
        
        if (!users) {
            return res.json({ success: true, leaderboard: [] });
        }

        const leaderboard = Object.keys(users)
            .map(key => ({
                uid: key,
                ...users[key]
            }))
            .filter(u => u.balance > 0)
            .sort((a, b) => (b.balance || 0) - (a.balance || 0))
            .slice(0, 100);

        return res.json({ success: true, leaderboard });

    } catch (error) {
        console.error('[LEADERBOARD] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/top', async (req, res) => {
    try {
        const users = await restGet('users');
        
        if (!users) {
            return res.json({ success: true, top: [] });
        }

        const top = Object.keys(users)
            .map(key => ({
                uid: key,
                ...users[key]
            }))
            .filter(u => u.balance > 0)
            .sort((a, b) => (b.balance || 0) - (a.balance || 0))
            .slice(0, 10);

        return res.json({ success: true, top });

    } catch (error) {
        console.error('[TOP LEADERS] Error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
