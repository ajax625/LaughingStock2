-- CreateTable
CREATE TABLE "ResearchDataset" (
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

-- CreateIndex
CREATE UNIQUE INDEX "ResearchDataset_datasetName_key" ON "ResearchDataset"("datasetName");

-- CreateIndex
CREATE INDEX "ResearchDataset_symbol_idx" ON "ResearchDataset"("symbol");
