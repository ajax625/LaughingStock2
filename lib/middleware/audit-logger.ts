export interface AuditLogEntry {
  userId: string;
  action: string;
  symbol: string;
  quantity: number;
  price: number;
  total: number;
  timestamp: string;
}

export class AuditLoggerMiddleware {
  private logs: AuditLogEntry[] = [];

  public logTrade(userId: string, action: string, symbol: string, quantity: number, price: number, total: number) {
    const entry: AuditLogEntry = {
      userId,
      action,
      symbol: symbol.toUpperCase(),
      quantity,
      price,
      total,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(entry);
    console.log(`[AUDIT LOG] ${entry.timestamp} | User: ${userId} | ${action} ${quantity} ${symbol} @ $${price} (Total: $${total})`);
  }

  public getRecentLogs(limit = 20): AuditLogEntry[] {
    return this.logs.slice(-limit);
  }
}

export const auditLoggerMiddleware = new AuditLoggerMiddleware();
