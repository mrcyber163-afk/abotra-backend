// ============================================================
// NETLIFY FUNCTION: Send Push Notification via OneSignal
// ============================================================
// Location: netlify/functions/send-push.js
// Endpoint: /.netlify/functions/send-push
// ============================================================

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({
                success: false,
                error: 'Method not allowed. Use POST.'
            })
        };
    }
    
    try {
        // ============================================================
        // 1. PARSE REQUEST BODY
        // ============================================================
        const { userId, userIds, title, message, data } = JSON.parse(event.body);
        
        // ============================================================
        // 2. GET KEYS FROM ENVIRONMENT VARIABLES
        // ============================================================
        const APP_ID = process.env.ONESIGNAL_APP_ID;
        const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
        const ANDROID_CHANNEL_ID = process.env.ONESIGNAL_ANDROID_CHANNEL_ID || 'default_channel';
        
        if (!APP_ID || !REST_API_KEY) {
            console.error('❌ Missing OneSignal keys in environment variables');
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: 'OneSignal is not configured properly.'
                })
            };
        }
        
        // Determine recipients
        let recipients = [];
        if (userIds && Array.isArray(userIds)) {
            recipients = userIds;
        } else if (userId) {
            recipients = [userId];
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'User ID(s) are required.'
                })
            };
        }
        
        if (!title || !message) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: 'Title and message are required.'
                })
            };
        }
        
        // ============================================================
        // 3. SEND PUSH NOTIFICATION VIA ONESIGNAL API
        // ============================================================
        const payload = {
            app_id: APP_ID,
            include_external_user_ids: recipients,
            headings: { en: title },
            contents: { en: message },
            data: {
                type: 'admin_message',
                screen: data?.screen || 'dashboard',
                timestamp: Date.now(),
                ...data
            },
            android_channel_id: ANDROID_CHANNEL_ID,
            sound: 'default'
        };
        
        console.log('📤 Sending push notification:', {
            recipientCount: recipients.length,
            title,
            message,
            appId: APP_ID
        });
        
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${REST_API_KEY}`
            },
            body: JSON.stringify(payload)
        });
        
        const responseData = await response.json();
        console.log('✅ OneSignal response:', responseData);
        
        // ============================================================
        // 4. RETURN RESPONSE
        // ============================================================
        if (response.ok) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: 'Push notification sent successfully!',
                    totalUsers: recipients.length,
                    data: responseData
                })
            };
        } else {
            return {
                statusCode: response.status,
                body: JSON.stringify({
                    success: false,
                    error: responseData.errors || 'Failed to send notification',
                    details: responseData
                })
            };
        }
        
    } catch (error) {
        console.error('❌ Send push error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: 'Internal server error: ' + error.message
            })
        };
    }
};