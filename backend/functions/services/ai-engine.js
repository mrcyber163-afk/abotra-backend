class AIEngine {
    constructor() {
        this.indicators = {
            rsi: this.calculateRSI,
            macd: this.calculateMACD,
            ema: this.calculateEMA,
            volume: this.analyzeVolume
        };
    }

    analyzeMarket(priceData) {
        const signals = {
            buy: 0,
            sell: 0,
            hold: 0
        };

        // RSI Analysis
        const rsi = this.calculateRSI(priceData);
        if (rsi < 30) signals.buy += 2;
        else if (rsi > 70) signals.sell += 2;
        else signals.hold += 1;

        // MACD Analysis
        const macd = this.calculateMACD(priceData);
        if (macd.histogram > 0) signals.buy += 1.5;
        else signals.sell += 1.5;

        // EMA Crossover
        const ema = this.calculateEMA(priceData);
        const currentPrice = priceData[priceData.length - 1];
        if (currentPrice > ema) signals.buy += 1;
        else signals.sell += 1;

        // Volume Analysis
        const volumeSignal = this.analyzeVolume(priceData);
        if (volumeSignal === 'high') signals.buy += 1;
        else if (volumeSignal === 'low') signals.sell += 1;

        // Decision
        const maxSignal = Math.max(signals.buy, signals.sell, signals.hold);
        
        if (maxSignal === signals.buy && signals.buy > 2) {
            return { decision: 'BUY', confidence: Math.min((signals.buy / 6) * 100, 95) };
        } else if (maxSignal === signals.sell && signals.sell > 2) {
            return { decision: 'SELL', confidence: Math.min((signals.sell / 6) * 100, 95) };
        } else {
            return { decision: 'HOLD', confidence: 50 };
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

    calculateRisk(position, settings) {
        const riskPerTrade = position * (settings.riskPercent || 2) / 100;
        const stopLossLevel = position * (settings.stopLoss || 5) / 100;
        return { riskPerTrade, stopLossLevel };
    }
}

module.exports = new AIEngine();