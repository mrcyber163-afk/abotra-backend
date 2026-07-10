// backend/functions/middleware/auth.js
const admin = require('firebase-admin');

async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            ...decodedToken
        };
        
        next();
    } catch (error) {
        console.error('[Auth] Error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
}

async function verifyAdmin(req, res, next) {
    try {
        const { uid } = req.user;
        const snapshot = await admin.database()
            .ref(`admins/${uid}`)
            .once('value');
        
        if (!snapshot.exists()) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            error: 'Admin verification failed'
        });
    }
}

module.exports = { verifyToken, verifyAdmin };