import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  // 1. Create Demo User 1 (quant_guru)
  const user1 = await prisma.user.upsert({
    where: { email: 'quant@laughingstock.app' },
    update: {},
    create: {
      name: 'quant_guru',
      email: 'quant@laughingstock.app',
      password,
      portfolio: {
        create: {
          cash: 42350.0,
          positions: {
            create: [
              { symbol: 'NVDA', quantity: 150, avgCost: 110.20 },
              { symbol: 'AAPL', quantity: 200, avgCost: 185.00 },
              { symbol: 'TSLA', quantity: 100, avgCost: 240.00 },
              { symbol: 'AMD',  quantity: 120, avgCost: 152.00 },
            ],
          },
          trades: {
            create: [
              { symbol: 'NVDA', type: 'BUY', quantity: 50, price: 110.20, total: 5510.00 },
              { symbol: 'AAPL', type: 'BUY', quantity: 100, price: 185.00, total: 18500.00 },
            ],
          },
        },
      },
    },
  });

  // 2. Create Shared Ticker Strategies
  await prisma.strategy.create({
    data: {
      symbol: 'NVDA',
      name: 'EMA Cross + RSI Rebound Miner',
      creatorId: user1.id,
      moveThresholdPct: 5.0,
      lookaheadDays: 3,
      lookbackBars: 10,
      topIndicators: JSON.stringify([
        { name: '20-EMA / 50-SMA Golden Cross', conclusiveness: 92.1 },
        { name: 'RSI (14) Oversold Rebound', conclusiveness: 88.5 },
      ]),
      jevPrompt: '[JEV PROMPT] NVDA 10-bar pre-move fingerprint...',
      actionScores: JSON.stringify({ BUY: 78.5, LONG: 14.2, SELL: 4.8, SHORT: 2.0, NONE: 0.5 }),
      winRate: 84.5,
      avgReturn: 12.8,
      isPublic: true,
      signals: {
        create: {
          symbol: 'NVDA',
          action: 'BUY',
          confidence: 84.5,
          triggerPrice: 128.5,
          rationale: 'RSI oversold rebound + 20-EMA Golden Cross detected on 3-day pre-move window.',
          status: 'ACTIVE',
        },
      },
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
