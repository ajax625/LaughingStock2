'use client';

import React, { useEffect, useRef, useState } from 'react';
import { EnrichedCandle } from '@/lib/conviction-detector';

interface StockChartProps {
  candles: any[];
}

export default function StockChart({ candles }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCandle, setHoverCandle] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Sliding X-Axis Timeline Controls
  const [visibleCount, setVisibleCount] = useState(60); // Default 60 bars visible
  const [startIndex, setStartIndex] = useState(0);

  // Auto-adjust start index when candles array updates
  useEffect(() => {
    if (candles && candles.length > 0) {
      setStartIndex(Math.max(0, candles.length - visibleCount));
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

    function getPriceAtY(y: number) {
      return maxP - ((y - paddingTop) / priceChartH) * priceRange;
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
    const stepX = Math.max(1, Math.floor(visibleCandles.length / 6));
    ctx.textAlign = 'center';

    visibleCandles.forEach((c, i) => {
      if (i % stepX === 0 || i === visibleCandles.length - 1) {
        const xPos = paddingLeft + i * (chartW / visibleCandles.length) + barWidth / 2;

        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(xPos, paddingTop);
        ctx.lineTo(xPos, paddingTop + priceChartH);
        ctx.stroke();

        const dateFormatted = c.date ? c.date.slice(5) : '';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(dateFormatted, xPos, h - 8);
      }
    });

    // Sub-Panel Separator Line
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(paddingLeft, volumeTopY - 10);
    ctx.lineTo(paddingLeft + chartW, volumeTopY - 10);
    ctx.stroke();

    // Volume Sub-Panel Y-Axis Label
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText(`${(maxVol / 1e6).toFixed(1)}M`, paddingLeft + chartW + 8, volumeTopY + 10);

    // 3. Draw Candlesticks & Volume Bars
    visibleCandles.forEach((c, i) => {
      const x = paddingLeft + i * (chartW / visibleCandles.length) + barWidth / 2;
      const isGreen = c.close >= c.open;
      const isConviction = c.isConvictionDay || c.highlight;

      const color = isConviction
        ? '#f59e0b'
        : isGreen
        ? '#10b981'
        : '#f43f5e';

      // Price High-Low Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = isConviction ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, getPriceY(c.high));
      ctx.lineTo(x, getPriceY(c.low));
      ctx.stroke();

      // Price Candle Body
      ctx.fillStyle = color;
      const topY = getPriceY(Math.max(c.open, c.close));
      const botY = getPriceY(Math.min(c.open, c.close));
      const bodyH = Math.max(2, botY - topY);
      ctx.fillRect(x - barWidth / 2 + 1, topY, Math.max(1, barWidth - 2), bodyH);

      // Volume Bar
      ctx.fillStyle = isGreen ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
      const vY = getVolY(c.volume || 0);
      const vH = Math.max(1, volumeTopY + volumeChartH - vY);
      ctx.fillRect(x - barWidth / 2 + 1, vY, Math.max(1, barWidth - 2), vH);

      // Conviction Day Visual Star Badge
      if (isConviction) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(x, getPriceY(c.high) - 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 4. Draw Line Graph: MedianPriceMA(y) Line Overlay (Cyan)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let startedMedian = false;

    visibleCandles.forEach((c, i) => {
      if (c.medianPriceMA !== undefined) {
        const x = paddingLeft + i * (chartW / visibleCandles.length) + barWidth / 2;
        const y = getPriceY(c.medianPriceMA);
        if (!startedMedian) {
          ctx.moveTo(x, y);
          startedMedian = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // 5. Draw Line Graph: VolumeMA(x) Line Overlay (Yellow/Amber)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let startedVolMA = false;

    visibleCandles.forEach((c, i) => {
      if (c.volumeMA !== undefined) {
        const x = paddingLeft + i * (chartW / visibleCandles.length) + barWidth / 2;
        const y = getVolY(c.volumeMA);
        if (!startedVolMA) {
          ctx.moveTo(x, y);
          startedVolMA = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    // 6. Draw Mouse Crosshairs if hovering
    if (mousePos && mousePos.x >= paddingLeft && mousePos.x <= paddingLeft + chartW) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, paddingTop);
      ctx.lineTo(mousePos.x, h - paddingBottom);
      ctx.stroke();

      if (mousePos.y >= paddingTop && mousePos.y <= paddingTop + priceChartH) {
        ctx.beginPath();
        ctx.moveTo(paddingLeft, mousePos.y);
        ctx.lineTo(paddingLeft + chartW, mousePos.y);
        ctx.stroke();

        const hoveredPrice = getPriceAtY(mousePos.y);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(paddingLeft + chartW, mousePos.y - 10, 60, 20);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(`$${hoveredPrice.toFixed(2)}`, paddingLeft + chartW + 4, mousePos.y + 4);
      }

      ctx.setLineDash([]);
    }
  }, [visibleCandles, mousePos]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !visibleCandles || visibleCandles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    const paddingLeft = 10;
    const paddingRight = 65;
    const chartW = canvas.width - paddingLeft - paddingRight;

    if (x >= paddingLeft && x <= paddingLeft + chartW) {
      const idx = Math.floor(((x - paddingLeft) / chartW) * visibleCandles.length);
      const clampedIdx = Math.max(0, Math.min(visibleCandles.length - 1, idx));
      setHoverCandle(visibleCandles[clampedIdx]);
    } else {
      setHoverCandle(null);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverCandle(null);
  };

  const totalCandlesCount = candles ? candles.length : 0;
  const maxStartIndex = Math.max(0, totalCandlesCount - visibleCount);

  return (
    <div className="space-y-3">
      {/* Interactive Canvas Container (Fixed Top Position) */}
      <div className="relative w-full h-[420px] bg-[#0d1117] rounded-lg border border-border overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full cursor-crosshair"
        />
      </div>

      {/* Session Inspector Panel (Moved BELOW the Chart for Zero Page Jumps) */}
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
              {hoverCandle.isConvictionDay && (
                <span className="bg-amber-500 text-black px-2 py-0.5 rounded font-bold">
                  ★ CONVICTION DAY
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted italic">Hover over candles on the chart above to inspect session metrics</span>
          )}
        </div>

        {/* Legend Indicators */}
        <div className="text-muted text-[11px] flex items-center gap-3 font-semibold pt-1 sm:pt-0">
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
