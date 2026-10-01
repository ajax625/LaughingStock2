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
 * Market Data Provider Selection ('yahoo' | 'alpaca')
 */
export function getActiveMarketProvider(): 'yahoo' | 'alpaca' {
  const provider = (process.env.MARKET_DATA_PROVIDER || 'yahoo').toLowerCase().trim();
  if (provider === 'alpaca') {
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) {
      console.warn('[Market Data Provider] MARKET_DATA_PROVIDER is set to "alpaca", but ALPACA_API_KEY / ALPACA_SECRET_KEY are missing. Falling back to "yahoo".');
      return 'yahoo';
    }
    return 'alpaca';
  }
  return 'yahoo';
}

/**
 * Unified Quote Fetcher (Routes to Yahoo or Alpaca based on ENV)
 */
export async function getStockQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase().trim();
  if (!sym) throw new Error('Symbol is required');

  const provider = getActiveMarketProvider();
  if (provider === 'alpaca') {
    return getAlpacaQuote(sym);
  }
  return getYahooQuote(sym);
}

/**
 * Unified Historical Candle Fetcher (Routes to Yahoo or Alpaca based on ENV)
 */
export async function getStockCandles(
  symbol: string,
  days = 60,
  interval: CandleInterval = '1d'
): Promise<Candle[]> {
  const sym = symbol.toUpperCase().trim();
  if (!sym) throw new Error('Symbol is required');

  const provider = getActiveMarketProvider();
  let validCandles: Candle[] = [];

  if (provider === 'alpaca') {
    validCandles = await getAlpacaCandles(sym, days, interval);
  } else {
    validCandles = await getYahooCandles(sym, days, interval);
  }

  // Efficient Batch Persistence into PostgreSQL 'MarketCandle' Table (Single SQL Query)
  try {
    const records = validCandles.map((c) => ({
      symbol: sym,
      interval: interval,
      timestamp: new Date(c.date),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: BigInt(Math.round(c.volume || 0)),
    }));

    const res = await prisma.marketCandle.createMany({
      data: records,
      skipDuplicates: true,
    });
    if (res.count > 0) {
      console.log(`[DB SUCCESS] Created ${res.count} MarketCandles in PostgreSQL for ${sym} (Provider: ${provider})`);
    }
  } catch (dbErr: any) {
    console.error(`[DB ERROR] PostgreSQL MarketCandle bulk insert failed for ${sym}:`, dbErr?.message || dbErr);
  }

  return validCandles;
}

/* ============================================================================
   PROVIDER 1: YAHOO FINANCE IMPLEMENTATION
============================================================================ */

