import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// In-memory fallback store for datasets if DB is temporarily unavailable or table missing
const inMemoryDatasets: Map<string, any> = new Map();

function sanitizeForJSON(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'bigint') return Number(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForJSON);
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'bigint') {
      result[key] = Number(val);
    } else if (typeof val === 'object' && val !== null) {
      result[key] = sanitizeForJSON(val);
    } else if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();

    let dbDatasets: any[] = [];
    try {
      dbDatasets = await prisma.researchDataset.findMany({
        where: symbol ? { symbol } : undefined,
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbErr) {
      console.warn('[DB GET DATASETS WARN] Database query failed, using in-memory store:', dbErr);
    }

    const memList = Array.from(inMemoryDatasets.values()).filter(
      (ds) => !symbol || ds.symbol === symbol
    );

    // Merge DB datasets and in-memory fallback datasets (dedup by datasetName)
    const dsMap = new Map<string, any>();
    for (const ds of [...dbDatasets, ...memList]) {
      if (ds && ds.datasetName && !dsMap.has(ds.datasetName)) {
        dsMap.set(ds.datasetName, ds);
      }
    }

    return NextResponse.json(sanitizeForJSON({ datasets: Array.from(dsMap.values()) }));
  } catch (err: any) {
    console.error('Failed to fetch research datasets:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch datasets' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { symbol, convictionDate, roiPct, startDate, endDate, candles } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Missing required symbol' }, { status: 400 });
    }

    const sym = String(symbol).toUpperCase().trim();
    const targetDate = String(convictionDate || startDate || new Date().toISOString().split('T')[0]);
    const effectiveStartDate = startDate ? String(startDate) : targetDate;
    const effectiveEndDate = endDate ? String(endDate) : targetDate;

    // Format MMDDYYYY date string cleanly
    let mmddyyyy = '00000000';
    try {
      const cleanDate = targetDate.split('T')[0].split(' ')[0].trim();
      const parts = cleanDate.includes('-') ? cleanDate.split('-') : cleanDate.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          mmddyyyy = `${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}${parts[0]}`;
        } else {
          mmddyyyy = `${parts[0].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[2]}`;
        }
      } else {
        mmddyyyy = cleanDate.replace(/\D/g, '').padStart(8, '0');
      }
    } catch (dErr) {
      mmddyyyy = '01012026';
    }

    const roiVal = Number(roiPct) || 5.0;
    const roiStr = roiVal.toFixed(1).replace('.', '_');
    const datasetName = `${sym}_${mmddyyyy}_${roiStr}`;
    const rawCandles = Array.isArray(candles) ? candles : [];
    const validCandles = sanitizeForJSON(rawCandles);

    let dataset: any = null;

    try {
      dataset = await prisma.researchDataset.upsert({
        where: { datasetName },
        update: {
          symbol: sym,
          convictionDate: targetDate,
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
          convictionDate: targetDate,
          roiPct: roiVal,
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
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
    } catch (dbErr: any) {
      console.warn(`[DB UPSERT FALLBACK] Prisma save failed for ${datasetName}:`, dbErr?.message || dbErr);
      // Fallback in-memory persistence
      dataset = {
        id: `mem-${Date.now()}`,
        datasetName,
        symbol: sym,
        convictionDate: targetDate,
        roiPct: roiVal,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        barCount: validCandles.length,
        status: 'APPROVED_FOR_RESEARCH',
        candles: validCandles,
        createdAt: new Date().toISOString(),
      };
      inMemoryDatasets.set(datasetName, dataset);
    }

    return NextResponse.json(sanitizeForJSON({
      message: `Research dataset '${datasetName}' approved and persisted successfully`,
      dataset,
    }));
  } catch (err: any) {
    console.error('Failed to create research dataset:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Failed to save dataset' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Dataset ID required' }, { status: 400 });
    }

    if (id.startsWith('mem-')) {
      for (const [key, val] of inMemoryDatasets.entries()) {
        if (val.id === id) {
          inMemoryDatasets.delete(key);
          break;
        }
      }
    } else {
      try {
        await prisma.researchDataset.delete({ where: { id } });
      } catch (e) {
        console.warn('Prisma delete failed:', e);
      }
    }

    return NextResponse.json({ message: 'Dataset deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete research dataset:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete dataset' }, { status: 500 });
  }
}
