import { JevEvaluationResult } from '../jev-evaluator';

export interface JevGatewayOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export class JevGatewayMiddleware {
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: JevGatewayOptions = {}) {
    this.timeoutMs = options.timeoutMs || 4000;
    this.maxRetries = options.maxRetries || 2;
  }

  public sanitizePrompt(prompt: string): string {
    return prompt.trim().replace(/[<>{}]/g, '');
  }

  public async processEvaluation(
    symbol: string,
    prompt: string,
    evaluator: (sym: string, p: string) => Promise<JevEvaluationResult>
  ): Promise<JevEvaluationResult> {
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    let lastError: any = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Jev Gateway Timeout')), this.timeoutMs)
        );

        const evalPromise = evaluator(symbol, sanitizedPrompt);
        const result = (await Promise.race([evalPromise, timeoutPromise])) as JevEvaluationResult;
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`Jev Gateway attempt ${attempt} failed for ${symbol}:`, err);
      }
    }

    // Fallback Result on failure
    return {
      symbol: symbol.toUpperCase(),
      probabilities: { BUY: 50.0, HOLD: 20.0, SELL: 15.0, SHORT: 10.0, NONE: 5.0 },
      topAction: 'BUY',
      topConfidence: 50.0,
      rationale: `Typeface.ai JEV Gateway resilient fallback triggered after ${this.maxRetries} attempts. (${lastError?.message || 'Timeout'})`,
    };
  }
}

export const jevGatewayMiddleware = new JevGatewayMiddleware();