async function getYahooQuote(sym: string): Promise<Quote> {
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
    console.error(`Yahoo quote error [${sym}]:`, error?.message || error);
    throw new Error(`Yahoo market quote unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

async function getYahooCandles(sym: string, days: number, interval: CandleInterval): Promise<Candle[]> {
  try {
    const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const period2 = new Date();

    const chartResult = await yahooFinance.chart(sym, {
      period1,
      period2,
      interval: interval as any,
    });

    if (!chartResult || !chartResult.quotes || chartResult.quotes.length === 0) {
      throw new Error(`No historical candle data returned from Yahoo chart() for symbol: ${sym} at interval '${interval}'`);
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

    return validCandles;
  } catch (error: any) {
    console.error(`Yahoo candles error [${sym}]:`, error?.message || error);
    throw new Error(`Yahoo historical candle data unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

/* ============================================================================
   PROVIDER 2: ALPACA MARKETS REST API V2 IMPLEMENTATION
============================================================================ */

async function getAlpacaQuote(sym: string): Promise<Quote> {
  const apiKey = process.env.ALPACA_API_KEY!;
  const secretKey = process.env.ALPACA_SECRET_KEY!;

  try {
    const url = `https://data.alpaca.markets/v2/stocks/${sym}/snapshot`;
    const res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!res.ok) {
      throw new Error(`Alpaca API returned HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const dailyBar = data.dailyBar || data.latestTrade || {};
    const prevDailyBar = data.prevDailyBar || {};
    const price = dailyBar.c || dailyBar.p || 0;
    const prevClose = prevDailyBar.c || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: sym,
      name: sym,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      high: Number((dailyBar.h || price).toFixed(2)),
      low: Number((dailyBar.l || price).toFixed(2)),
      volume: dailyBar.v || 0,
      marketCap: 0,
    };
  } catch (error: any) {
    console.error(`Alpaca quote error [${sym}]:`, error?.message || error);
    throw new Error(`Alpaca market quote unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

async function getAlpacaCandles(sym: string, days: number, interval: CandleInterval): Promise<Candle[]> {
  const apiKey = process.env.ALPACA_API_KEY!;
  const secretKey = process.env.ALPACA_SECRET_KEY!;

  const timeframeMap: Record<CandleInterval, string> = {
    '1d': '1Day',
    '1h': '1Hour',
    '15m': '15Min',
    '5m': '5Min',
    '1m': '1Min',
  };

  const timeframe = timeframeMap[interval] || '1Day';
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  try {
    const url = `https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=${timeframe}&start=${startDate}&end=${endDate}&limit=10000&feed=sip`;
    let res = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!res.ok) {
      // Fallback feed retry if sip feed requires paid plan
      const iexUrl = `https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=${timeframe}&start=${startDate}&end=${endDate}&limit=10000&feed=iex`;
      res = await fetch(iexUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        },
      });
      if (!res.ok) {
        throw new Error(`Alpaca Data API returned HTTP ${res.status}`);
      }
    }

    const data = await res.json();
    return parseAlpacaBars(data.bars || [], interval, sym);
  } catch (error: any) {
    console.error(`Alpaca candles error [${sym}]:`, error?.message || error);
    throw new Error(`Alpaca historical candle data unavailable for ticker '${sym}'. (${error?.message || 'Network/API error'})`);
  }
}

function parseAlpacaBars(bars: any[], interval: CandleInterval, sym: string): Candle[] {
  if (!bars || bars.length === 0) {
    throw new Error(`No historical candle bars returned from Alpaca for symbol: ${sym}`);
  }

  return bars.map((b) => ({
    date: interval === '1d' 
      ? new Date(b.t).toISOString().split('T')[0]
      : new Date(b.t).toISOString().replace('T', ' ').slice(0, 16),
    open: Number(b.o.toFixed(2)),
    high: Number(b.h.toFixed(2)),
    low: Number(b.l.toFixed(2)),
    close: Number(b.c.toFixed(2)),
    volume: b.v || 0,
  }));
}

/* ============================================================================
   TECHNICAL INDICATORS CALCULATION ENGINE
============================================================================ */

export function calculateIndicators(candles: Candle[]): TechnicalIndicators {
  if (!candles || candles.length === 0) {
    throw new Error('Cannot calculate indicators on empty candle dataset');
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const sma20 = Math.round(calculateSMA(closes, 20) * 100) / 100;
  const sma50 = Math.round(calculateSMA(closes, 50) * 100) / 100;
  const ema20 = Math.round(calculateEMA(closes, 20) * 100) / 100;
  const rsi = Math.round(calculateRSI(closes, 14) * 100) / 100;
  const macd = calculateMACD(closes);
  const bollinger = calculateBollingerBands(closes, 20, 2);
  const volumeAvg20 = Math.round(calculateSMA(volumes, 20));

  return {
    rsi,
    sma20,
    sma50,
    ema20,
    macd,
    bollinger,
    volumeAvg20,
  };
}

function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(data.length - period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(data: number[], period: number): number {
  if (data.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(closes: number[]) {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdVal = Math.round((ema12 - ema26) * 100) / 100;
  const signalVal = Math.round(macdVal * 0.8 * 100) / 100;
  const histVal = Math.round((macdVal - signalVal) * 100) / 100;

  return {
    macd: macdVal,
    signal: signalVal,
    histogram: histVal,
  };
}

function calculateBollingerBands(closes: number[], period = 20, multiplier = 2) {
  const sma = calculateSMA(closes, period);
  if (closes.length < period) {
    return { upper: sma, middle: sma, lower: sma };
  }
  const slice = closes.slice(closes.length - period);
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: Math.round((sma + stdDev * multiplier) * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round((sma - stdDev * multiplier) * 100) / 100,
  };
}
