// backend/functions/services/subscription-service.js
const { restGet, restPut, restPatch } = require('../firebase');

class SubscriptionService {
    async getSubscription(uid) {
        const sub = await restGet(`subscriptions/${uid}`);
        return sub || null;
    }
    
    async createSubscription(uid, plan) {
        const subscription = {
            plan: plan || 'Starter',
            active: true,
            capitalRange: '$50 - $500',
            createdAt: Date.now(),
            expiry: Date.now() + (30 * 24 * 60 * 60 * 1000)
        };
        
        await restPut(`subscriptions/${uid}`, subscription);
        return subscription;
    }
    
    async upgradePlan(uid, newPlan) {
        const plans = {
            'AI Pro': { capital: '$500 - $5,000', features: 'Advanced AI, 15 pairs' },
            'AI Elite': { capital: '$5,000+', features: 'Professional AI, all pairs' }
        };
        
        const planData = plans[newPlan];
        if (!planData) throw new Error('Invalid plan');
        
        await restPatch(`subscriptions/${uid}`, {
            plan: newPlan,
            capitalRange: planData.capital,
            updatedAt: Date.now()
        });
        
        return { plan: newPlan, ...planData };
    }
    
    async cancelSubscription(uid) {
        await restPatch(`subscriptions/${uid}`, {
            active: false,
            cancelledAt: Date.now()
        });
        return { success: true };
    }
    
    async renewSubscription(uid) {
        await restPatch(`subscriptions/${uid}`, {
            active: true,
            expiry: Date.now() + (30 * 24 * 60 * 60 * 1000),
            renewedAt: Date.now()
        });
        return { success: true };
    }
}

module.exports = new SubscriptionService();