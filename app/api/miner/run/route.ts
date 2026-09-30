import { NextResponse } from 'next/server';
import { getStockCandles } from '@/lib/market-data';
import { mineTickerPatterns } from '@/lib/pattern-miner';
import { evaluateJevPrompt } from '@/lib/jev-evaluator';

export async function POST(req: Request) {
  try {
    const { symbol, moveThresholdPct, lookaheadDays, lookbackBars } = await req.json();

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const sym = symbol.toUpperCase();
    const pct = Number(moveThresholdPct || 5.0);
    const days = Number(lookaheadDays || 3);
    const bars = Number(lookbackBars || 10);

    // 1. Fetch Candle History
    const candles = await getStockCandles(sym, 90);

    // 2. Mine Historical Patterns
    const minedResult = mineTickerPatterns(sym, candles, pct, days, bars);

    // 3. Evaluate Prompt with Jev Engine
    const jevEvaluation = await evaluateJevPrompt(sym, minedResult.jevPrompt);

    return NextResponse.json({
      miningResult: minedResult,
      jevEvaluation,
    });
  } catch (err) {
    console.error('Failed to run pattern miner:', err);
    return NextResponse.json({ error: 'Pattern miner failed' }, { status: 500 });
  }
}
