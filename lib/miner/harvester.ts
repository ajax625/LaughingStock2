import { prisma } from '@/lib/prisma';
import { getStockCandles } from '@/lib/market-data';

/**
 * Get date parts in target timezone (default PST / America/Los_Angeles)
 */
export function getZonedParts(date: Date = new Date(), timeZone: string = 'America/Los_Angeles') {
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
 * Off-Market Hours Validator (Timezone Aware - PST)
 * Active Windows:
 * 1. Mon-Fri 15:00 - 23:59 PST (3:00 PM to Midnight)
 * 2. Mon-Fri 00:00 - 05:59 PST (Midnight to 6:00 AM)
 * 3. Sat & Sun PST (All Day 24h)
 * 
 * Regular Market Hours Inactive Window: Mon-Fri 06:00 - 14:59 PST (6:00 AM to 3:00 PM)
 */
export function isOffMarketHours(date: Date = new Date(), timeZone: string = 'America/Los_Angeles'): boolean {
  const { day, hour } = getZonedParts(date, timeZone);

  // Weekends: Saturday (6) and Sunday (0) are ALL DAY off-market
  if (day === 0 || day === 6) {
    return true;
  }

  // Mon-Fri: Off-market from 3:00 PM (15:00) to Midnight (23:59) AND Midnight to 6:00 AM (05:59) PST
  if (hour >= 15 || hour < 6) {
    return true;
  }

  // Mon-Fri 6:00 AM to 3:00 PM PST is regular market hours
  return false;
}

export function getNextCronRunTime(currentDate: Date = new Date(), timeZone: string = 'America/Los_Angeles') {
  const now = new Date(currentDate);
  const { minute } = getZonedParts(now, timeZone);

  // Calculate next 15-minute slot boundary
  const nextMinSlot = Math.ceil((minute + 0.1) / 15) * 15;
  const candidate = new Date(now.getTime() + (nextMinSlot - minute) * 60 * 1000);

  // Check if candidate slot is in an active off-market window in target timezone
  if (isOffMarketHours(candidate, timeZone)) {
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
      isOffMarketNow: isOffMarketHours(now, timeZone),
      formatted: `${timeStr} (${dateStr})`,
    };
  }

  // If candidate falls in regular market hours (Mon-Fri 6am - 3pm PST), next off-market run starts at 3:00 PM today PST
  const { hour } = getZonedParts(now, timeZone);
  const afternoonRun = new Date(now.getTime() + (15 - hour) * 60 * 60 * 1000);

  const timeStr = afternoonRun.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  const dateStr = afternoonRun.toLocaleDateString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return {
    nextRun: afternoonRun.toISOString(),
    isOffMarketNow: isOffMarketHours(now, timeZone),
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
  const offMarket = isOffMarketHours(now);
  const nextSchedule = getNextCronRunTime(now);

  if (!offMarket && !force) {
    return {
      success: true,
      skipped: true,
      reason: 'Regular market hours active (Mon-Fri 6:00 AM - 3:00 PM PST). Off-market 5m harvester on standby.',
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
