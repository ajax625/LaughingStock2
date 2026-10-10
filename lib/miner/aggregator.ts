export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  highlight?: boolean;
}

export type HarvestTimeframe = '5m' | '1h' | '2h' | '4h' | '1d' | '10d';

/**
 * Pure client-safe Candle Timeframe Aggregator (5m -> 1h, 2h, 4h, 1d, 10d)
 */
export function aggregateCandles(candles: Candle[], interval: HarvestTimeframe): Candle[] {
  if (!candles || candles.length === 0) return [];
  if (interval === '5m') return candles;

  const barsPerBucketMap: Record<HarvestTimeframe, number> = {
    '5m': 1,
    '1h': 12,    // 12 * 5m = 60m (1 hour)
    '2h': 24,    // 24 * 5m = 120m (2 hours)
    '4h': 48,    // 48 * 5m = 240m (4 hours)
    '1d': 78,    // 78 * 5m = 390m (1 trading day session)
    '10d': 780,  // 10 trading sessions
  };

  const bucketSize = barsPerBucketMap[interval] || 1;
  const result: Candle[] = [];

  for (let i = 0; i < candles.length; i += bucketSize) {
    const chunk = candles.slice(i, i + bucketSize);
    if (chunk.length === 0) continue;

    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    let high = chunk[0].high;
    let low = chunk[0].low;
    let volume = 0;

    for (const b of chunk) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume || 0;
    }

    result.push({
      date: chunk[0].date,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });
  }

  return result;
}

/**
 * Format any date or timestamp into US Eastern Time (America/New_York - EST/EDT)
 * Returns string in format: YYYY-MM-DD HH:mm
 */
export function formatToET(dateInput: string | Date | number): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}
