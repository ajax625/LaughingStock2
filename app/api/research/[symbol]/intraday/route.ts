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
    // Fetch 15-minute intraday candles (60 days max window for Yahoo Finance 15m API)
    const candles15m = await getStockCandles(symbol, 60, '15m');

    // Filter 15m candles within the selected date range if provided
    let filteredCandles = candles15m;
    if (startDate && endDate) {
      filteredCandles = candles15m.filter((c) => {
        const cDate = c.date.split(' ')[0]; // Extract YYYY-MM-DD
        return cDate >= startDate && cDate <= endDate;
      });
    }

    // Compute 15m Intraday Indicators (Volume MA & RVOL per 15m bar)
    const windowX = 20;
    const enriched15m = filteredCandles.map((c, idx, arr) => {
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
      interval: '15m',
      startDate,
      endDate,
      total15mBars: enriched15m.length,
      candles: enriched15m,
    });
  } catch (err: any) {
    console.error(`Failed to fetch 15m intraday candles for ${symbol}:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch 15m intraday candle data' },
      { status: 500 }
    );
  }
}
