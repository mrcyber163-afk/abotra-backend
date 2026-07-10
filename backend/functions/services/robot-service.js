// backend/functions/services/robot-service.js
const { restGet, restPut, restPatch } = require('../firebase');

class RobotService {
    async getRobot(uid) {
        const robot = await restGet(`users/${uid}/robots/currentRobot`);
        return robot || null;
    }
    
    async createTrialRobot(uid) {
        const startDate = Date.now();
        const expiryDate = startDate + (15 * 24 * 60 * 60 * 1000);
        
        const trialRobot = {
            name: 'ABOTRA Starter AI',
            type: 'trial',
            premium: false,
            status: 'active',
            startDate: startDate,
            expiryDate: expiryDate,
            investment: 0,
            balance: 0,
            totalProfit: 0,
            tradesCount: 0,
            winRate: 0,
            createdAt: startDate
        };
        
        await restPut(`users/${uid}/robots/currentRobot`, trialRobot);
        return trialRobot;
    }
    
    async upgradeRobot(uid, planId, amount) {
        const plan = await restGet(`robotPlans/${planId}`);
        if (!plan) throw new Error('Plan not found');
        
        // Check balance
        const user = await restGet(`users/${uid}`);
        if (!user || user.balance < amount) {
            throw new Error('Insufficient balance');
        }
        
        // Deduct balance
        await restPatch(`users/${uid}`, {
            balance: user.balance - amount
        });
        
        // Create premium robot
        const startDate = Date.now();
        const expiryDate = startDate + (plan.duration * 24 * 60 * 60 * 1000);
        
        const premiumRobot = {
            name: plan.name || 'Premium Robot',
            type: 'premium',
            premium: true,
            status: 'active',
            duration: plan.duration,
            startDate: startDate,
            expiryDate: expiryDate,
            investment: amount,
            balance: amount,
            totalProfit: 0,
            tradesCount: 0,
            winRate: 0,
            planId: planId,
            upgradedAt: Date.now()
        };
        
        await restPut(`users/${uid}/robots/currentRobot`, premiumRobot);
        return premiumRobot;
    }
    
    async checkExpiry(uid) {
        const robot = await this.getRobot(uid);
        if (!robot) return null;
        
        const now = Date.now();
        if (robot.expiryDate && now > robot.expiryDate && robot.status !== 'expired') {
            await restPatch(`users/${uid}/robots/currentRobot`, {
                status: 'expired'
            });
            return { expired: true, robot };
        }
        
        return { expired: false, robot };
    }
    
    async calculateDaysRemaining(expiryDate) {
        const now = Date.now();
        const diff = expiryDate - now;
        if (diff <= 0) return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    
    async pauseRobot(uid) {
        await restPatch(`users/${uid}/robots/currentRobot`, {
            status: 'paused',
            pausedAt: Date.now()
        });
        return { success: true };
    }
    
    async activateRobot(uid) {
        await restPatch(`users/${uid}/robots/currentRobot`, {
            status: 'active',
            activatedAt: Date.now()
        });
        return { success: true };
    }
}

module.exports = new RobotService();