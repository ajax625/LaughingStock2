import { prisma } from '@/lib/prisma';
import { getStockCandles, getAlpacaClock } from '@/lib/market-data';
import { enrichCandlesWithChande } from '@/lib/chande-indicators';

/**
 * Get date parts in target timezone (default ET / America/New_York)
 */
export function getZonedParts(date: Date = new Date(), timeZone: string = 'America/New_York') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const hour = parseInt(partMap.hour || '0', 10);
  const minute = parseInt(partMap.minute || '0', 10);
  const weekdayStr = partMap.weekday || '';
  
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = dayMap[weekdayStr] ?? date.getDay();

  return { day, hour, minute, weekdayStr, partMap };
}

/**
 * Off-Market Hours Validator
 * Queries Alpaca Clock API (/v2/clock) for official market open/close status.
 * Fallback: Mon-Fri 9:30 AM - 4:00 PM ET = regular market hours (standby).
 */
export async function isOffMarketHours(date: Date = new Date(), timeZone: string = 'America/New_York'): Promise<boolean> {
  try {
    const clock = await getAlpacaClock();
    if (clock && typeof clock.is_open === 'boolean') {
      return !clock.is_open;
    }
  } catch (e) {
    console.warn('[Harvester] Alpaca clock API query error, using ET fallback math:', e);
  }

  const { day, hour, minute } = getZonedParts(date, timeZone);

  // Sat & Sun: All day off-market
  if (day === 0 || day === 6) {
    return true;
  }

  // Regular Market Hours in ET: Mon-Fri 9:30 AM to 4:00 PM ET
  const isMarketOpen = (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;
  return !isMarketOpen;
}

export async function getNextCronRunTime(currentDate: Date = new Date(), timeZone: string = 'America/New_York') {
  const now = new Date(currentDate);

  try {
    const clock = await getAlpacaClock();
    if (clock) {
      const nextOpenDate = new Date(clock.next_open);
      const timeStr = nextOpenDate.toLocaleTimeString('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });
      const dateStr = nextOpenDate.toLocaleDateString('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      return {
        nextRun: clock.next_open,
        isOffMarketNow: !clock.is_open,
        formatted: `${timeStr} (${dateStr})`,
      };
    }
  } catch (e) {}

  const { minute } = getZonedParts(now, timeZone);
  const nextMinSlot = Math.ceil((minute + 0.1) / 15) * 15;
  const candidate = new Date(now.getTime() + (nextMinSlot - minute) * 60 * 1000);

  const timeStr = candidate.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  const dateStr = candidate.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return {
    nextRun: candidate.toISOString(),
    isOffMarketNow: true,
    formatted: `${timeStr} (${dateStr})`,
  };
}

export interface HarvestOptions {
  force?: boolean;
  datasetId?: string;
}

export async function processPhase2Harvesting(options: HarvestOptions = {}) {
  const { force = false, datasetId } = options;
  const now = new Date();
  const offMarket = await isOffMarketHours(now);
  const nextSchedule = await getNextCronRunTime(now);

  if (!offMarket && !force) {
    return {
      success: true,
      skipped: true,
      reason: 'Regular market hours active (Mon-Fri 9:30 AM - 4:00 PM ET). Off-market 5m harvester on standby.',
      timestamp: now.toISOString(),
      offMarketHours: false,
      nextCronRun: nextSchedule,
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
          const enriched5m = enrichCandlesWithChande(fiveMinCandles);

          const records = enriched5m.map((c) => ({
            datasetId: dataset.id,
            symbol: dataset.symbol,
            interval: '5m',
            timestamp: new Date(c.date),
            open: Number(c.open || 0),
            high: Number(c.high || 0),
            low: Number(c.low || 0),
            close: Number(c.close || 0),
            volume: BigInt(Math.round(c.volume || 0)),
            indicators: {
              cmo: c.cmo,
              trendScore: c.trendScore,
              vidya: c.vidya,
              dmi: c.dmi,
              rvol: c.rvol,
              volumeMA: c.volumeMA,
              medianPriceMA: c.medianPriceMA,
            },
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
