// ============================================================
// NETLIFY FUNCTION: Send Push to All Users
// ============================================================
// Location: netlify/functions/send-push-all.js
// ============================================================

const admin = require('firebase-admin');

// ============================================================
// SAFE FIREBASE INITIALIZATION - databaseURL ONLY!
// ============================================================
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        console.log('[send-push-all] ✅ Firebase initialized');
    } catch (error) {
        console.error('[send-push-all] ❌ Firebase init error:', error);
    }
}

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, error: 'Method not allowed.' }) };
    }
    
    try {
        const { userIds, title, message, data } = JSON.parse(event.body);
        
        const APP_ID = process.env.ONESIGNAL_APP_ID;
        const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
        const ANDROID_CHANNEL_ID = process.env.ONESIGNAL_ANDROID_CHANNEL_ID || 'default_channel';
        
        if (!APP_ID || !REST_API_KEY) {
            return { statusCode: 500, body: JSON.stringify({ success: false, error: 'OneSignal not configured.' }) };
        }
        
        // Get all users if not provided
        let recipients = userIds;
        if (!recipients || recipients.length === 0) {
            try {
                const snapshot = await admin.database().ref('users').once('value');
                recipients = [];
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        recipients.push(child.key);
                    });
                }
            } catch (dbError) {
                console.error('[send-push-all] Database error:', dbError);
                // Fallback: use provided userIds or empty array
                if (!recipients || recipients.length === 0) {
                    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'No users found and cannot fetch from database.' }) };
                }
            }
        }
        
        if (recipients.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ success: false, error: 'No users found.' }) };
        }
        
        // Send in batches
        const batchSize = 1000;
        let successCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);
            
            const payload = {
                app_id: APP_ID,
                include_external_user_ids: batch,
                headings: { en: title },
                contents: { en: message },
                data: {
                    type: 'admin_broadcast',
                    screen: data?.screen || 'dashboard',
                    timestamp: Date.now(),
                    ...data
                },
                android_channel_id: ANDROID_CHANNEL_ID,
                sound: 'default'
            };
            
            const response = await fetch('https://onesignal.com/api/v1/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${REST_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            if (response.ok) {
                successCount += batch.length;
            } else {
                failedCount += batch.length;
                console.error('Batch failed:', result);
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                totalUsers: recipients.length,
                sentCount: successCount,
                failedCount: failedCount,
                message: `Sent to ${successCount} users, ${failedCount} failed.`
            })
        };
        
    } catch (error) {
        console.error('[send-push-all] ❌ Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message })
        };
    }
};