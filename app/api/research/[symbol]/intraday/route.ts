import { NextResponse } from 'next/server';
import { getStockCandles } from '@/lib/market-data';

export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    let effectiveInterval: '15m' | '1h' | '1d' = '15m';
    let rawCandles: any[] = [];
    let providerNotice = '';

    // 1. Attempt 15-minute intraday bars (Yahoo Finance API 60-day max window)
    try {
      rawCandles = await getStockCandles(symbol, 60, '15m');
    } catch (e15) {
      console.warn(`15m candles unavailable for ${symbol}, trying 1h fallback...`);
    }

    // Filter 15m candles if found
    let filtered = startDate && endDate
      ? rawCandles.filter((c) => {
          const cDate = c.date.split(' ')[0];
          return cDate >= startDate && cDate <= endDate;
        })
      : rawCandles;

    // 2. Fallback to 1-Hour (1h) intraday bars if 15m returned 0 bars for target range
    if (filtered.length === 0) {
      effectiveInterval = '1h';
      try {
        const candles1h = await getStockCandles(symbol, 730, '1h');
        filtered = startDate && endDate
          ? candles1h.filter((c) => {
              const cDate = c.date.split(' ')[0];
              return cDate >= startDate && cDate <= endDate;
            })
          : candles1h;
        providerNotice = 'Dates older than 60 days: Yahoo Finance limits 15m intraday bars to the last 60 days. Displaying 1-Hour (1h) intraday bars.';
      } catch (e1h) {
        console.warn(`1h candles unavailable for ${symbol}, trying 1d fallback...`);
      }
    }

    // 3. Fallback to Daily (1d) bars if intraday APIs return empty for historical dates
    if (filtered.length === 0) {
      effectiveInterval = '1d';
      const candles1d = await getStockCandles(symbol, 365, '1d');
      filtered = startDate && endDate
        ? candles1d.filter((c) => c.date >= startDate && c.date <= endDate)
        : candles1d;
      providerNotice = 'Historical range older than 2 years: Intraday 15m/1h APIs expired. Displaying daily session bars.';
    }

    // Compute Intraday Indicators (Volume MA & RVOL)
    const windowX = 20;
    const enriched = filtered.map((c, idx, arr) => {
      const startIdx = Math.max(0, idx - windowX + 1);
      const windowBars = arr.slice(startIdx, idx + 1);
      const avgVol = windowBars.reduce((acc, b) => acc + (b.volume || 0), 0) / windowBars.length;
      const rvol = avgVol > 0 ? Number(((c.volume || 0) / avgVol).toFixed(2)) : 1.0;
      const rangePct = c.open > 0 ? Number((((c.high - c.low) / c.open) * 100).toFixed(2)) : 0;

      return {
        ...c,
        volumeMA: Math.round(avgVol),
        rvol,
        rangePct,
        isVolumeSpike: rvol > 1.5,
      };
    });

    return NextResponse.json({
      symbol,
      interval: effectiveInterval,
      startDate,
      endDate,
      totalBars: enriched.length,
      candles: enriched,
      providerNotice,
    });
  } catch (err: any) {
    console.error(`Failed to fetch intraday candles for ${symbol}:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch intraday candle data' },
      { status: 500 }
    );
  }
}
