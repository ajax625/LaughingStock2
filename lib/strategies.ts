import { prisma } from './prisma';
import { getStockQuote } from './market-data';
import { evaluateJevPrompt } from './jev-evaluator';

export async function getSharedStrategies() {
  try {
    const dbStrategies = await prisma.strategy.findMany({
      where: { isPublic: true },
      include: {
        creator: { select: { name: true, email: true } },
        signals: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return dbStrategies;
  } catch (error) {
    console.warn('Prisma strategy fetch failed, returning default app strategies:', error);
    return DEFAULT_SHARED_STRATEGIES;
  }
}

export async function createStrategy(data: {
  symbol: string;
  name: string;
  description?: string;
  creatorId: string;
  moveThresholdPct: number;
  lookaheadDays: number;
  lookbackBars: number;
  topIndicators: any[];
  jevPrompt: string;
  actionScores: any;
  winRate: number;
  avgReturn: number;
}) {
  try {
    const strategy = await prisma.strategy.create({
      data: {
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        description: data.description || '',
        creatorId: data.creatorId,
        moveThresholdPct: data.moveThresholdPct,
        lookaheadDays: data.lookaheadDays,
        lookbackBars: data.lookbackBars,
        topIndicators: JSON.stringify(data.topIndicators),
        jevPrompt: data.jevPrompt,
        actionScores: JSON.stringify(data.actionScores),
        winRate: data.winRate,
        avgReturn: data.avgReturn,
        isPublic: true,
      },
    });

    // Create Initial Signal Trigger
    const jevEval = await evaluateJevPrompt(data.symbol, data.jevPrompt);
    const quote = await getStockQuote(data.symbol);

    await prisma.signal.create({
      data: {
        strategyId: strategy.id,
        symbol: data.symbol.toUpperCase(),
        action: jevEval.topAction,
        confidence: jevEval.topConfidence,
        triggerPrice: quote.price,
        rationale: jevEval.rationale,
        status: 'ACTIVE',
      },
    });

    return strategy;
  } catch (err) {
    console.error('Failed to create strategy in DB:', err);
    throw err;
  }
}

export const DEFAULT_SHARED_STRATEGIES = [
  {
    id: 'strat-1',
    symbol: 'NVDA',
    name: 'EMA Cross + RSI Rebound Miner',
    creator: { name: 'quant_guru', email: 'quant@laughingstock.app' },
    moveThresholdPct: 5.0,
    lookaheadDays: 3,
    lookbackBars: 10,
    topIndicators: JSON.stringify([
      { name: '20-EMA / 50-SMA Golden Cross', conclusiveness: 92.1 },
      { name: 'RSI (14) Oversold Rebound', conclusiveness: 88.5 },
      { name: 'Volume Surge (2.3x Avg)', conclusiveness: 86.0 },
    ]),
    jevPrompt: '[JEV PROMPT] NVDA 10-bar pre-move fingerprint...',
    actionScores: JSON.stringify({ BUY: 78.5, LONG: 14.2, SELL: 4.8, SHORT: 2.0, NONE: 0.5 }),
    winRate: 84.5,
    avgReturn: 12.8,
    isPublic: true,
    signals: [
      {
        id: 'sig-1',
        symbol: 'NVDA',
        action: 'BUY',
        confidence: 84.5,
        triggerPrice: 128.5,
        rationale: 'RSI oversold rebound + 20-EMA Golden Cross detected on 3-day pre-move window.',
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'strat-2',
    symbol: 'AMD',
    name: 'Bollinger Upper Rejection Short',
    creator: { name: 'sarah_trader', email: 'sarah@laughingstock.app' },
    moveThresholdPct: 6.0,
    lookaheadDays: 4,
    lookbackBars: 8,
    topIndicators: JSON.stringify([
      { name: 'Bollinger Band Upper Rejection', conclusiveness: 90.4 },
      { name: 'Volume Spike Pre-Drop', conclusiveness: 84.2 },
    ]),
    jevPrompt: '[JEV PROMPT] AMD 8-bar pre-move fingerprint...',
    actionScores: JSON.stringify({ SHORT: 76.0, SELL: 15.0, BUY: 4.0, LONG: 3.0, NONE: 2.0 }),
    winRate: 76.0,
    avgReturn: 9.4,
    isPublic: true,
    signals: [
      {
        id: 'sig-2',
        symbol: 'AMD',
        action: 'SHORT',
        confidence: 76.0,
        triggerPrice: 141.8,
        rationale: 'Bollinger Upper Band rejection with heavy volume spike pre-drop pattern.',
        createdAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: 'strat-3',
    symbol: 'AAPL',
    name: '50-SMA Support Breakout',
    creator: { name: 'alex_m', email: 'alex@laughingstock.app' },
    moveThresholdPct: 4.0,
    lookaheadDays: 3,
    lookbackBars: 12,
    topIndicators: JSON.stringify([
      { name: '50-SMA Support Bounce', conclusiveness: 94.0 },
      { name: 'MACD Histogram Flip', conclusiveness: 87.5 },
    ]),
    jevPrompt: '[JEV PROMPT] AAPL 12-bar pre-move fingerprint...',
    actionScores: JSON.stringify({ LONG: 91.0, BUY: 7.0, SELL: 1.0, SHORT: 0.5, NONE: 0.5 }),
    winRate: 91.0,
    avgReturn: 7.2,
    isPublic: true,
    signals: [
      {
        id: 'sig-3',
        symbol: 'AAPL',
        action: 'LONG',
        confidence: 91.0,
        triggerPrice: 224.3,
        rationale: 'Consolidation breakout above 50-SMA resistance.',
        createdAt: new Date().toISOString(),
      },
    ],
  },
];
