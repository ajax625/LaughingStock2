import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();

    const datasets = await prisma.researchDataset.findMany({
      where: symbol ? { symbol } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ datasets });
  } catch (err: any) {
    console.error('Failed to fetch research datasets:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch datasets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, convictionDate, roiPct, startDate, endDate, candles } = body;

    if (!symbol || !convictionDate || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing required dataset fields' }, { status: 400 });
    }

    const sym = symbol.toUpperCase().trim();
    // Format convictionDate "YYYY-MM-DD" to "MMDDYYYY"
    const [y, m, d] = convictionDate.split('T')[0].split('-');
    const mmddyyyy = `${m}${d}${y}`;
    const roiStr = (roiPct || 0).toFixed(1).replace('.', '_');
    
    // Dataset Name format: e.g. AAPL_09102026_5_2
    const datasetName = `${sym}_${mmddyyyy}_${roiStr}`;

    const validCandles = Array.isArray(candles) ? candles : [];

    const dataset = await prisma.researchDataset.upsert({
      where: { datasetName },
      update: {
        symbol: sym,
        convictionDate,
        roiPct: Number(roiPct || 0),
        startDate,
        endDate,
        barCount: validCandles.length,
        status: 'APPROVED_FOR_RESEARCH',
        candles: validCandles,
      },
      create: {
        datasetName,
        symbol: sym,
        convictionDate,
        roiPct: Number(roiPct || 0),
        startDate,
        endDate,
        barCount: validCandles.length,
        status: 'APPROVED_FOR_RESEARCH',
        candles: validCandles,
      },
    });

    // Also persist 15m candles into MarketCandle table for historical indexing
    if (validCandles.length > 0) {
      try {
        const records = validCandles.map((c: any) => ({
          symbol: sym,
          interval: '15m',
          timestamp: new Date(c.date),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: BigInt(Math.round(c.volume || 0)),
        }));

        await prisma.marketCandle.createMany({
          data: records,
          skipDuplicates: true,
        });
      } catch (dbErr: any) {
        console.warn(`MarketCandle 15m bulk insert warning for ${datasetName}:`, dbErr?.message);
      }
    }

    return NextResponse.json({
      message: `Research dataset '${datasetName}' approved and persisted successfully`,
      dataset,
    });
  } catch (err: any) {
    console.error('Failed to create research dataset:', err);
    return NextResponse.json({ error: err.message || 'Failed to save dataset' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Dataset ID required' }, { status: 400 });
    }

    await prisma.researchDataset.delete({ where: { id } });

    return NextResponse.json({ message: 'Dataset deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete research dataset:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete dataset' }, { status: 500 });
  }
}
