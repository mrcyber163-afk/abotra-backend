// ============================================================
// ROBOT SCHEDULER
// ============================================================

const { restGet, restPatch } = require('../firebase');
const robotService = require('../services/robot-service');

class RobotScheduler {
    constructor() {
        this.isRunning = false;
        this.interval = 60000; // 1 minute
        this.timer = null;
    }
    
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Robot Scheduler] Started');
        
        await this.processRobots();
        this.timer = setInterval(async () => {
            await this.processRobots();
        }, this.interval);
    }
    
    async processRobots() {
        try {
            const users = await restGet('users');
            if (!users) return;
            
            const now = Date.now();
            
            for (const [uid, userData] of Object.entries(users)) {
                try {
                    const robot = await robotService.getRobot(uid);
                    if (!robot || robot.status !== 'active') continue;
                    
                    if (robot.expiryDate && now > robot.expiryDate) {
                        await robotService.pauseRobot(uid);
                        await restPatch(`users/${uid}/robots/currentRobot`, {
                            status: 'expired'
                        });
                        console.log(`[Robot Scheduler] Robot expired for ${uid}`);
                        continue;
                    }
                    
                    const broker = await restGet(`broker/${uid}`);
                    if (!broker || !broker.connected) {
                        continue;
                    }
                    
                    // Process trading logic here
                    // This will be expanded with AI engine
                    
                } catch (error) {
                    console.error(`[Robot Scheduler] Error processing ${uid}:`, error.message);
                }
            }
        } catch (error) {
            console.error('[Robot Scheduler] Process error:', error);
        }
    }
    
    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        console.log('[Robot Scheduler] Stopped');
    }
}

module.exports = new RobotScheduler();