import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStockQuote } from '@/lib/market-data';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id || 'demo-user-1';

  try {
    let portfolio = await prisma.portfolio.findUnique({
      where: { userId },
      include: {
        positions: true,
        trades: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          userId,
          cash: 100000.0,
          positions: {
            create: [
              { symbol: 'NVDA', quantity: 150, avgCost: 110.20 },
              { symbol: 'AAPL', quantity: 200, avgCost: 185.00 },
              { symbol: 'TSLA', quantity: 100, avgCost: 240.00 },
              { symbol: 'AMD',  quantity: 120, avgCost: 152.00 },
            ],
          },
        },
        include: {
          positions: true,
          trades: true,
        },
      });
    }

    // Enrich positions with live market prices
    const enrichedPositions = await Promise.all(
      portfolio.positions.map(async (pos) => {
        try {
          const quote = await getStockQuote(pos.symbol);
          const marketValue = Number((pos.quantity * quote.price).toFixed(2));
          const totalCost = Number((pos.quantity * pos.avgCost).toFixed(2));
          const unrealizedPL = Number((marketValue - totalCost).toFixed(2));
          const unrealizedPLPct = Number(((unrealizedPL / totalCost) * 100).toFixed(2));

          return {
            ...pos,
            currentPrice: quote.price,
            marketValue,
            unrealizedPL,
            unrealizedPLPct,
            available: true,
          };
        } catch (err: any) {
          // Explicit Data Unavailable State
          return {
            ...pos,
            currentPrice: pos.avgCost,
            marketValue: pos.quantity * pos.avgCost,
            unrealizedPL: 0,
            unrealizedPLPct: 0,
            available: false,
            error: err.message,
          };
        }
      })
    );

    const positionsValue = enrichedPositions.reduce((acc, p) => acc + p.marketValue, 0);
    const netWorth = Number((portfolio.cash + positionsValue).toFixed(2));
    const totalCostBasis = enrichedPositions.reduce((acc, p) => acc + (p.quantity * p.avgCost), 0);
    const totalUnrealizedPL = Number((positionsValue - totalCostBasis).toFixed(2));

    return NextResponse.json({
      portfolio: {
        id: portfolio.id,
        cash: portfolio.cash,
        netWorth,
        positionsValue,
        totalUnrealizedPL,
        positions: enrichedPositions,
        trades: portfolio.trades,
      },
    });
  } catch (err: any) {
    console.error('Portfolio GET failed:', err);
    return NextResponse.json(
      { error: `Portfolio data unavailable. (${err.message || 'Database error'})` },
      { status: 500 }
    );
  }
}
