import { prisma } from '@/lib/prisma';
import { getStockCandles } from '@/lib/market-data';

/**
 * Off-Market Hours Validator
 * Active Windows:
 * 1. Mon-Fri 15:00 - 23:59 (3:00 PM to Midnight)
 * 2. Mon-Fri 00:00 - 05:59 (Midnight to 6:00 AM)
 * 3. Sat & Sun (All Day 24h)
 * 
 * Regular Market Hours Inactive Window: Mon-Fri 06:00 - 14:59 (6:00 AM to 3:00 PM)
 */
export function isOffMarketHours(date: Date = new Date()): boolean {
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = date.getHours(); // 0-23

  // Weekends: Saturday (6) and Sunday (0) are ALL DAY off-market
  if (day === 0 || day === 6) {
    return true;
  }

  // Mon-Fri: Off-market from 3:00 PM (15:00) to Midnight (23:59) AND Midnight to 6:00 AM (05:59)
  if (hour >= 15 || hour < 6) {
    return true;
  }

  // Mon-Fri 6:00 AM to 3:00 PM is regular market hours
  return false;
}

export interface HarvestOptions {
  force?: boolean;
  datasetId?: string;
}

export async function processPhase2Harvesting(options: HarvestOptions = {}) {
  const { force = false, datasetId } = options;
  const now = new Date();
  const offMarket = isOffMarketHours(now);

  if (!offMarket && !force) {
    return {
      success: true,
      skipped: true,
      reason: 'Regular market hours active (Mon-Fri 6:00 AM - 3:00 PM). Off-market 5m harvester on standby.',
      timestamp: now.toISOString(),
      offMarketHours: false,
    };
  }

  try {
    const whereCondition: any = datasetId
      ? { id: datasetId }
      : { status: { in: ['APPROVED_FOR_RESEARCH', 'PENDING_HARVEST'] } };

    const pendingDatasets = await prisma.researchDataset.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingDatasets.length === 0) {
      return {
        success: true,
        processedCount: 0,
        message: 'No pending research datasets queued for 5m harvesting.',
        timestamp: now.toISOString(),
        offMarketHours: offMarket,
      };
    }

    const results = [];

    for (const dataset of pendingDatasets) {
      try {
        // Fetch 5-minute candles for the dataset date range from Alpaca / Market Provider
        const fiveMinCandles = await getStockCandles(
          dataset.symbol,
          30,
          '5m',
          dataset.startDate,
          dataset.endDate,
          false // handle custom foreign-key linked DB write manually below
        );

        let insertedCount = 0;
        if (fiveMinCandles.length > 0) {
          const records = fiveMinCandles.map((c) => ({
            datasetId: dataset.id,
            symbol: dataset.symbol,
            interval: '5m',
            timestamp: new Date(c.date),
            open: Number(c.open || 0),
            high: Number(c.high || 0),
            low: Number(c.low || 0),
            close: Number(c.close || 0),
            volume: BigInt(Math.round(c.volume || 0)),
          }));

          const dbRes = await prisma.marketCandle.createMany({
            data: records,
            skipDuplicates: true,
          });
          insertedCount = dbRes.count;
        }

        // Update dataset status to HARVESTED_5M and record bar count
        const updatedDataset = await prisma.researchDataset.update({
          where: { id: dataset.id },
          data: {
            status: 'HARVESTED_5M',
            barCount: fiveMinCandles.length,
          },
        });

        results.push({
          datasetId: dataset.id,
          datasetName: dataset.datasetName,
          symbol: dataset.symbol,
          candlesFetched: fiveMinCandles.length,
          candlesInserted: insertedCount,
          status: updatedDataset.status,
        });
      } catch (dsErr: any) {
        console.error(`[HARVESTER ERROR] Failed 5m harvest for ${dataset.datasetName}:`, dsErr);
        results.push({
          datasetId: dataset.id,
          datasetName: dataset.datasetName,
          error: dsErr?.message || 'Harvest failed',
        });
      }
    }

    return {
      success: true,
      processedCount: results.length,
      timestamp: now.toISOString(),
      offMarketHours: offMarket,
      results,
    };
  } catch (err: any) {
    console.error('[HARVESTER CRITICAL ERROR]:', err);
    return {
      success: false,
      error: err?.message || 'Critical harvester failure',
      timestamp: now.toISOString(),
    };
  }
}
