'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EnrichedCandle } from '@/lib/conviction-detector';

interface StockChartProps {
  candles: any[];
  onRangeSelect?: (range: { startDate: string; endDate: string; candleCount: number } | null) => void;
  theme?: 'dark' | 'light';
}

export default function StockChart({ candles, onRangeSelect, theme }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCandle, setHoverCandle] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Theme Detection State & MutationObserver
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(theme || 'dark');

  useEffect(() => {
    if (theme) {
      setCurrentTheme(theme);
    }
    const updateThemeFromDOM = () => {
      const domTheme = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
      setCurrentTheme(domTheme);
    };

    updateThemeFromDOM();

    const observer = new MutationObserver(() => {
      updateThemeFromDOM();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, [theme]);

  const isLight = currentTheme === 'light';

  // Drag-to-Select Date Range State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragCurrentIdx, setDragCurrentIdx] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    startIdx: number;
    endIdx: number;
    startDate: string;
    endDate: string;
  } | null>(null);

  // Sliding X-Axis Timeline Controls
  const [visibleCount, setVisibleCount] = useState(60); // Default 60 bars visible
  const [startIndex, setStartIndex] = useState(0);

  // Auto-adjust start index when candles array updates
  useEffect(() => {
    if (candles && candles.length > 0) {
      setStartIndex(Math.max(0, candles.length - visibleCount));
      setSelectedRange(null);
      if (onRangeSelect) onRangeSelect(null);
    }
  }, [candles, visibleCount]);

  const visibleCandles = candles ? candles.slice(startIndex, startIndex + visibleCount) : [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visibleCandles || visibleCandles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = canvas.parentElement?.clientHeight || 420;

    const w = canvas.width;
    const h = canvas.height;

    // Layout Margins
    const paddingLeft = 10;
    const paddingRight = 65;
    const paddingTop = 25;
    const paddingBottom = 25;

    // Sub-panel Heights
    const totalH = h - paddingTop - paddingBottom;
    const priceChartH = Math.floor(totalH * 0.68);
    const volumeChartH = totalH - priceChartH - 20;
    const volumeTopY = paddingTop + priceChartH + 20;

    const chartW = w - paddingLeft - paddingRight;

    ctx.clearRect(0, 0, w, h);

    // Fill background depending on active theme mode
    ctx.fillStyle = isLight ? '#ffffff' : '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Min & Max Price Bounds
    const prices = visibleCandles.flatMap((c) => [c.high, c.low, c.medianPriceMA || c.close]);
    const minP = Math.min(...prices) * 0.99;
    const maxP = Math.max(...prices) * 1.01;
    const priceRange = maxP - minP || 1;

    function getPriceY(val: number) {
      return paddingTop + priceChartH - ((val - minP) / priceRange) * priceChartH;
    }

    // Min & Max Volume Bounds
    const maxVol = Math.max(...visibleCandles.map((c) => Math.max(c.volume || 0, c.volumeMA || 0))) * 1.05 || 1;

    function getVolY(val: number) {
      return volumeTopY + volumeChartH - (val / maxVol) * volumeChartH;
    }

    const barWidth = Math.max(3, Math.floor(chartW / visibleCandles.length));

    // 1. Draw Grid Lines & Y-Axis Price Scale
    const numYTicks = 4;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = isLight ? '#475569' : '#94a3b8';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;

    for (let i = 0; i <= numYTicks; i++) {
      const priceVal = minP + (priceRange / numYTicks) * i;
      const yPos = getPriceY(priceVal);

      ctx.strokeStyle = isLight ? '#cbd5e1' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(paddingLeft, yPos);
      ctx.lineTo(paddingLeft + chartW, yPos);
      ctx.stroke();

      ctx.fillText(`$${priceVal.toFixed(2)}`, paddingLeft + chartW + 8, yPos + 4);
    }

    // 2. Draw X-Axis Date Scale Labels
    const labelStep = Math.max(1, Math.floor(visibleCandles.length / 6));
    visibleCandles.forEach((c, idx) => {
      if (idx % labelStep === 0 || idx === visibleCandles.length - 1) {
        const xPos = paddingLeft + (idx + 0.5) * (chartW / visibleCandles.length);
        ctx.fillStyle = isLight ? '#475569' : '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(c.date.slice(5), xPos, h - 8);
      }
    });

    // 3. Draw Volume Sub-Panel Grid & Bars
    ctx.strokeStyle = isLight ? '#cbd5e1' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(paddingLeft, volumeTopY);
    ctx.lineTo(paddingLeft + chartW, volumeTopY);
    ctx.stroke();

    visibleCandles.forEach((c, idx) => {
      const xPos = paddingLeft + idx * (chartW / visibleCandles.length);
      const isBull = c.close >= c.open;
      const volY = getVolY(c.volume || 0);

      ctx.fillStyle = isBull ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.35)';
      ctx.fillRect(xPos + 1, volY, Math.max(1, barWidth - 1), volumeTopY + volumeChartH - volY);
    });

    // 4. Draw Volume MA (Amber Line)
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    let volMaStarted = false;
    visibleCandles.forEach((c, idx) => {
      if (c.volumeMA !== undefined) {
        const xPos = paddingLeft + (idx + 0.5) * (chartW / visibleCandles.length);
        const yPos = getVolY(c.volumeMA);
        if (!volMaStarted) {
          ctx.moveTo(xPos, yPos);
          volMaStarted = true;
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }
    });
    ctx.stroke();

    // 5. Draw Price Candlesticks
    visibleCandles.forEach((c, idx) => {
      const xPos = paddingLeft + (idx + 0.5) * (chartW / visibleCandles.length);
      const isBull = c.close >= c.open;
      const color = isBull ? (isLight ? '#16a34a' : '#22c55e') : (isLight ? '#dc2626' : '#ef4444');

      const openY = getPriceY(c.open);
      const closeY = getPriceY(c.close);
      const highY = getPriceY(c.high);
      const lowY = getPriceY(c.low);

      // High-Low Wick Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos, highY);
      ctx.lineTo(xPos, lowY);
      ctx.stroke();

      // Open-Close Body Rect
      ctx.fillStyle = color;
      const rectTop = Math.min(openY, closeY);
      const rectH = Math.max(2, Math.abs(openY - closeY));
      ctx.fillRect(xPos - barWidth / 2 + 0.5, rectTop, Math.max(1, barWidth - 1), rectH);

      // 6. Draw Gold Star (★ Badge) for Conviction Days
      if (c.isConvictionDay) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#eab308';
        ctx.textAlign = 'center';
        ctx.fillText('★', xPos, highY - 8);
      }
    });

    // 7. Draw Median Price MA Overlay Line (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = isLight ? '#0284c7' : '#06b6d4';
    ctx.lineWidth = 2;
    let maStarted = false;
    visibleCandles.forEach((c, idx) => {
      if (c.medianPriceMA !== undefined) {
        const xPos = paddingLeft + (idx + 0.5) * (chartW / visibleCandles.length);
        const yPos = getPriceY(c.medianPriceMA);
        if (!maStarted) {
          ctx.moveTo(xPos, yPos);
          maStarted = true;
        } else {
          ctx.lineTo(xPos, yPos);
        }
      }
    });
    ctx.stroke();

    // 8. Render Drag Selection Range Overlay (Active Drag or Selected Range)
    let highlightStartIdx: number | null = null;
    let highlightEndIdx: number | null = null;

    if (isDragging && dragStartIdx !== null && dragCurrentIdx !== null) {
      highlightStartIdx = Math.min(dragStartIdx, dragCurrentIdx);
      highlightEndIdx = Math.max(dragStartIdx, dragCurrentIdx);
    } else if (selectedRange) {
      highlightStartIdx = selectedRange.startIdx;
      highlightEndIdx = selectedRange.endIdx;
    }

    if (highlightStartIdx !== null && highlightEndIdx !== null) {
      const startX = paddingLeft + highlightStartIdx * (chartW / visibleCandles.length);
      const endX = paddingLeft + (highlightEndIdx + 1) * (chartW / visibleCandles.length);
      const selWidth = endX - startX;

      // Cyan Highlight Box
      ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.18)' : 'rgba(6, 182, 212, 0.18)';
      ctx.fillRect(startX, paddingTop, selWidth, totalH);

      // Cyan Border Lines
      ctx.strokeStyle = isLight ? '#0284c7' : '#06b6d4';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(startX, paddingTop);
      ctx.lineTo(startX, paddingTop + totalH);
      ctx.moveTo(endX, paddingTop);
      ctx.lineTo(endX, paddingTop + totalH);
      ctx.stroke();

      // Top Range Label Badge
      ctx.fillStyle = isLight ? '#0284c7' : '#06b6d4';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const startDateStr = visibleCandles[highlightStartIdx]?.date || '';
      const endDateStr = visibleCandles[highlightEndIdx]?.date || '';
      ctx.fillText(`🎯 Selected Range: ${startDateStr} to ${endDateStr}`, startX + selWidth / 2, paddingTop - 8);
    }

    // 9. Draw Crosshair & Hover Inspector Line
    if (mousePos && mousePos.x >= paddingLeft && mousePos.x <= paddingLeft + chartW) {
      ctx.strokeStyle = isLight ? 'rgba(71, 85, 105, 0.4)' : 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical Crosshair Line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, paddingTop);
      ctx.lineTo(mousePos.x, h - paddingBottom);
      ctx.stroke();

      // Horizontal Price Line
      if (mousePos.y >= paddingTop && mousePos.y <= paddingTop + priceChartH) {
        ctx.beginPath();
        ctx.moveTo(paddingLeft, mousePos.y);
        ctx.lineTo(paddingLeft + chartW, mousePos.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }
  }, [visibleCandles, hoverCandle, mousePos, isDragging, dragStartIdx, dragCurrentIdx, selectedRange, isLight]);

  const getIndexFromX = (x: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !visibleCandles || visibleCandles.length === 0) return 0;
    const paddingLeft = 10;
    const paddingRight = 65;
    const chartW = canvas.width - paddingLeft - paddingRight;
    const rawIdx = Math.floor(((x - paddingLeft) / chartW) * visibleCandles.length);
    return Math.max(0, Math.min(visibleCandles.length - 1, rawIdx));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !visibleCandles || visibleCandles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const idx = getIndexFromX(x);
    setIsDragging(true);
    setDragStartIdx(idx);
    setDragCurrentIdx(idx);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !visibleCandles || visibleCandles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    const idx = getIndexFromX(x);
    setHoverCandle(visibleCandles[idx]);

    if (isDragging) {
      setDragCurrentIdx(idx);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStartIdx !== null && dragCurrentIdx !== null) {
      const minIdx = Math.min(dragStartIdx, dragCurrentIdx);
      const maxIdx = Math.max(dragStartIdx, dragCurrentIdx);

      const rangeObj = {
        startIdx: minIdx,
        endIdx: maxIdx,
        startDate: visibleCandles[minIdx].date,
        endDate: visibleCandles[maxIdx].date,
      };

      setSelectedRange(rangeObj);

      if (onRangeSelect) {
        onRangeSelect({
          startDate: rangeObj.startDate,
          endDate: rangeObj.endDate,
          candleCount: maxIdx - minIdx + 1,
        });
      }
    }
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverCandle(null);
    if (isDragging) {
      handleMouseUp();
    }
  };

  const clearSelection = () => {
    setSelectedRange(null);
    setDragStartIdx(null);
    setDragCurrentIdx(null);
    if (onRangeSelect) onRangeSelect(null);
  };

  const totalCandlesCount = candles ? candles.length : 0;
  const is365View = visibleCount >= totalCandlesCount || visibleCount === 365;
  const maxStartIndex = Math.max(0, totalCandlesCount - visibleCount);

  return (
    <div className="space-y-3">
      {/* Interactive Canvas Container (Theme Responsive) */}
      <div className={`relative w-full h-[420px] rounded-lg border border-border overflow-hidden p-2 select-none transition-colors duration-200 ${
        isLight ? 'bg-white' : 'bg-[#0d1117]'
      }`}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full cursor-crosshair"
        />
      </div>

      {/* Session Inspector Panel */}
      <div className="flex flex-wrap items-center justify-between text-xs bg-background p-3 rounded-lg border border-border min-h-[48px]">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-muted-foreground font-bold uppercase tracking-wider">Session Inspector:</span>
          {hoverCandle ? (
            <div className="flex items-center gap-3 font-semibold font-mono flex-wrap">
              <span className="text-foreground">Date: {hoverCandle.date}</span>
              <span className="text-blue-500">Open: ${hoverCandle.open?.toFixed(2)}</span>
              <span className="text-emerald-500">High: ${hoverCandle.high?.toFixed(2)}</span>
              <span className="text-rose-500">Low: ${hoverCandle.low?.toFixed(2)}</span>
              <span className="text-cyan-500">MedianMA: ${hoverCandle.medianPriceMA?.toFixed(2)}</span>
              <span className="text-amber-500">VolMA: {(hoverCandle.volumeMA / 1e6)?.toFixed(1)}M</span>
              {hoverCandle.rvol !== undefined && (
                <span className="text-amber-500 font-bold">RVOL: {hoverCandle.rvol}x</span>
              )}
              {hoverCandle.rangePct !== undefined && (
                <span className="text-purple-500 font-bold">Range%: {hoverCandle.rangePct}%</span>
              )}
              {hoverCandle.isConvictionDay && (
                <span className="bg-amber-500 text-black px-2 py-0.5 rounded font-bold">
                  ★ CONVICTION DAY
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground italic">Click & drag on the chart above to select a period of interest (range)</span>
          )}
        </div>

        {/* Legend Indicators */}
        <div className="text-muted-foreground text-[11px] flex items-center gap-3 font-semibold pt-1 sm:pt-0">
          {selectedRange && (
            <button
              onClick={clearSelection}
              className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 px-2 py-0.5 rounded font-bold hover:bg-cyan-500/20 mr-2 cursor-pointer"
            >
              ✕ Clear Selected Range ({selectedRange.startDate} - {selectedRange.endDate})
            </button>
          )}
          <span className="flex items-center gap-1 text-cyan-500 font-bold">
            <span className="w-3 h-0.5 bg-cyan-500"></span> MedianPriceMA
          </span>
          <span className="flex items-center gap-1 text-amber-500 font-bold">
            <span className="w-3 h-0.5 bg-amber-500"></span> VolumeMA
          </span>
          <span className="flex items-center gap-1 text-amber-500 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> ★ Conviction Day
          </span>
        </div>
      </div>

      {/* 60% Width Sliding X-Axis Zoom & Scroll Controls with Conviction Bars Heatmap */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col lg:flex-row justify-between items-center gap-4 text-xs">
        {/* Zoom Window Presets */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground font-bold">Zoom Window:</span>
          {[30, 60, 90, 180, 365].map((cnt) => {
            const isSelected = visibleCount === cnt || (cnt === 365 && visibleCount >= totalCandlesCount);
            return (
              <button
                key={cnt}
                type="button"
                onClick={() => {
                  setVisibleCount(cnt);
                  setStartIndex(Math.max(0, totalCandlesCount - cnt));
                }}
                className={`px-3 py-1.5 rounded-lg font-extrabold text-xs transition cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/50 shadow-[0_0_10px_rgba(0,255,135,0.2)]'
                    : 'bg-background text-muted-foreground border border-border hover:text-foreground hover:bg-card/60'
                }`}
              >
                {cnt}D
              </button>
            );
          })}
        </div>

        {/* 60% Width Timeline Scrubber & Conviction Days Heatmap */}
        <div className="w-full lg:w-[60%] flex flex-col gap-1.5 shrink-0">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground font-semibold flex items-center gap-2">
              <span>Slide 365D Timeline:</span>
              {is365View ? (
                <span className="text-amber-500 font-mono text-[10px] bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
                  🔒 Slider Disabled in 365D View
                </span>
              ) : (
                <span className="text-emerald-500 font-mono text-[10px] font-bold">
                  (Bars {startIndex + 1} – {Math.min(totalCandlesCount, startIndex + visibleCount)} of {totalCandlesCount})
                </span>
              )}
            </span>
            <span className="text-emerald-500 font-mono font-bold">
              {visibleCandles[0]?.date} → {visibleCandles[visibleCandles.length - 1]?.date}
            </span>
          </div>

          {/* Timeline Track Container (Theme Responsive) */}
          <div className={`relative w-full h-8 rounded-lg border border-border overflow-hidden flex items-center px-1 transition-colors duration-200 ${
            isLight ? 'bg-slate-100' : 'bg-slate-950'
          }`}>
            {/* 1. Conviction Day Vertical Bars Heatmap Plot */}
            <div className="absolute inset-0 w-full h-full pointer-events-none flex items-center">
              {candles && candles.length > 0 && candles.map((c, idx) => {
                if (!c.isConvictionDay) return null;
                const leftPct = (idx / candles.length) * 100;
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-[3px] bg-amber-500 shadow-[0_0_6px_#f59e0b] z-10"
                    style={{ left: `${leftPct}%` }}
                    title={`★ Conviction Day: ${c.date} (RVOL: ${c.rvol}x, Range%: ${c.rangePct}%)`}
                  />
                );
              })}
            </div>

            {/* 2. Active Range Highlight Box on Timeline Track */}
            {totalCandlesCount > 0 && !is365View && (
              <div
                className={`absolute top-1 bottom-1 rounded pointer-events-none transition-all duration-75 border z-15 ${
                  isLight
                    ? 'bg-emerald-500/30 border-emerald-600/70 shadow-[0_0_8px_rgba(5,150,105,0.25)]'
                    : 'bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_10px_rgba(0,255,135,0.3)]'
                }`}
                style={{
                  left: `${(startIndex / totalCandlesCount) * 100}%`,
                  width: `${(visibleCount / totalCandlesCount) * 100}%`,
                }}
              />
            )}

            {/* 3. Range Input Slider (Disabled in 365d view) */}
            <input
              type="range"
              min="0"
              max={maxStartIndex}
              disabled={is365View}
              value={is365View ? 0 : startIndex}
              onChange={(e) => setStartIndex(Number(e.target.value))}
              className="w-full h-full opacity-60 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed accent-emerald-500 cursor-pointer relative z-20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
