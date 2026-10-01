import { NextResponse } from 'next/server';
import { getStockQuote, getStockCandles, calculateIndicators } from '@/lib/market-data';
import { processConvictionDetector } from '@/lib/conviction-detector';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: { symbol: string } }
) {
  const symbol = params.symbol?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);

  // Conviction Detector Parameters (x, y, z, V_min, M)
  const x = Number(searchParams.get('x') || 15);
  const y = Number(searchParams.get('y') || 3);
  const z = Number(searchParams.get('z') || 20);
  const V_min = Number(searchParams.get('V_min') || 1.3);
  const M = Number(searchParams.get('M') || 5.0);

  try {
    const quote = await getStockQuote(symbol);

    // First Pass Harvest: 365 Days of 1D Daily Bars (Saved directly into PostgreSQL MarketCandle table)
    const rawCandles = await getStockCandles(symbol, 365, '1d');

    // Query exact database count for this symbol
    let dbCount = 0;
    try {
      dbCount = await prisma.marketCandle.count({
        where: { symbol },
      });
    } catch (countErr) {
      console.error(`Error querying MarketCandle count for ${symbol}:`, countErr);
    }

    // Process Conviction Detector Engine
    const convictionResult = processConvictionDetector(symbol, rawCandles, {
      x,
      y,
      z,
      V_min,
      M,
    });

    const indicators = calculateIndicators(rawCandles);

    return NextResponse.json({
      quote,
      candles: convictionResult.enrichedCandles,
      candidates: convictionResult.candidates,
      convictionCount: convictionResult.convictionCount,
      params: convictionResult.params,
      harvestDays: 365,
      totalDailyCandles: rawCandles.length,
      dbSavedCount: dbCount,
      indicators,
    });
  } catch (err: any) {
    console.error(`Failed to research symbol ${symbol}:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch symbol research data' },
      { status: 500 }
    );
  }
}
