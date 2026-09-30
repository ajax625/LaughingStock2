import { Quote, Candle } from '../market-data';

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class MarketDataCacheMiddleware {
  private quoteCache = new Map<string, CacheEntry<Quote>>();
  private candleCache = new Map<string, CacheEntry<Candle[]>>();
  private inFlightQuotes = new Map<string, Promise<Quote>>();

  // Quote TTL: 10 seconds
  private QUOTE_TTL_MS = 10 * 1000;
  // Candle TTL: 5 minutes
  private CANDLE_TTL_MS = 5 * 60 * 1000;

  public async getOrFetchQuote(
    symbol: string,
    fetcher: (sym: string) => Promise<Quote>
  ): Promise<Quote> {
    const sym = symbol.toUpperCase();
    const now = Date.now();

    // 1. Check Cache
    const cached = this.quoteCache.get(sym);
    if (cached && cached.expiry > now) {
      return cached.data;
    }

    // 2. Request Deduplication (if fetch already in flight, await it)
    if (this.inFlightQuotes.has(sym)) {
      return this.inFlightQuotes.get(sym)!;
    }

    // 3. Fetch from Upstream
    const fetchPromise = (async () => {
      try {
        const quote = await fetcher(sym);
        this.quoteCache.set(sym, {
          data: quote,
          expiry: Date.now() + this.QUOTE_TTL_MS,
        });
        return quote;
      } finally {
        this.inFlightQuotes.delete(sym);
      }
    })();

    this.inFlightQuotes.set(sym, fetchPromise);
    return fetchPromise;
  }

  public async getOrFetchCandles(
    symbol: string,
    days: number,
    fetcher: (sym: string, d: number) => Promise<Candle[]>
  ): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    const cacheKey = `${sym}_${days}`;
    const now = Date.now();

    const cached = this.candleCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      return cached.data;
    }

    const candles = await fetcher(sym, days);
    this.candleCache.set(cacheKey, {
      data: candles,
      expiry: Date.now() + this.CANDLE_TTL_MS,
    });
    return candles;
  }

  public clearCache() {
    this.quoteCache.clear();
    this.candleCache.clear();
  }
}

export const marketCacheMiddleware = new MarketDataCacheMiddleware();
