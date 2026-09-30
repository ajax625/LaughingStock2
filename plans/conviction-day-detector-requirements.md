# Post-Open Conviction Day Detector — Requirements

*As of 2026-09-29*

## Overview

This spec defines a rule for flagging trading sessions where volume and price action show genuine intraday conviction — activity that built during the session itself, rather than overnight. A session that passes all three conditions below gets queued as a candidate for deeper research: examining the sessions leading up to it for a repeatable precursor pattern ("fingerprint") that might generalize.

Gap-driven moves are deliberately excluded from what this detector targets. When the catalyst originates outside market hours, same-day price and volume shape can't diagnose it — that class of move needs its own, separate strategy (see *Out of Scope*).

## Definitions & Formulas

| Term | Meaning | Window |
|---|---|---|
| `VolumeMA(x)` | Trailing average of daily volume | `x` bars |
| `RVOL` | Today's volume relative to its recent norm | derived from `x` |
| `MedianPrice` | A single day's own range midpoint | same day |
| `MedianPriceMA(y)` | Trailing average of `MedianPrice` | `y` bars (`y=1` = same-day) |
| `Range%` | Today's high-low range as a % of the open | same day |
| `Gap` | Overnight change from prior close to today's open | same day |
| `GapMA(z)` | Trailing average of gap size | `z` bars |

**Volume moving average**

```
VolumeMA(x)_t = (1/x) * Σ Volume_(t-i)   for i = 0 .. x-1
```

**Relative volume**

```
RVOL_t = Volume_t / VolumeMA(x)_t
```

**Median price** — a single day's own statistic, *not* a rolling calculation:

```
MedianPrice_t = (High_t + Low_t) / 2
```

**Median price moving average** — smooths `MedianPrice` over `y` trailing bars. At `y = 1` this reduces to that day's own `MedianPrice`, which is the default used in the core detection rule below. Setting `y > 1` instead tests the day's open/close against a smoothed multi-day reference level — a variant worth keeping configurable for future precursor work (e.g. testing whether a day's range crosses back through a longer-term "value area" rather than just its own midpoint).

```
MedianPriceMA(y)_t = (1/y) * Σ MedianPrice_(t-i)   for i = 0 .. y-1
```

**Range %** — today's high-low range, normalized by the open so the threshold means the same thing at any price level:

```
Range%_t = (High_t - Low_t) / Open_t * 100
```

**Price gap** — overnight change from the prior close to today's open:

```
Gap_t = (Open_t - Close_(t-1)) / Close_(t-1) * 100
```

**Gap moving average** — reserved for the separate gap-specific strategy (see *Out of Scope*); not used by the core rule below.

```
GapMA(z)_t = (1/z) * Σ |Gap_(t-i)|   for i = 1 .. z
GapRatio_t = Gap_t / GapMA(z)_t
```

## Detection Rule

A session is flagged as a **Conviction Day** only when all three conditions hold together:

**1. Volume conviction** — today's volume clears its recent norm by a configurable margin:

```
RVOL_t > V_min
```

**2. Range straddle** — the session's open and close sit on opposite sides of the reference midpoint, meaning price actually traveled across the center of its range rather than staying pinned to one side (which is what a rejection/wick candle looks like):

```
(Open_t - MedianPriceMA(y)_t) * (Close_t - MedianPriceMA(y)_t) < 0
```

**3. Range width** — the day actually moved enough to be worth looking at:

```
Range%_t > M
```

Note on condition 2: testing high/low against the *same day's own* median is meaningless — a day's high and low are its own extremes, so they trivially straddle any median derived from them. The straddle test only discriminates when it's applied to open/close against the midpoint (or a smoothed multi-day reference at `y > 1`), which is what's specified above.

## Configurable Parameters

| Parameter | Meaning | Suggested default | Notes |
|---|---|---|---|
| `x` | Volume MA window | 20 bars | Denominator for RVOL |
| `V_min` | Volume threshold multiplier | 1.3 – 1.5 | Lower = wider candidate pool |
| `y` | Median Price MA window | 1 (same-day) | `y > 1` tests against a smoothed reference instead |
| `M` | Minimum range % | 3 – 4% | Above ~5–6%, gap-dominated events start dropping out (see *Validation*) |
| `z` | Gap MA window | 20 bars (proposed) | Reserved for the separate gap strategy; unused here |

