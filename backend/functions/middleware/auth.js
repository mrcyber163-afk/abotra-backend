// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

const { verifyIdToken } = require('../firebase');

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
        const user = await verifyIdToken(token);
        req.user = user;
        next();
    } catch (error) {
        console.error('[Auth] Token verification error:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }
}

module.exports = { verifyToken };