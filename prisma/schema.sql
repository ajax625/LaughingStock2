-- LaughingStock Complete Database Schema SQL Script
-- Database: PostgreSQL

-- 1. Create User Table
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- 2. Create Portfolio Table
CREATE TABLE IF NOT EXISTS "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 100000.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Portfolio_userId_key" ON "Portfolio"("userId");

-- 3. Create Position Table
CREATE TABLE IF NOT EXISTS "Position" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "avgCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Position_portfolioId_symbol_key" ON "Position"("portfolioId", "symbol");

-- 4. Create Trade Table
CREATE TABLE IF NOT EXISTS "Trade" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- 5. Create Strategy Table
CREATE TABLE IF NOT EXISTS "Strategy" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "moveThresholdPct" DOUBLE PRECISION NOT NULL,
    "lookaheadDays" INTEGER NOT NULL,
    "lookbackBars" INTEGER NOT NULL,
    "topIndicators" TEXT NOT NULL,
    "jevPrompt" TEXT NOT NULL,
    "actionScores" TEXT NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "avgReturn" DOUBLE PRECISION NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- 6. Create Signal Table
CREATE TABLE IF NOT EXISTS "Signal" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "triggerPrice" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- 7. Create MarketCandle Table
CREATE TABLE IF NOT EXISTS "MarketCandle" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL DEFAULT '1d',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MarketCandle_symbol_interval_timestamp_key" ON "MarketCandle"("symbol", "interval", "timestamp");
CREATE INDEX IF NOT EXISTS "MarketCandle_symbol_timestamp_idx" ON "MarketCandle"("symbol", "timestamp");

-- 8. Create ResearchDataset Table (Named Datasets: SYMBOL_MMDDYYYY_X)
CREATE TABLE IF NOT EXISTS "ResearchDataset" (
    "id" TEXT NOT NULL,
    "datasetName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "convictionDate" TEXT NOT NULL,
    "roiPct" DOUBLE PRECISION NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "barCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED_FOR_RESEARCH',
    "candles" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchDataset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ResearchDataset_datasetName_key" ON "ResearchDataset"("datasetName");
CREATE INDEX IF NOT EXISTS "ResearchDataset_symbol_idx" ON "ResearchDataset"("symbol");
