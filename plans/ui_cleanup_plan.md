# UI Clean Up Implementation Plan: 4-Phase Architecture & Harvester Grid Layout (Updated)

## Goal Description
Reorganize and streamline the application navigation into a clean **4-Phase Workflow Architecture**, clean up text blurbs, place controls on the far right, split Phase 2 into a **Top 50% Harvester Grid** and **Bottom 50% Harvested Candle Chart**, and migrate strategy analysis to Phase 3.

---

## Architectural Navigation Overview

| Phase | Tab Name | Icon | Purpose & Components |
|---|---|---|---|
| **Phase 1** | **Research Studio** | `Search` / `Sliders` | Post-Open Conviction Day Detector Studio, 1D candles in memory, 15m range selection & candidate matching. |
| **Phase 2** | **Harvester** | `Database` / `Sparkles` | **5m Intraday Candle Harvester Grid & Chart Viewer**. Top 50% grid, bottom 50% candle chart for selected dataset. |
| **Phase 3** | **Analyzer** | `FlaskConical` / `Cpu` | **Analysis & Strategy Formalization** panel (migrated from Phase 2). Pre-move fingerprint mining, Typeface.ai JEV prompt construction, and JEV action score outputs. |
| **Phase 4** | **Monitoring** | `Radio` / `Activity` | **Active Signals & Execution Monitor**. Real-time JEV signals, win rate metrics, and live position alerts. |

---

## Detailed UI Changes

### 1. Sidebar Navigation (`app/page.tsx`)
- Update sidebar navigation list:
  1. `Phase 1: Research Studio` (`research`)
  2. `Phase 2: Harvester` (`harvester`)
  3. `Phase 3: Analyzer` (`analyzer`)
  4. `Phase 4: Monitoring` (`signals`)
  5. `Portfolio` (`portfolio`)
  6. `Dashboard` (`dashboard`)

---

### 2. Phase 2 Harvester Screen (Top 50% Grid & Bottom 50% Chart)

#### A. Header Toolbar & Clean Up
- **Remove Blurbs**: Strip out non-essential text blurbs (`Persisted datasets ({SYMBOL}_{MMDDYYYY}_{ROI}) ready for 5m intraday harvesting & foreign-key linkage.`).
- **Header Layout**:
  - **Left**: `Phase 2: 5m Intraday Harvester` title + Datasets count badge + Off-market cron schedule badge + Next run badge (`⏰ Next Scheduled Run: {nextRun}`).
  - **Far Right**: Flexbox container with **`⚡ Run Harvester Now`** button (amber gradient button) and **`Refresh`** button.

#### B. Top 50% Real Estate Dataset Grid
- Grid occupies the **top 50%** of the Phase 2 screen area.
- Table columns: `Dataset Name`, `Symbol`, `Conviction Date`, `ROI / Range %`, `Date Range`, `5m FK Bars`, `Status`, `Actions`.
- **Actions Column Clean Up**:
  - **Removed**: "Mine Fingerprint →" button.
  - **Removed**: "Inspect 15m Bars" button.
  - **Added**: **`📊 View Harvested Data`** button (cyan border button).
  - **Retained**: `✕` Delete button.

#### C. Bottom 50% Harvested Candle Chart & Timeframe Aggregator
- When **`📊 View Harvested Data`** is clicked on a dataset row:
  - Activates the selected dataset state and populates the **bottom 50%** chart container.
  - Fetches foreign-key linked `MarketCandle` records (`interval = '5m'`) from PostgreSQL / API.
  - Base candles displayed at **5-minute (`5m`)** interval.
  - **Timeframe Increment Selector**: Buttons allowing real-time candle aggregation into:
    - **`5m`** (Raw 5-minute harvested candles)
    - **`1h`** (1-Hour aggregated candles)
    - **`2h`** (2-Hour aggregated candles)
    - **`4h`** (4-Hour aggregated candles)
    - **`1d`** (Daily session candles)
    - **`10d`** (10-Day aggregated trend candles)
  - Displays candlestick OHLCV graph, volume bars, and dataset range markers.

---

### 3. Phase 3 Analyzer Screen (`app/page.tsx`)
- Move the **Analysis & Strategy Formalization Panel** (currently at the bottom of Phase 2) over into **Phase 3 (Analyzer tab)**.
- Include:
  - Pattern Miner Controls (`minerSymbol`, `Move Threshold %`, `Lookback Bars`, `Run Miner` button).
  - JEV Prompt Constructor & Action Score Evaluator.
  - Formalized Ticker Strategy cards and shared strategy list.

---

### 4. Phase 4 Monitoring Screen (`app/page.tsx`)
- Clean up Phase 4 layout header: **Phase 4: Active Signals & Strategy Monitoring**.
- Display active JEV signals, signal history, and live execution status.

---

## Technical Implementation Plan

### 1. API Route for FK Linked Harvested Candles (`app/api/research/datasets/[id]/candles/route.ts` or `app/api/miner/candles/route.ts`)
- `GET /api/research/datasets/[id]/candles`
  - Queries `prisma.marketCandle.findMany({ where: { datasetId }, orderBy: { timestamp: 'asc' } })`.
  - Returns array of 5m candles formatted for the chart engine.

### 2. Timeframe Aggregation Utility (`lib/market-data.ts` or `lib/miner/aggregator.ts`)
- Function `aggregateCandles(candles: Candle[], interval: '5m'|'1h'|'2h'|'4h'|'1d'|'10d')`:
  - Bundles 5-minute candles into target interval buckets (`open` of first, `high` max, `low` min, `close` last, `volume` sum).

### 3. Page Layout & Component Updates (`app/page.tsx`)
- Update state: `selectedHarvestDataset`, `harvestChartInterval` (`'5m' | '1h' | '2h' | '4h' | '1d' | '10d'`).
- Update Phase 2 rendering into two 50% split panels.
- Update Actions column buttons.

---

## Verification Plan

### Automated Verification
1. **Build Verification**:
   ```bash
   npm run build
   ```

### Manual Verification
1. Click **Phase 2: Harvester**:
   - Verify top 50% contains dataset grid with zero text blurbs.
   - Verify **"Run Harvester Now"** button is on far right.
   - Verify actions column has **"View Harvested Data"** button (and no "Mine Fingerprint" / "Inspect 15m Bars").
2. Click **"View Harvested Data"** on a row:
   - Verify bottom 50% displays the 5m candle chart for that dataset.
   - Click timeframe buttons (**5m**, **1h**, **2h**, **4h**, **1d**, **10d**) and verify chart aggregates candles accurately.
3. Click **Phase 3: Analyzer**: Verify Analysis & Strategy Formalization panel is located in Phase 3.
