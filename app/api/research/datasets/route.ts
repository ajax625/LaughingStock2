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

    if (!symbol || !convictionDate) {
      return NextResponse.json({ error: 'Missing required symbol or convictionDate' }, { status: 400 });
    }

    const sym = symbol.toUpperCase().trim();
    const effectiveStartDate = startDate || convictionDate;
    const effectiveEndDate = endDate || convictionDate;

    // Bulletproof MMDDYYYY date formatter
    let mmddyyyy = '00000000';
    try {
      const cleanDate = convictionDate.split('T')[0].split(' ')[0];
      const parts = cleanDate.includes('-') ? cleanDate.split('-') : cleanDate.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          mmddyyyy = `${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}${parts[0]}`;
        } else {
          // MM/DD/YYYY
          mmddyyyy = `${parts[0].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[2]}`;
        }
      } else {
        mmddyyyy = cleanDate.replace(/\D/g, '');
      }
    } catch (dErr) {
      mmddyyyy = new Date(convictionDate).toISOString().split('T')[0].replace(/-/g, '');
    }

    const roiVal = Number(roiPct) || 5.0;
    const roiStr = roiVal.toFixed(1).replace('.', '_');
    
    // Dataset Name format: e.g. AAPL_09102026_5_2
    const datasetName = `${sym}_${mmddyyyy}_${roiStr}`;
    const validCandles = Array.isArray(candles) ? candles : [];

    console.log(`[DB RESEARCH DATASET] Upserting dataset '${datasetName}' for ${sym} (Candles: ${validCandles.length})...`);

    const dataset = await prisma.researchDataset.upsert({
      where: { datasetName },
      update: {
        symbol: sym,
        convictionDate,
        roiPct: roiVal,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        barCount: validCandles.length,
        status: 'APPROVED_FOR_RESEARCH',
        candles: validCandles,
      },
      create: {
        datasetName,
        symbol: sym,
        convictionDate,
        roiPct: roiVal,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        barCount: validCandles.length,
        status: 'APPROVED_FOR_RESEARCH',
        candles: validCandles,
      },
    });

    console.log(`[DB RESEARCH DATASET SUCCESS] Created/Updated dataset '${dataset.datasetName}' with ID ${dataset.id}`);

    // Also persist 15m candles into MarketCandle table for historical indexing
    if (validCandles.length > 0) {
      try {
        const records = validCandles.map((c: any) => ({
          symbol: sym,
          interval: '15m',
          timestamp: new Date(c.date),
          open: Number(c.open || 0),
          high: Number(c.high || 0),
          low: Number(c.low || 0),
          close: Number(c.close || 0),
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
    console.error('Failed to create research dataset in DB:', err?.message || err);
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
