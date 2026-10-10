import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStockCandles } from '@/lib/market-data';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const datasetId = params.id;
  if (!datasetId) {
    return NextResponse.json({ error: 'Dataset ID is required' }, { status: 400 });
  }

  try {
    let dbCandles: any[] = [];
    try {
      dbCandles = await prisma.marketCandle.findMany({
        where: { datasetId },
        orderBy: { timestamp: 'asc' },
      });
    } catch (e) {
      console.warn(`[DB WARN] Failed to fetch MarketCandles for dataset ${datasetId}:`, e);
    }

    if (dbCandles.length > 0) {
      const formatted = dbCandles.map((c) => ({
        date: new Date(c.timestamp).toISOString().replace('T', ' ').slice(0, 16),
        open: Number(c.open || 0),
        high: Number(c.high || 0),
        low: Number(c.low || 0),
        close: Number(c.close || 0),
        volume: Number(c.volume || 0),
      }));

      return NextResponse.json({
        success: true,
        datasetId,
        source: 'database_market_candle',
        totalBars: formatted.length,
        candles: formatted,
      });
    }

    // Fallback: Query dataset directly or fetch from market provider
    let dataset: any = null;
    try {
      dataset = await prisma.researchDataset.findUnique({
        where: { id: datasetId },
      });
    } catch (e) {}

    if (dataset) {
      if (Array.isArray(dataset.candles) && dataset.candles.length > 0) {
        return NextResponse.json({
          success: true,
          datasetId,
          source: 'dataset_json_candles',
          totalBars: dataset.candles.length,
          candles: dataset.candles,
        });
      }

      // Fetch 5m candles from Alpaca for dataset date range
      try {
        const fetched5m = await getStockCandles(
          dataset.symbol,
          30,
          '5m',
          dataset.startDate,
          dataset.endDate
        );

        return NextResponse.json({
          success: true,
          datasetId,
          source: 'alpaca_5m_live_fetch',
          totalBars: fetched5m.length,
          candles: fetched5m,
        });
      } catch (fErr: any) {
        console.warn(`Alpaca fallback fetch error for ${dataset.symbol}:`, fErr?.message);
      }
    }

    return NextResponse.json({
      success: true,
      datasetId,
      source: 'empty',
      totalBars: 0,
      candles: [],
    });
  } catch (err: any) {
    console.error(`Failed to fetch dataset candles for ${datasetId}:`, err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch dataset candles' },
      { status: 500 }
    );
  }
}
