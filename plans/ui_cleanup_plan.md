# UI Clean Up Implementation Plan: 4-Phase Architecture & Harvester Grid Layout

## Goal Description
Reorganize and streamline the application navigation into a clean **4-Phase Workflow Architecture**, clean up text blurbs, place controls on the far right, expand the dataset grid to full real estate, and migrate strategy analysis to Phase 3.

---

## Architectural Navigation Overview

| Phase | Tab Name | Icon | Purpose & Components |
|---|---|---|---|
| **Phase 1** | **Research Studio** | `Search` / `Sliders` | Post-Open Conviction Day Detector Studio, 1D candles in memory, 15m range selection & candidate matching. |
| **Phase 2** | **Harvester** | `Database` / `Sparkles` | **5m Intraday Candle Harvester Grid** with foreign-key linkage. Full-width grid, header toolbar with "Run Harvester Now" on the far right, schedule & next run badges. |
| **Phase 3** | **Analyzer** | `FlaskConical` / `Cpu` | **Analysis & Strategy Formalization** panel (migrated from Phase 2). Pre-move fingerprint mining, Typeface.ai JEV prompt construction, and JEV action score outputs. |
| **Phase 4** | **Monitoring** | `Radio` / `Activity` | **Active Signals & Execution Monitor**. Real-time JEV signals, win rate metrics, and live position alerts. |

---

## Proposed UI Changes

### 1. Sidebar Navigation (`app/page.tsx`)
- Update sidebar navigation list:
  1. `Phase 1: Research Studio` (`research`)
  2. `Phase 2: Harvester` (`harvester`)
  3. `Phase 3: Analyzer` (`analyzer`)
  4. `Phase 4: Monitoring` (`signals`)
  5. `Portfolio` (`portfolio`)
  6. `Dashboard` (`dashboard`)

---

### 2. Phase 2 Harvester Screen Clean Up (`app/page.tsx`)
- **Remove Blurbs**: Strip out non-essential text blurbs (e.g. `Persisted datasets ({SYMBOL}_{MMDDYYYY}_{ROI}) ready for 5m intraday harvesting & foreign-key linkage.`).
- **Header Layout**:
  - **Left**: `Phase 2: 5m Intraday Harvester` title + Datasets count badge + Off-market cron schedule badge + Next run badge (`⏰ Next Scheduled Run: {nextRun}`).
  - **Far Right**: Flexbox container with **`⚡ Run Harvester Now`** button (amber gradient button) and **`Refresh`** button.
- **Full Real Estate Grid**:
  - Remove arbitrary max-width restrictions and padding constraints.
  - Set table wrapper to `w-full min-w-full overflow-x-auto`.
  - Add clean hover highlights, crisp border dividers, and full-width metric columns.

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

## Technical File Modifications

### `app/page.tsx`
1. Update `activeTab` state type to `'dashboard' | 'portfolio' | 'research' | 'harvester' | 'analyzer' | 'signals'`.
2. Update sidebar navigation buttons and click handlers.
3. Clean up Phase 2 component layout:
   - Move "Run Harvester Now" button to `flex justify-between` right container.
   - Remove extra paragraph blurbs.
   - Update grid table layout to fill 100% width.
4. Render Phase 3 (`activeTab === 'analyzer'`) with migrated strategy analysis components.
5. Render Phase 4 (`activeTab === 'signals'`) with monitoring components.

---

## Verification Plan

### Automated Verification
1. **Build Verification**:
   ```bash
   npm run build
   ```

### Manual Verification
1. Click **Phase 1: Research Studio**: Verify conviction candidate detector & range selector.
2. Click **Phase 2: Harvester**:
   - Verify zero text blurbs.
   - Verify **"Run Harvester Now"** button is on the far right.
   - Verify table grid expands across 100% of the screen width.
3. Click **Phase 3: Analyzer**: Verify Analysis & Strategy Formalization panel is located in Phase 3.
4. Click **Phase 4: Monitoring**: Verify Active Signals & Monitoring panel displays correctly.
