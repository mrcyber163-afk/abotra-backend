// backend/functions/scheduler/robot-scheduler.js
const { restGet, restPut, restPatch } = require('../firebase');
const robotService = require('../services/robot-service');

class RobotScheduler {
    constructor() {
        this.isRunning = false;
        this.interval = 60000; // 1 minute
    }
    
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Robot Scheduler] Started');
        
        while (this.isRunning) {
            try {
                await this.processRobots();
                await this.sleep(this.interval);
            } catch (error) {
                console.error('[Robot Scheduler] Error:', error);
                await this.sleep(5000);
            }
        }
    }
    
    async processRobots() {
        // Get all users
        const users = await restGet('users');
        if (!users) return;
        
        const now = Date.now();
        
        for (const [uid, userData] of Object.entries(users)) {
            try {
                const robot = await robotService.getRobot(uid);
                if (!robot || robot.status !== 'active') continue;
                
                // Check expiry
                if (robot.expiryDate && now > robot.expiryDate) {
                    await robotService.pauseRobot(uid);
                    await restPatch(`users/${uid}/robots/currentRobot`, {
                        status: 'expired'
                    });
                    console.log(`[Robot Scheduler] Robot expired for ${uid}`);
                    continue;
                }
                
                // Process trading logic here
                // This will be expanded with actual trading engine
                await this.processRobotTrading(uid, robot);
                
            } catch (error) {
                console.error(`[Robot Scheduler] Error processing ${uid}:`, error);
            }
        }
    }
    
    async processRobotTrading(uid, robot) {
        // Placeholder for actual trading logic
        // Will be integrated with AI engine and broker service
        console.log(`[Robot Scheduler] Processing robot for ${uid}`);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    stop() {
        this.isRunning = false;
        console.log('[Robot Scheduler] Stopped');
    }
}

module.exports = new RobotScheduler();