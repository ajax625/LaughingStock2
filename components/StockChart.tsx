'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EnrichedCandle } from '@/lib/conviction-detector';

interface StockChartProps {
  candles: any[];
  onRangeSelect?: (range: { startDate: string; endDate: string; candleCount: number } | null) => void;
}

export default function StockChart({ candles, onRangeSelect }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCandle, setHoverCandle] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

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
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;

    for (let i = 0; i <= numYTicks; i++) {
      const priceVal = minP + (priceRange / numYTicks) * i;
      const yPos = getPriceY(priceVal);

      ctx.strokeStyle = '#1e293b';
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
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(c.date.slice(5), xPos, h - 8);
      }
    });

    // 3. Draw Volume Sub-Panel Grid & Bars
    ctx.strokeStyle = '#1e293b';
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
      const color = isBull ? '#22c55e' : '#ef4444';

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
    ctx.strokeStyle = '#06b6d4';
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
      ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
      ctx.fillRect(startX, paddingTop, selWidth, totalH);

      // Cyan Border Lines
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(startX, paddingTop);
      ctx.lineTo(startX, paddingTop + totalH);
      ctx.moveTo(endX, paddingTop);
      ctx.lineTo(endX, paddingTop + totalH);
      ctx.stroke();

      // Top Range Label Badge
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const startDateStr = visibleCandles[highlightStartIdx]?.date || '';
      const endDateStr = visibleCandles[highlightEndIdx]?.date || '';
      ctx.fillText(`🎯 Selected Range: ${startDateStr} to ${endDateStr}`, startX + selWidth / 2, paddingTop - 8);
    }

    // 9. Draw Crosshair & Hover Inspector Line
    if (mousePos && mousePos.x >= paddingLeft && mousePos.x <= paddingLeft + chartW) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
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
  }, [visibleCandles, hoverCandle, mousePos, isDragging, dragStartIdx, dragCurrentIdx, selectedRange]);

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
  const maxStartIndex = Math.max(0, totalCandlesCount - visibleCount);

  return (
    <div className="space-y-3">
      {/* Interactive Canvas Container (Fixed Top Position) */}
      <div className="relative w-full h-[420px] bg-[#0d1117] rounded-lg border border-border overflow-hidden p-2 select-none">
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
          <span className="text-muted font-bold uppercase tracking-wider">Session Inspector:</span>
          {hoverCandle ? (
            <div className="flex items-center gap-3 font-semibold font-mono flex-wrap">
              <span className="text-foreground">Date: {hoverCandle.date}</span>
              <span className="text-blue-400">Open: ${hoverCandle.open?.toFixed(2)}</span>
              <span className="text-emerald-400">High: ${hoverCandle.high?.toFixed(2)}</span>
              <span className="text-rose-400">Low: ${hoverCandle.low?.toFixed(2)}</span>
              <span className="text-cyan-400">MedianMA: ${hoverCandle.medianPriceMA?.toFixed(2)}</span>
              <span className="text-amber-400">VolMA: {(hoverCandle.volumeMA / 1e6)?.toFixed(1)}M</span>
              {hoverCandle.rvol !== undefined && (
                <span className="text-amber-400 font-bold">RVOL: {hoverCandle.rvol}x</span>
              )}
              {hoverCandle.rangePct !== undefined && (
                <span className="text-purple-400 font-bold">Range%: {hoverCandle.rangePct}%</span>
              )}
              {hoverCandle.isConvictionDay && (
                <span className="bg-amber-500 text-black px-2 py-0.5 rounded font-bold">
                  ★ CONVICTION DAY
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted italic">Click & drag on the chart above to select a period of interest (range)</span>
          )}
        </div>

        {/* Legend Indicators */}
        <div className="text-muted text-[11px] flex items-center gap-3 font-semibold pt-1 sm:pt-0">
          {selectedRange && (
            <button
              onClick={clearSelection}
              className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 px-2 py-0.5 rounded font-bold hover:bg-cyan-500/20 mr-2"
            >
              ✕ Clear Selected Range ({selectedRange.startDate} - {selectedRange.endDate})
            </button>
          )}
          <span className="flex items-center gap-1 text-cyan-400">
            <span className="w-3 h-0.5 bg-cyan-400"></span> MedianPriceMA
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-3 h-0.5 bg-amber-400"></span> VolumeMA
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> ★ Conviction Day
          </span>
        </div>
      </div>

      {/* Sliding X-Axis Zoom & Scroll Controls */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted font-bold">Zoom Window:</span>
          {[30, 60, 90, 180, 365].map((cnt) => (
            <button
              key={cnt}
              onClick={() => {
                setVisibleCount(cnt);
                setStartIndex(Math.max(0, totalCandlesCount - cnt));
              }}
              className={`px-2.5 py-1 rounded font-bold transition ${
                visibleCount === cnt ? 'bg-blue-600 text-white' : 'bg-background text-muted border border-border hover:text-foreground'
              }`}
            >
              {cnt}D
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
          <span className="text-muted font-semibold whitespace-nowrap">Slide Timeline:</span>
          <input
            type="range"
            min="0"
            max={maxStartIndex}
            value={startIndex}
            onChange={(e) => setStartIndex(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <span className="text-muted font-mono whitespace-nowrap">
            {visibleCandles[0]?.date} to {visibleCandles[visibleCandles.length - 1]?.date}
          </span>
        </div>
      </div>
    </div>
  );
}
