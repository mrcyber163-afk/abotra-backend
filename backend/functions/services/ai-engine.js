// ============================================================
// AI ENGINE
// ============================================================

class AIEngine {
    constructor() {
        this.indicators = {
            rsi: this.calculateRSI,
            macd: this.calculateMACD,
            ema: this.calculateEMA,
            volume: this.analyzeVolume
        };
        
        this.confidenceThreshold = 85;
    }

    analyzeMarket(priceData) {
        const signals = {
            buy: 0,
            sell: 0,
            hold: 0
        };

        const weights = {
            rsi: 0.25,
            macd: 0.25,
            ema: 0.20,
            volume: 0.15,
            supportResistance: 0.15
        };

        // RSI Analysis (25%)
        const rsi = this.calculateRSI(priceData);
        if (rsi < 30) signals.buy += 2 * weights.rsi;
        else if (rsi > 70) signals.sell += 2 * weights.rsi;
        else signals.hold += 1 * weights.rsi;

        // MACD Analysis (25%)
        const macd = this.calculateMACD(priceData);
        if (macd.histogram > 0) signals.buy += 2 * weights.macd;
        else signals.sell += 1.5 * weights.macd;

        // EMA Crossover (20%)
        const ema = this.calculateEMA(priceData);
        const currentPrice = priceData[priceData.length - 1];
        if (currentPrice > ema) signals.buy += 1.5 * weights.ema;
        else signals.sell += 1.5 * weights.ema;

        // Volume Analysis (15%)
        const volumeSignal = this.analyzeVolume(priceData);
        if (volumeSignal === 'high') signals.buy += 1 * weights.volume;
        else if (volumeSignal === 'low') signals.sell += 1 * weights.volume;

        // Support/Resistance (15%)
        const srSignal = this.analyzeSupportResistance(priceData);
        if (srSignal === 'support') signals.buy += 1 * weights.supportResistance;
        else if (srSignal === 'resistance') signals.sell += 1 * weights.supportResistance;

        // Calculate confidence
        const totalScore = signals.buy + signals.sell + signals.hold;
        const confidence = (signals.buy / totalScore) * 100;

        // Decision
        if (confidence >= this.confidenceThreshold && signals.buy > signals.sell) {
            return { 
                decision: 'BUY', 
                confidence: Math.round(confidence),
                strength: Math.round((signals.buy / totalScore) * 100)
            };
        } else if (confidence >= this.confidenceThreshold && signals.sell > signals.buy) {
            return { 
                decision: 'SELL', 
                confidence: Math.round(confidence),
                strength: Math.round((signals.sell / totalScore) * 100)
            };
        } else {
            return { 
                decision: 'HOLD', 
                confidence: Math.round(confidence),
                strength: 0
            };
        }
    }

    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change >= 0) gains += change;
            else losses -= change;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;
        return 100 - (100 / (1 + (avgGain / avgLoss)));
    }

    calculateMACD(prices, fast = 12, slow = 26) {
        if (prices.length < slow) return { macd: 0, signal: 0, histogram: 0 };
        const fastEMA = prices.slice(-fast).reduce((a, b) => a + b, 0) / fast;
        const slowEMA = prices.slice(-slow).reduce((a, b) => a + b, 0) / slow;
        const macd = fastEMA - slowEMA;
        const signal = macd * 0.8;
        return { macd, signal, histogram: macd - signal };
    }

    calculateEMA(prices, period = 20) {
        if (prices.length < period) return prices[prices.length - 1] || 0;
        const k = 2 / (period + 1);
        let ema = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        return ema;
    }

    analyzeVolume(priceData) {
        // Placeholder - implement volume analysis
        return 'normal';
    }

    analyzeSupportResistance(priceData) {
        // Placeholder - implement support/resistance detection
        return 'neutral';
    }

    calculateRisk(position, settings) {
        const riskPerTrade = position * (settings.riskPercent || 2) / 100;
        const stopLossLevel = position * (settings.stopLoss || 5) / 100;
        return { riskPerTrade, stopLossLevel };
    }

    calculateLotSize(balance, riskPercent, stopLossPips, pipValue) {
        const riskAmount = balance * (riskPercent / 100);
        const lotSize = riskAmount / (stopLossPips * pipValue);
        return Math.round(lotSize * 1000) / 1000;
    }

    shouldTrade(priceData, indicators) {
        const analysis = this.analyzeMarket(priceData);
        return analysis.confidence >= this.confidenceThreshold;
    }
}

module.exports = new AIEngine();