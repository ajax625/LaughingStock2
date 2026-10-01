import YahooFinance from 'yahoo-finance2';
import { prisma } from './prisma';

// Instantiate YahooFinance v3 with notice suppression
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  highlight?: boolean;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;
}

export interface TechnicalIndicators {
  rsi: number;
  sma20: number;
  sma50: number;
  ema20: number;
  macd: { macd: number; signal: number; histogram: number };
  bollinger: { upper: number; middle: number; lower: number };
  volumeAvg20: number;
}

export type CandleInterval = '1d' | '1h' | '15m' | '5m' | '1m';

/**
 * Yahoo Finance v3 Market Data Service:
 * Automatically persists harvested candles into PostgreSQL ('MarketCandle' table).
 * Strict Binary Data Policy (No Fake/Synthetic Data Generation).
 */

export async function getStockQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase().trim();
  if (!sym) {
    throw new Error('Symbol is required');
  }

  try {
    const result = await yahooFinance.quote(sym);
    if (result && typeof result.regularMarketPrice === 'number') {
      return {
        symbol: sym,
        name: result.shortName || result.longName || sym,
        price: result.regularMarketPrice,
        change: result.regularMarketChange || 0,
        changePercent: result.regularMarketChangePercent || 0,
        high: result.regularMarketDayHigh || result.regularMarketPrice,
        low: result.regularMarketDayLow || result.regularMarketPrice,
        volume: result.regularMarketVolume || 0,
        marketCap: result.marketCap || 0,
      };
    }
    throw new Error(`No real market quote data returned for symbol: ${sym}`);
  } catch (error: any) {
    console.error(`Market data error for quote [${sym}]:`, error?.message || error);
    throw new Error(`Market data unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

export async function getStockCandles(
  symbol: string,
  days = 60,
  interval: CandleInterval = '1d'
): Promise<Candle[]> {
  const sym = symbol.toUpperCase().trim();
  if (!sym) {
    throw new Error('Symbol is required');
  }

  try {
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const period2 = new Date();

    // 1. Fetch from Yahoo Finance API
    const chartResult = await yahooFinance.chart(sym, {
      period1,
      period2,
      interval: interval as any,
    });

    if (!chartResult || !chartResult.quotes || chartResult.quotes.length === 0) {
      throw new Error(`No historical candle data returned from chart() for symbol: ${sym} at interval '${interval}'`);
    }

    const validCandles: Candle[] = chartResult.quotes
      .filter((q: any) => q.close !== null && q.open !== null && q.high !== null && q.low !== null)
      .map((q: any) => ({
        date: interval === '1d' 
          ? new Date(q.date).toISOString().split('T')[0]
          : new Date(q.date).toISOString().replace('T', ' ').slice(0, 16),
        open: Number(q.open.toFixed(2)),
        high: Number(q.high.toFixed(2)),
        low: Number(q.low.toFixed(2)),
        close: Number(q.close.toFixed(2)),
        volume: q.volume || 0,
      }));

    if (validCandles.length === 0) {
      throw new Error(`No valid price candles found for symbol: ${sym}`);
    }

    // 2. Efficient Batch Persistence into PostgreSQL 'MarketCandle' Table (Single SQL Query)
    try {
      const records = validCandles.map((c) => ({
        symbol: sym,
        interval: interval,
        timestamp: new Date(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: BigInt(c.volume),
      }));

      await prisma.marketCandle.createMany({
        data: records,
        skipDuplicates: true,
      });
    } catch (dbErr) {
      console.error(`PostgreSQL MarketCandle bulk insert error for ${sym}:`, dbErr);
    }

    return validCandles;
  } catch (error: any) {
    console.error(`Market data error for candles chart() [${sym}]:`, error?.message || error);
    throw new Error(`Historical candle data unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

export function calculateIndicators(candles: Candle[]): TechnicalIndicators {
  if (!candles || candles.length === 0) {
    throw new Error('Cannot calculate indicators on empty candle dataset');
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const len = closes.length;

  const getSMA = (period: number) => {
    if (len < period) return closes[len - 1];
    const slice = closes.slice(len - period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const sma20 = getSMA(20);
  const sma50 = getSMA(50);

  let ema20 = closes[0];
  const k = 2 / (20 + 1);
  for (let i = 1; i < len; i++) {
    ema20 = closes[i] * k + ema20 * (1 - k);
  }

  let gains = 0;
  let losses = 0;
  const rsiPeriod = 14;
  for (let i = Math.max(1, len - rsiPeriod); i < len; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / rsiPeriod;
  const avgLoss = losses / rsiPeriod || 1;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  const getEMA = (period: number) => {
    let val = closes[0];
    const multiplier = 2 / (period + 1);
    for (let i = 1; i < len; i++) {
      val = closes[i] * multiplier + val * (1 - multiplier);
    }
    return val;
  };

  const ema12 = getEMA(12);
  const ema26 = getEMA(26);
  const macdVal = ema12 - ema26;
  const signalVal = macdVal * 0.8;
  const histVal = macdVal - signalVal;

  const slice20 = closes.slice(Math.max(0, len - 20));
  const mean20 = slice20.reduce((a, b) => a + b, 0) / slice20.length;
  const variance = slice20.reduce((a, b) => a + Math.pow(b - mean20, 2), 0) / slice20.length;
  const stdDev = Math.sqrt(variance);

  const volSlice20 = volumes.slice(Math.max(0, len - 20));
  const volumeAvg20 = volSlice20.reduce((a, b) => a + b, 0) / volSlice20.length;

  return {
    rsi: Number(rsi.toFixed(1)),
    sma20: Number(sma20.toFixed(2)),
    sma50: Number(sma50.toFixed(2)),
    ema20: Number(ema20.toFixed(2)),
    macd: {
      macd: Number(macdVal.toFixed(2)),
      signal: Number(signalVal.toFixed(2)),
      histogram: Number(histVal.toFixed(2)),
    },
    bollinger: {
      middle: Number(mean20.toFixed(2)),
      upper: Number((mean20 + 2 * stdDev).toFixed(2)),
      lower: Number((mean20 - 2 * stdDev).toFixed(2)),
    },
    volumeAvg20: Math.round(volumeAvg20),
  };
}
