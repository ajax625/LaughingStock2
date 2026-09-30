import { Candle } from './market-data';

export interface ConvictionDetectorParams {
  x: number;      // Volume MA window (default: 20)
  V_min: number;  // RVOL threshold multiplier (default: 1.3)
  y: number;      // Median Price MA window (default: 1)
  M: number;      // Minimum Range % threshold (default: 3.5)
  z: number;      // Gap MA window (default: 20)
}

export interface EnrichedCandle extends Candle {
  volumeMA: number;
  rvol: number;
  medianPrice: number;
  medianPriceMA: number;
  rangePct: number;
  gapPct: number;
  gapMA: number;
  gapRatio: number;
  isConvictionDay: boolean;
  convictionReason?: string;
  direction?: 'BULLISH' | 'BEARISH';
}

export interface ConvictionDetectorResult {
  symbol: string;
  params: ConvictionDetectorParams;
  totalCandles: number;
  convictionCount: number;
  enrichedCandles: EnrichedCandle[];
  candidates: EnrichedCandle[];
}

export const DEFAULT_CONVICTION_PARAMS: ConvictionDetectorParams = {
  x: 20,
  V_min: 1.3,
  y: 1,
  M: 3.5,
  z: 20,
};

/**
 * Post-Open Conviction Day Detector Engine
 * Enriches market candle datasets with VolumeMA(x), RVOL, MedianPriceMA(y), Range%, Gap, GapMA(z)
 * Evaluates the 3-condition Conviction Day Detection Rule:
 * 1. RVOL_t > V_min
 * 2. (Open_t - MedianPriceMA(y)_t) * (Close_t - MedianPriceMA(y)_t) < 0
 * 3. Range%_t > M
 */
export function processConvictionDetector(
  symbol: string,
  candles: Candle[],
  userParams: Partial<ConvictionDetectorParams> = {}
): ConvictionDetectorResult {
  const p: ConvictionDetectorParams = { ...DEFAULT_CONVICTION_PARAMS, ...userParams };
  const sym = symbol.toUpperCase().trim();

  if (!candles || candles.length === 0) {
    return {
      symbol: sym,
      params: p,
      totalCandles: 0,
      convictionCount: 0,
      enrichedCandles: [],
      candidates: [],
    };
  }

  // 1. First Pass: Compute Median Price per candle
  const rawMedians = candles.map((c) => (c.high + c.low) / 2.0);

  // 2. Compute Gap % per candle
  const rawGaps: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close || candles[i].open;
    const gap = ((candles[i].open - prevClose) / prevClose) * 100.0;
    rawGaps.push(Number(gap.toFixed(2)));
  }

  // 3. Enrich Dataset
  const enrichedCandles: EnrichedCandle[] = candles.map((c, i) => {
    // VolumeMA(x) & RVOL
    const startX = Math.max(0, i - p.x + 1);
    const volSlice = candles.slice(startX, i + 1).map((k) => k.volume);
    const volMA = volSlice.reduce((acc, v) => acc + v, 0) / volSlice.length;
    const rvol = Number((c.volume / (volMA || 1)).toFixed(2));

    // MedianPrice & MedianPriceMA(y)
    const medianPrice = Number(rawMedians[i].toFixed(2));
    const startY = Math.max(0, i - p.y + 1);
    const medSlice = rawMedians.slice(startY, i + 1);
    const medianPriceMA = Number((medSlice.reduce((acc, m) => acc + m, 0) / medSlice.length).toFixed(2));

    // Range %
    const rangePct = Number((((c.high - c.low) / (c.open || 1)) * 100.0).toFixed(2));

    // Gap & GapMA(z)
    const gapPct = rawGaps[i];
    const startZ = Math.max(1, i - p.z + 1);
    const absGapSlice = rawGaps.slice(startZ, i + 1).map((g) => Math.abs(g));
    const gapMA = Number((absGapSlice.reduce((acc, g) => acc + g, 0) / (absGapSlice.length || 1)).toFixed(2));
    const gapRatio = Number((gapPct / (gapMA || 1)).toFixed(2));

    // Evaluate 3 Conviction Day Conditions
    const cond1_volume = rvol > p.V_min;
    const cond2_straddle = (c.open - medianPriceMA) * (c.close - medianPriceMA) < 0;
    const cond3_range = rangePct > p.M;

    const isConvictionDay = cond1_volume && cond2_straddle && cond3_range;
    const direction: 'BULLISH' | 'BEARISH' = c.close >= c.open ? 'BULLISH' : 'BEARISH';

    const reasons: string[] = [];
    if (cond1_volume) reasons.push(`RVOL (${rvol}x > ${p.V_min}x)`);
    if (cond2_straddle) reasons.push(`Range Straddle (Midpoint $${medianPriceMA})`);
    if (cond3_range) reasons.push(`Range Width (${rangePct}% > ${p.M}%)`);

    return {
      ...c,
      volumeMA: Math.round(volMA),
      rvol,
      medianPrice,
      medianPriceMA,
      rangePct,
      gapPct,
      gapMA,
      gapRatio,
      isConvictionDay,
      convictionReason: isConvictionDay ? reasons.join(' • ') : undefined,
      direction,
      highlight: isConvictionDay,
    };
  });

  const candidates = enrichedCandles.filter((c) => c.isConvictionDay);

  return {
    symbol: sym,
    params: p,
    totalCandles: enrichedCandles.length,
    convictionCount: candidates.length,
    enrichedCandles,
    candidates,
  };
}
