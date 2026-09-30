import { getStockCandles, Candle } from './market-data';
import { mineTickerPatterns, MiningResult } from './pattern-miner';
import { evaluateJevPrompt, JevEvaluationResult } from './jev-evaluator';
import { createStrategy } from './strategies';

export interface Phase1ResearchOutput {
  symbol: string;
  totalDailyCandles: number;
  harvestDays: number;
  dailyCandles: Candle[];
  miningResult: MiningResult;
}

export interface Phase2AnalysisOutput {
  symbol: string;
  strategyName: string;
  jevPrompt: string;
  topIndicators: any[];
  winRate: number;
  avgReturn: number;
  strategyId?: string;
}

export interface Phase3MonitoringOutput {
  symbol: string;
  livePrice: number;
  jevEvaluation: JevEvaluationResult;
  deterministicAction: 'BUY' | 'SELL' | 'HOLD' | 'SHORT' | 'NONE';
  confidencePct: number;
}

export class ThreePhasePipelineService {
  /**
   * FIRST PASS HARVEST:
   * Harvest 365 Days of 1D Daily Bars for a given Symbol.
   * All harvested candles are automatically persisted into PostgreSQL 'MarketCandle' table.
   */
  public async executePhase1Research(
    symbol: string,
    moveThresholdPct = 5.0,
    lookaheadDays = 3,
    lookbackBars = 10
  ): Promise<Phase1ResearchOutput> {
    const sym = symbol.toUpperCase().trim();

    // First Pass: 365 Days of 1D Daily Bars (Saved to PostgreSQL MarketCandle table)
    const harvestDays = 365;
    const dailyCandles = await getStockCandles(sym, harvestDays, '1d');

    // Mine Patterns across 365-day dataset
    const miningResult = mineTickerPatterns(sym, dailyCandles, moveThresholdPct, lookaheadDays, lookbackBars);

    return {
      symbol: sym,
      totalDailyCandles: dailyCandles.length,
      harvestDays,
      dailyCandles,
      miningResult,
    };
  }

  /**
   * PHASE 2: ANALYSIS
   */
  public async executePhase2Analysis(
    research: Phase1ResearchOutput,
    creatorId = 'demo-user-1'
  ): Promise<Phase2AnalysisOutput> {
    const { miningResult } = research;

    const jevEval = await evaluateJevPrompt(research.symbol, miningResult.jevPrompt);

    let strategyId: string | undefined;
    try {
      const strategy = await createStrategy({
        symbol: research.symbol,
        name: `${research.symbol} Typeface.ai JEV Strategy`,
        description: `365d First-Pass Strategy for ${research.symbol}`,
        creatorId,
        moveThresholdPct: miningResult.moveThresholdPct,
        lookaheadDays: miningResult.lookaheadDays,
        lookbackBars: miningResult.lookbackBars,
        topIndicators: miningResult.topIndicators,
        jevPrompt: miningResult.jevPrompt,
        actionScores: jevEval.probabilities,
        winRate: miningResult.winRate,
        avgReturn: miningResult.avgReturn,
      });
      strategyId = strategy.id;
    } catch (err) {
      console.warn('Strategy save fallback:', err);
    }

    return {
      symbol: research.symbol,
      strategyName: `${research.symbol} Typeface.ai JEV Strategy`,
      jevPrompt: miningResult.jevPrompt,
      topIndicators: miningResult.topIndicators,
      winRate: miningResult.winRate,
      avgReturn: miningResult.avgReturn,
      strategyId,
    };
  }

  /**
   * PHASE 3: MONITORING
   */
  public async executePhase3Monitoring(
    symbol: string,
    jevPrompt: string
  ): Promise<Phase3MonitoringOutput> {
    const sym = symbol.toUpperCase();
    const jevEval = await evaluateJevPrompt(sym, jevPrompt);

    let action = jevEval.topAction as any;
    if (action === 'LONG') action = 'HOLD';

    return {
      symbol: sym,
      livePrice: 128.50,
      jevEvaluation: jevEval,
      deterministicAction: action,
      confidencePct: jevEval.topConfidence,
    };
  }
}

export const threePhasePipeline = new ThreePhasePipelineService();
