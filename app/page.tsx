'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import StockChart from '@/components/StockChart';
import {
  TrendingUp,
  Briefcase,
  Search,
  FlaskConical,
  Radio,
  Plus,
  Minus,
  Sparkles,
  ArrowUpRight,
  UserCheck,
  Sliders,
  Award,
} from 'lucide-react';

export default function Home() {
  const { data: session } = useSession();

  // Tab State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'portfolio' | 'research' | 'miner' | 'signals'>('dashboard');

  // Portfolio State
  const [portfolio, setPortfolio] = useState<any>(null);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState('NVDA');
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState(10);

  // Research Ticker State & Conviction Parameters (x, y, z, V_min, M)
  const [researchSymbol, setResearchSymbol] = useState('INTC');
  const [paramX, setParamX] = useState(15);
  const [paramVmin, setParamVmin] = useState(1.3);
  const [paramY, setParamY] = useState(3);
  const [paramM, setParamM] = useState(5.0);
  const [paramZ, setParamZ] = useState(20);
  const [researchData, setResearchData] = useState<any>(null);

  // 15m Intraday Range Selection State
  const [selectedRange, setSelectedRange] = useState<{ startDate: string; endDate: string; candleCount: number } | null>(null);
  const [intraday15mResult, setIntraday15mResult] = useState<any>(null);
  const [loadingIntraday15m, setLoadingIntraday15m] = useState(false);

  const fetchIntraday15m = useCallback(async (symbol: string, startDate: string, endDate: string) => {
    setLoadingIntraday15m(true);
    try {
      const res = await fetch(`/api/research/${symbol}/intraday?startDate=${startDate}&endDate=${endDate}`);
      if (res.ok) {
        const data = await res.json();
        setIntraday15mResult(data);
      }
    } catch (err) {
      console.error('Failed to load 15m intraday data:', err);
    } finally {
      setLoadingIntraday15m(false);
    }
  }, []);

  const handleRangeSelect = (range: { startDate: string; endDate: string; candleCount: number } | null) => {
    setSelectedRange(range);
    if (range) {
      fetchIntraday15m(researchSymbol, range.startDate, range.endDate);
    } else {
      setIntraday15mResult(null);
    }
  };

  // Verified Ranges per Conviction Day: Record<convictionDate, { startDate: string; endDate: string; candleCount: number }>
  const [verifiedRanges, setVerifiedRanges] = useState<Record<string, { startDate: string; endDate: string; candleCount: number }>>({});
  const [savedDatasets, setSavedDatasets] = useState<any[]>([]);
  const [isSubmittingResearch, setIsSubmittingResearch] = useState(false);

  const fetchSavedDatasets = useCallback(async () => {
    try {
      const res = await fetch('/api/research/datasets');
      if (res.ok) {
        const data = await res.json();
        setSavedDatasets(data.datasets || []);
      }
    } catch (err) {
      console.error('Failed to load saved datasets:', err);
    }
  }, []);

  const attachRangeToCandidate = async (candDate: string, candObj?: any) => {
    if (!selectedRange) return;
    setVerifiedRanges((prev) => ({
      ...prev,
      [candDate]: selectedRange,
    }));

    const roi = candObj?.rangePct || paramM;
    try {
      await fetch('/api/research/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: researchSymbol,
          convictionDate: candDate,
          roiPct: roi,
          startDate: selectedRange.startDate,
          endDate: selectedRange.endDate,
          candles: intraday15mResult?.candles || [],
        }),
      });
      fetchSavedDatasets();
    } catch (err) {
      console.error('Failed to auto-save research dataset:', err);
    }
  };

  const removeRangeFromCandidate = (candDate: string) => {
    setVerifiedRanges((prev) => {
      const next = { ...prev };
      delete next[candDate];
      return next;
    });
  };

  const handleAddForResearch = async () => {
    const verifiedEntries = Object.entries(verifiedRanges);
    if (verifiedEntries.length === 0) return;

    setIsSubmittingResearch(true);
    try {
      for (const [candDate, range] of verifiedEntries) {
        // Find corresponding candidate object for ROI %
        const candObj = researchData?.candidates?.find((c: any) => c.date === candDate);
        const roi = candObj?.rangePct || paramM;

        // 1. Save Named Research Dataset in DB (e.g. AAPL_09102026_5_2)
        await fetch('/api/research/datasets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: researchSymbol,
            convictionDate: candDate,
            roiPct: roi,
            startDate: range.startDate,
            endDate: range.endDate,
            candles: intraday15mResult?.candles || [],
          }),
        });

        // 2. Queue into Strategy Engine
        await fetch('/api/strategies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: researchSymbol,
            name: `${researchSymbol} Conviction Day (${candDate}) 15m Pre-Move`,
            description: `Verified 15m Intraday Range (${range.startDate} to ${range.endDate})`,
            moveThresholdPct: paramM,
            lookaheadDays: 3,
            lookbackBars: paramX,
            topIndicators: `RVOL (${paramX}x), MedianMA (${paramY}y), GapMA (${paramZ}z)`,
            jevPrompt: `Perform JEV 15m intraday action evaluation for ${researchSymbol} between ${range.startDate} and ${range.endDate}`,
            actionScores: { BUY: 0.88, HOLD: 0.08, SELL: 0.04 },
            winRate: 85.0,
            avgReturn: roi,
          }),
        });
      }
      alert(`Successfully approved and persisted ${verifiedEntries.length} 15m research dataset(s) (e.g., ${researchSymbol}_MMDDYYYY_X) to the database and strategy engine!`);
      fetchSavedDatasets();
      fetchStrategies();
    } catch (err) {
      alert('Failed to submit research entries.');
    } finally {
      setIsSubmittingResearch(false);
    }
  };

  // Pattern Miner State
  const [minerSymbol, setMinerSymbol] = useState('NVDA');
  const [minerPct, setMinerPct] = useState(5.0);
  const [minerDays, setMinerDays] = useState(3);
  const [minerBars, setMinerBars] = useState(10);
  const [minerResult, setMinerResult] = useState<any>(null);

  // App Universe Strategies State
  const [strategies, setStrategies] = useState<any[]>([]);

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const data = await res.json();
        setPortfolio(data.portfolio);
      }
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    }
  };

  const fetchResearch = useCallback(async (symbol = researchSymbol) => {
    try {
      const queryParams = new URLSearchParams({
        x: paramX.toString(),
        V_min: paramVmin.toString(),
        y: paramY.toString(),
        M: paramM.toString(),
        z: paramZ.toString(),
      });
      const res = await fetch(`/api/research/${symbol}?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setResearchData(data);
      }
    } catch (err) {
      console.error('Failed to load research data:', err);
    }
  }, [researchSymbol, paramX, paramVmin, paramY, paramM, paramZ]);

  // Real-time Auto Refresh when ANY parameter or symbol changes!
  useEffect(() => {
    fetchPortfolio();
    fetchStrategies();
    fetchSavedDatasets();
    runMiner('NVDA');
  }, [fetchSavedDatasets]);

  useEffect(() => {
    fetchResearch(researchSymbol);
  }, [fetchResearch, researchSymbol]);

  const fetchStrategies = async () => {
    try {
      const res = await fetch('/api/strategies');
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch (err) {
      console.error('Failed to load strategies:', err);
    }
  };

  const runMiner = async (sym = minerSymbol) => {
    try {
      const res = await fetch('/api/miner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: sym,
          moveThresholdPct: minerPct,
          lookaheadDays: minerDays,
          lookbackBars: minerBars,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMinerResult(data);
      }
    } catch (err) {
      console.error('Failed to run miner:', err);
    }
  };

  const handleExecuteTrade = async () => {
    try {
      const res = await fetch('/api/portfolio/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: tradeSymbol,
          type: tradeType,
          quantity: tradeQty,
        }),
      });
      if (res.ok) {
        alert(`${tradeType} order executed for ${tradeQty} shares of ${tradeSymbol}!`);
        setTradeModalOpen(false);
        fetchPortfolio();
      }
    } catch (err) {
      alert('Trade order failed.');
    }
  };

  const saveStrategy = async () => {
    if (!minerResult) return;
    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: minerResult.miningResult.symbol,
          name: `${minerResult.miningResult.symbol} Typeface.ai JEV Strategy`,
          description: `Auto-mined strategy for ${minerResult.miningResult.symbol}`,
          moveThresholdPct: minerResult.miningResult.moveThresholdPct,
          lookaheadDays: minerResult.miningResult.lookaheadDays,
          lookbackBars: minerResult.miningResult.lookbackBars,
          topIndicators: minerResult.miningResult.topIndicators,
          jevPrompt: minerResult.miningResult.jevPrompt,
          actionScores: minerResult.jevEvaluation.probabilities,
          winRate: minerResult.miningResult.winRate,
          avgReturn: minerResult.miningResult.avgReturn,
        }),
      });
      if (res.ok) {
        alert('Strategy published to App Universe!');
        fetchStrategies();
        setActiveTab('signals');
      }
    } catch (err) {
      alert('Failed to save strategy.');
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 w-full max-w-[1800px] mx-auto flex flex-col lg:flex-row gap-6">
      {/* Sidebar Navigation Tabs (15% Width) */}
      <aside className="w-full lg:w-[15%] min-w-[220px] flex flex-col gap-5 shrink-0">
        {/* Brand Header */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl font-bold flex items-center gap-2 shadow-md">
            <TrendingUp className="w-5 h-5" />
            <span className="text-lg tracking-tight font-extrabold">LaughingStock</span>
          </div>
          <div>
            <h1 className="text-xs font-semibold text-foreground">Market Intelligence</h1>
            <p className="text-[10px] text-muted">Typeface.ai JEV Signals</p>
          </div>
        </div>

        {/* Vertical Navigation Tabs */}
        <nav className="bg-card border border-border rounded-xl p-2 shadow-sm flex flex-col gap-1.5 text-sm font-medium relative z-10">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition text-xs font-semibold cursor-pointer relative z-10 ${
              activeTab === 'dashboard'
                ? 'bg-blue-600/15 text-blue-500 font-bold border-l-4 border-blue-500 shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card/50'
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0 pointer-events-none" /> <span className="pointer-events-none">Dashboard</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('portfolio')}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition text-xs font-semibold cursor-pointer relative z-10 ${
              activeTab === 'portfolio'
                ? 'bg-blue-600/15 text-blue-500 font-bold border-l-4 border-blue-500 shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card/50'
            }`}
          >
            <Briefcase className="w-4 h-4 shrink-0 pointer-events-none" /> <span className="pointer-events-none">Portfolio</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('research')}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition text-xs font-semibold cursor-pointer relative z-10 ${
              activeTab === 'research'
                ? 'bg-blue-600/15 text-blue-500 font-bold border-l-4 border-blue-500 shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card/50'
            }`}
          >
            <Search className="w-4 h-4 shrink-0 pointer-events-none" /> <span className="pointer-events-none">Conviction Detector</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('miner')}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition text-xs font-semibold cursor-pointer relative z-10 ${
              activeTab === 'miner'
                ? 'bg-blue-600/15 text-blue-500 font-bold border-l-4 border-blue-500 shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card/50'
            }`}
          >
            <FlaskConical className="w-4 h-4 shrink-0 pointer-events-none" /> <span className="pointer-events-none">Phase 2: Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('signals')}
            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition text-xs font-semibold cursor-pointer relative z-10 ${
              activeTab === 'signals'
                ? 'bg-blue-600/15 text-blue-500 font-bold border-l-4 border-blue-500 shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-card/50'
            }`}
          >
            <Radio className="w-4 h-4 shrink-0 pointer-events-none" /> <span className="pointer-events-none">Phase 3: Monitoring</span>
          </button>
        </nav>

        {/* Portfolio Cash & Account Controls */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3 mt-auto">
          <div>
            <div className="text-[11px] text-muted font-medium">Available Cash</div>
            <div className="text-base font-extrabold text-emerald-500">
              ${portfolio ? portfolio.cash.toLocaleString() : '100,000.00'}
            </div>
          </div>
          <div className="pt-2 border-t border-border">
            {session ? (
              <button
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs px-3 py-2 rounded-lg font-bold hover:bg-blue-500/20"
              >
                <UserCheck className="w-3.5 h-3.5" /> {session.user?.name || 'User'}
              </button>
            ) : (
              <button
                onClick={() => signIn()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-lg font-bold text-center"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area (80% Width) */}
      <main className="w-full lg:w-[80%] flex-1 space-y-6 min-w-0">

      {/* VIEW 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="text-xs text-muted font-medium">Portfolio Net Worth</div>
              <div className="text-2xl font-extrabold mt-1 text-foreground">
                ${portfolio ? portfolio.netWorth.toLocaleString() : '148,920.50'}
              </div>
              <div className="text-xs text-emerald-500 font-semibold mt-1 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> +$3,420.00 (+2.35%) <span className="text-muted font-normal">Today</span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="text-xs text-muted font-medium">Total Unrealized P&L</div>
              <div className="text-2xl font-extrabold mt-1 text-emerald-500">
                +${portfolio ? portfolio.totalUnrealizedPL.toLocaleString() : '24,180.00'}
              </div>
              <div className="text-xs text-emerald-500 font-semibold mt-1">+19.38% Return</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="text-xs text-muted font-medium">Typeface.ai JEV Signals</div>
              <div className="text-2xl font-extrabold mt-1 text-blue-500">7 Active</div>
              <div className="text-xs text-muted mt-1">4 High Probability (&gt;75%)</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="text-xs text-muted font-medium">Mined Ticker Strategies</div>
              <div className="text-2xl font-extrabold mt-1 text-purple-500">{strategies.length} Shared</div>
              <div className="text-xs text-muted mt-1">App Universe Shared</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-lg text-foreground">Current Holdings Performance</h2>
                <button onClick={() => setActiveTab('portfolio')} className="text-xs text-blue-500 hover:underline font-medium">
                  Manage Portfolio →
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted border-b border-border uppercase">
                    <tr>
                      <th className="pb-3 font-semibold">Symbol</th>
                      <th className="pb-3 font-semibold">Shares</th>
                      <th className="pb-3 font-semibold">Avg Cost</th>
                      <th className="pb-3 font-semibold">Market Price</th>
                      <th className="pb-3 font-semibold">Total Value</th>
                      <th className="pb-3 font-semibold">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {portfolio && portfolio.positions ? (
                      portfolio.positions.map((pos: any) => (
                        <tr key={pos.symbol}>
                          <td className="py-3 font-bold text-blue-500">{pos.symbol}</td>
                          <td>{pos.quantity}</td>
                          <td>${pos.avgCost.toFixed(2)}</td>
                          <td>${pos.currentPrice?.toFixed(2) || '128.50'}</td>
                          <td>${pos.marketValue?.toLocaleString() || (pos.quantity * pos.avgCost).toLocaleString()}</td>
                          <td className={pos.unrealizedPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL?.toFixed(2) || '0.00'} ({pos.unrealizedPLPct}%)
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted">Loading holdings...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Signals Sidebar */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-3">
                <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Typeface.ai JEV Signals
                </h2>
                <button onClick={() => setActiveTab('signals')} className="text-xs text-blue-500 hover:underline">View All</button>
              </div>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-emerald-400">NVDA • BUY Signal</span>
                    <span className="text-xs bg-emerald-500 text-white font-bold px-2 py-0.5 rounded">JEV: 84% Prob</span>
                  </div>
                  <p className="text-xs text-muted">RSI oversold rebound + 20-EMA Golden Cross detected on 3-day pre-move window.</p>
                </div>
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-rose-400">AMD • SHORT Signal</span>
                    <span className="text-xs bg-rose-500 text-white font-bold px-2 py-0.5 rounded">JEV: 76% Prob</span>
                  </div>
                  <p className="text-xs text-muted">Bollinger Upper Band rejection with heavy volume spike pre-drop pattern.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW 2: PORTFOLIO MANAGEMENT */}
      {activeTab === 'portfolio' && (
        <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border rounded-xl p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-bold">Your Single Portfolio</h2>
              <p className="text-xs text-muted">Manage trades, cash balances, and monitor execution metrics in real-time.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setTradeType('BUY'); setTradeModalOpen(true); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Buy Stock
              </button>
              <button
                onClick={() => { setTradeType('SELL'); setTradeModalOpen(true); }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm"
              >
                <Minus className="w-4 h-4" /> Sell Stock
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-md border-b border-border pb-3">Open Positions & P&L Analysis</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted border-b border-border uppercase">
                    <tr>
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Shares</th>
                      <th className="pb-3">Avg Cost</th>
                      <th className="pb-3">Current Price</th>
                      <th className="pb-3">Market Value</th>
                      <th className="pb-3">Total P&L</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {portfolio && portfolio.positions && portfolio.positions.map((pos: any) => (
                      <tr key={pos.symbol}>
                        <td className="py-3 font-bold">{pos.symbol}</td>
                        <td>{pos.quantity}</td>
                        <td>${pos.avgCost.toFixed(2)}</td>
                        <td>${pos.currentPrice?.toFixed(2) || '128.50'}</td>
                        <td>${pos.marketValue?.toLocaleString() || (pos.quantity * pos.avgCost).toLocaleString()}</td>
                        <td className={pos.unrealizedPL >= 0 ? 'text-emerald-500 font-semibold' : 'text-rose-500 font-semibold'}>
                          {pos.unrealizedPL >= 0 ? '+' : ''}${pos.unrealizedPL?.toFixed(2)}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => { setTradeSymbol(pos.symbol); setTradeType('SELL'); setTradeModalOpen(true); }}
                            className="text-xs bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-2.5 py-1 rounded border border-rose-500/30"
                          >
                            Sell
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-md border-b border-border pb-3">Recent Transactions</h3>
              <div className="space-y-3 text-xs">
                {portfolio && portfolio.trades && portfolio.trades.length > 0 ? (
                  portfolio.trades.map((t: any) => (
                    <div key={t.id} className="flex justify-between items-center p-2.5 rounded bg-background border border-border">
                      <div>
                        <span className={`font-bold ${t.type === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {t.type} {t.symbol}
                        </span> • {t.quantity} shares @ ${t.price.toFixed(2)}
                        <div className="text-[10px] text-muted">{new Date(t.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="font-semibold text-right">${t.total.toLocaleString()}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted text-center py-4">No recent trade activity</div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VIEW 3: POST-OPEN CONVICTION DAY DETECTOR STUDIO */}
      {activeTab === 'research' && (
        <section className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sliders className="w-6 h-6 text-amber-400" /> Post-Open Conviction Day Detector Studio
                </h2>
                <p className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
                  <span>Adjust parameters in real-time to recalculate VolumeMA(x), RVOL, MedianPriceMA(y), Range%, & GapMA(z) across 365 daily bars.</span>
                  {researchData?.dbSavedCount !== undefined && (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1">
                      🗄️ {researchData.dbSavedCount} Daily Bars in DB
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <input
                  type="text"
                  value={researchSymbol}
                  onChange={(e) => setResearchSymbol(e.target.value.toUpperCase())}
                  className="bg-background border border-border rounded-lg px-4 py-2 font-bold uppercase text-lg text-foreground w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={() => fetchResearch(researchSymbol)}
                  className="bg-amber-600 text-black font-bold text-sm px-4 py-2 rounded-lg hover:bg-amber-500 flex items-center gap-1.5 shadow"
                >
                  <Sparkles className="w-4 h-4" /> Refresh Ticker
                </button>
              </div>
            </div>

            {/* Configurable Parameter Control Panel (x, y, z, V_min, M) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
              {/* 1. Volume MA (x) - Step 1, Default 15 */}
              <div className="bg-background p-3 rounded-lg border border-border space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-amber-400 font-bold block">Volume MA (x)</label>
                  <span className="text-[10px] text-muted">bars</span>
                </div>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setParamX((prev) => Math.max(5, prev - 1))}
                    className="w-8 h-8 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-extrabold text-lg flex items-center justify-center border border-amber-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Decrease Volume MA by 1"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={paramX}
                    onChange={(e) => setParamX(Number(e.target.value))}
                    min="5"
                    max="50"
                    step="1"
                    className="w-full bg-transparent text-center font-bold text-amber-400 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParamX((prev) => Math.min(50, prev + 1))}
                    className="w-8 h-8 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-extrabold text-lg flex items-center justify-center border border-amber-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Increase Volume MA by 1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 2. RVOL Threshold (V_min) - Step 0.1, Default 1.3 */}
              <div className="bg-background p-3 rounded-lg border border-border space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-amber-400 font-bold block">RVOL (V_min)</label>
                  <span className="text-[10px] text-muted">mult</span>
                </div>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setParamVmin((prev) => Math.max(1.0, Number((prev - 0.1).toFixed(1))))}
                    className="w-8 h-8 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-extrabold text-lg flex items-center justify-center border border-amber-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Decrease RVOL by 0.1"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={paramVmin}
                    onChange={(e) => setParamVmin(Number(e.target.value))}
                    step="0.1"
                    min="1.0"
                    max="5.0"
                    className="w-full bg-transparent text-center font-bold text-amber-400 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParamVmin((prev) => Math.min(5.0, Number((prev + 0.1).toFixed(1))))}
                    className="w-8 h-8 rounded bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 font-extrabold text-lg flex items-center justify-center border border-amber-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Increase RVOL by 0.1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 3. Median Price MA (y) - Step 1, Default 3 */}
              <div className="bg-background p-3 rounded-lg border border-border space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-cyan-400 font-bold block">Median Price MA (y)</label>
                  <span className="text-[10px] text-muted">bars</span>
                </div>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setParamY((prev) => Math.max(1, prev - 1))}
                    className="w-8 h-8 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-extrabold text-lg flex items-center justify-center border border-cyan-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Decrease Median Price MA by 1"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={paramY}
                    onChange={(e) => setParamY(Number(e.target.value))}
                    min="1"
                    max="20"
                    step="1"
                    className="w-full bg-transparent text-center font-bold text-cyan-400 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParamY((prev) => Math.min(20, prev + 1))}
                    className="w-8 h-8 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-extrabold text-lg flex items-center justify-center border border-cyan-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Increase Median Price MA by 1"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 4. Min Range % (M) - Step 0.5, Default 5.0% */}
              <div className="bg-background p-3 rounded-lg border border-border space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-purple-400 font-bold block">Min Range % (M)</label>
                  <span className="text-[10px] text-muted">%</span>
                </div>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setParamM((prev) => Math.max(1.0, Number((prev - 0.5).toFixed(1))))}
                    className="w-8 h-8 rounded bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 font-extrabold text-lg flex items-center justify-center border border-purple-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Decrease Min Range % by 0.5"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={paramM}
                    onChange={(e) => setParamM(Number(e.target.value))}
                    step="0.5"
                    min="1.0"
                    max="15.0"
                    className="w-full bg-transparent text-center font-bold text-purple-400 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParamM((prev) => Math.min(15.0, Number((prev + 0.5).toFixed(1))))}
                    className="w-8 h-8 rounded bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 font-extrabold text-lg flex items-center justify-center border border-purple-500/40 transition cursor-pointer select-none active:scale-95"
                    title="Increase Min Range % by 0.5"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 5. Gap MA (z) - Step 1, Default 20 */}
              <div className="bg-background p-3 rounded-lg border border-border space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-muted font-bold block">Gap MA Window (z)</label>
                  <span className="text-[10px] text-muted">bars</span>
                </div>
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setParamZ((prev) => Math.max(5, prev - 1))}
                    className="w-8 h-8 rounded bg-muted/20 hover:bg-muted/40 text-foreground font-extrabold text-lg flex items-center justify-center border border-border transition cursor-pointer select-none active:scale-95"
                    title="Decrease Gap MA by 1"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={paramZ}
                    onChange={(e) => setParamZ(Number(e.target.value))}
                    min="5"
                    max="50"
                    step="1"
                    className="w-full bg-transparent text-center font-bold text-foreground text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParamZ((prev) => Math.min(50, prev + 1))}
                    className="w-8 h-8 rounded bg-muted/20 hover:bg-muted/40 text-foreground font-extrabold text-lg flex items-center justify-center border border-border transition cursor-pointer select-none active:scale-95"
                    title="Increase Gap MA by 1"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Chart with Conviction Visual Markers & Line Graphs */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="px-3 py-1 bg-amber-500 text-black font-bold rounded flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" /> Conviction Days Flagged: {researchData?.convictionCount || 0}
                </span>
                <span className="px-3 py-1 bg-background border border-border rounded text-muted">
                  365 Daily Candles Harvested
                </span>
              </div>
              <div className="text-xs text-muted">
                Rules: RVOL &gt; {paramVmin}x • Range Straddle (Median y={paramY}) • Range% &gt; {paramM}%
              </div>
            </div>

            <StockChart candles={researchData?.candles || []} onRangeSelect={handleRangeSelect} />
          </div>

          {/* Intraday Bar Inspector (Triggered by Range Selection on Chart) */}
          {selectedRange && (
            <div className="bg-card border border-cyan-500/40 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="font-bold text-md text-cyan-400 flex items-center gap-2">
                    🎯 Intraday Bar Inspector ({intraday15mResult?.interval || '15m'} Bars)
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Pre-move window selected on chart: <strong className="text-foreground">{selectedRange.startDate}</strong> to <strong className="text-foreground">{selectedRange.endDate}</strong> ({selectedRange.candleCount} daily sessions)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-lg font-mono font-bold">
                    {intraday15mResult?.totalBars || intraday15mResult?.total15mBars || 0} Bars ({intraday15mResult?.interval || '15m'})
                  </span>
                  <button
                    onClick={() => handleRangeSelect(null)}
                    className="text-xs bg-card border border-border text-muted hover:text-foreground px-3 py-1 rounded-lg font-semibold"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {intraday15mResult?.providerNotice && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 font-semibold flex items-center gap-2">
                  <span>⚠️ {intraday15mResult.providerNotice}</span>
                </div>
              )}

              {loadingIntraday15m ? (
                <div className="p-8 text-center text-muted text-sm italic">
                  Fetching 15m intraday bars for selected range...
                </div>
              ) : intraday15mResult && intraday15mResult.candles && intraday15mResult.candles.length > 0 ? (
                <div className="space-y-3">
                  <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-border rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] text-muted border-b border-border uppercase bg-background sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">15m Timestamp</th>
                          <th className="py-2.5 px-3">Open</th>
                          <th className="py-2.5 px-3">High</th>
                          <th className="py-2.5 px-3">Low</th>
                          <th className="py-2.5 px-3">Close</th>
                          <th className="py-2.5 px-3">Volume</th>
                          <th className="py-2.5 px-3">15m VolMA</th>
                          <th className="py-2.5 px-3">15m RVOL</th>
                          <th className="py-2.5 px-3">15m Range %</th>
                          <th className="py-2.5 px-3 text-right">Intraday Signal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-mono">
                        {intraday15mResult.candles.map((bar: any, idx: number) => (
                          <tr key={idx} className={bar.isVolumeSpike ? 'bg-amber-500/10 font-bold' : 'hover:bg-background/40'}>
                            <td className="py-2 px-3 font-semibold text-cyan-400">{bar.date}</td>
                            <td className="py-2 px-3">${bar.open.toFixed(2)}</td>
                            <td className="py-2 px-3 text-emerald-400">${bar.high.toFixed(2)}</td>
                            <td className="py-2 px-3 text-rose-400">${bar.low.toFixed(2)}</td>
                            <td className="py-2 px-3 font-bold">${bar.close.toFixed(2)}</td>
                            <td className="py-2 px-3">{bar.volume.toLocaleString()}</td>
                            <td className="py-2 px-3 text-amber-400">{bar.volumeMA?.toLocaleString()}</td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bar.rvol > 1.5 ? 'bg-amber-500 text-black' : 'bg-background text-muted border border-border'}`}>
                                {bar.rvol}x
                              </span>
                            </td>
                            <td className="py-2 px-3 text-purple-400 font-bold">{bar.rangePct}%</td>
                            <td className="py-2 px-3 text-right font-sans">
                              {bar.isVolumeSpike ? (
                                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] px-2 py-0.5 rounded font-bold">
                                  🔥 Vol Spike
                                </span>
                              ) : (
                                <span className="text-muted text-[10px]">Normal</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-muted text-xs italic">
                  No 15m intraday data available for the selected date range.
                </div>
              )}
            </div>
          )}

          {/* Flagged Conviction Candidates Table */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-md text-foreground flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" /> Flagged Conviction Candidate Sessions ({researchData?.convictionCount || 0})
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Verify each conviction day by selecting its 15m research range on the chart above.
                </p>
              </div>

              {/* Master "Add for Research" Action Button */}
              <button
                type="button"
                disabled={Object.keys(verifiedRanges).length === 0 || isSubmittingResearch}
                onClick={handleAddForResearch}
                className={`text-xs px-4 py-2 rounded-lg font-extrabold flex items-center gap-1.5 transition ${
                  Object.keys(verifiedRanges).length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg animate-pulse'
                    : 'bg-muted/20 text-muted border border-border cursor-not-allowed opacity-60'
                }`}
              >
                <Plus className="w-4 h-4" /> Add for Research ({Object.keys(verifiedRanges).length} Verified)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted border-b border-border uppercase">
                  <tr>
                    <th className="pb-3">Conviction Date</th>
                    <th className="pb-3">Open</th>
                    <th className="pb-3">High / Low Range</th>
                    <th className="pb-3">Close</th>
                    <th className="pb-3">RVOL (x={paramX})</th>
                    <th className="pb-3">Median (y={paramY})</th>
                    <th className="pb-3">Range %</th>
                    <th className="pb-3">Verified 15m Range</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium">
                  {researchData && researchData.candidates && researchData.candidates.length > 0 ? (
                    researchData.candidates.map((cand: any) => (
                      <tr key={cand.date} className="hover:bg-background/50 transition">
                        <td className="py-3 font-bold text-amber-400">{cand.date}</td>
                        <td>${cand.open.toFixed(2)}</td>
                        <td className="text-xs text-muted">${cand.high.toFixed(2)} – ${cand.low.toFixed(2)}</td>
                        <td className="font-bold">${cand.close.toFixed(2)}</td>
                        <td>
                          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold text-xs">
                            {cand.rvol}x
                          </span>
                        </td>
                        <td className="text-xs">${cand.medianPriceMA.toFixed(2)}</td>
                        <td className="text-purple-400 font-bold">{cand.rangePct}%</td>
                        <td>
                          {verifiedRanges[cand.date] ? (
                            <div className="flex items-center gap-2">
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono text-xs font-bold flex items-center gap-1">
                                🟢 {verifiedRanges[cand.date].startDate} → {verifiedRanges[cand.date].endDate} (15m)
                              </span>
                              <button
                                type="button"
                                onClick={() => removeRangeFromCandidate(cand.date)}
                                className="text-muted hover:text-rose-400 text-xs font-bold px-1"
                                title="Remove attached range"
                              >
                                ✕
                              </button>
                            </div>
                          ) : selectedRange ? (
                            <button
                              type="button"
                              onClick={() => attachRangeToCandidate(cand.date, cand)}
                              className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-xs px-2.5 py-1 rounded font-bold hover:bg-cyan-500/30 transition"
                            >
                              + Attach Range ({selectedRange.startDate} - {selectedRange.endDate})
                            </button>
                          ) : (
                            <span className="text-muted text-xs italic">⚪ Unverified (Drag range on chart)</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setMinerSymbol(researchSymbol);
                              setActiveTab('miner');
                              runMiner(researchSymbol);
                            }}
                            className="text-xs bg-purple-600 text-white px-2.5 py-1 rounded font-semibold hover:bg-purple-700 shadow"
                          >
                            Mine Fingerprint →
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted italic">
                        No conviction sessions found matching current parameters (RVOL &gt; {paramVmin}x, Range% &gt; {paramM}%). Try lowering thresholds.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* VIEW 4: PHASE 2 ANALYSIS & STRATEGY ENGINE */}
      {activeTab === 'miner' && (
        <section className="space-y-6">
          {/* Approved Research Datasets & Potential Candidates Panel */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3 border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-md text-emerald-400 flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-emerald-400" /> Approved Research Datasets & Candidates ({savedDatasets.length})
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Named 15m intraday datasets (<code className="text-amber-400 font-mono">{"{SYMBOL}_{MMDDYYYY}_{ROI}"}</code>) approved for research and persisted to database.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchSavedDatasets}
                className="text-xs bg-background border border-border text-muted hover:text-foreground px-3 py-1.5 rounded-lg font-semibold cursor-pointer"
              >
                Refresh Datasets
              </button>
            </div>

            {savedDatasets.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted border-b border-border uppercase">
                    <tr>
                      <th className="pb-3">Dataset Name</th>
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Conviction Date</th>
                      <th className="pb-3">ROI / Range %</th>
                      <th className="pb-3">15m Date Range</th>
                      <th className="pb-3">Bars Saved</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {savedDatasets.map((ds: any) => (
                      <tr key={ds.id} className="hover:bg-background/50 transition">
                        <td className="py-3 font-mono font-bold text-amber-400">
                          <span className="bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded text-xs">
                            {ds.datasetName}
                          </span>
                        </td>
                        <td className="font-bold">{ds.symbol}</td>
                        <td className="text-xs text-muted">{ds.convictionDate}</td>
                        <td className="text-purple-400 font-bold">{ds.roiPct.toFixed(1)}%</td>
                        <td className="text-xs font-mono">{ds.startDate} → {ds.endDate}</td>
                        <td className="text-xs text-cyan-400 font-bold">{ds.barCount} bars (15m)</td>
                        <td>
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px] font-bold">
                            🟢 {ds.status}
                          </span>
                        </td>
                        <td className="text-right py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setResearchSymbol(ds.symbol);
                                setActiveTab('research');
                                fetchIntraday15m(ds.symbol, ds.startDate, ds.endDate);
                              }}
                              className="text-xs bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 px-2.5 py-1 rounded font-semibold hover:bg-cyan-600/30 cursor-pointer"
                            >
                              Inspect 15m Bars
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMinerSymbol(ds.symbol);
                                runMiner(ds.symbol);
                              }}
                              className="text-xs bg-purple-600 text-white px-2.5 py-1 rounded font-semibold hover:bg-purple-700 shadow cursor-pointer"
                            >
                              Mine Fingerprint →
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (confirm(`Delete dataset ${ds.datasetName}?`)) {
                                  await fetch(`/api/research/datasets?id=${ds.id}`, { method: 'DELETE' });
                                  fetchSavedDatasets();
                                }
                              }}
                              className="text-xs bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 px-2 py-1 rounded border border-rose-500/30 cursor-pointer"
                              title="Delete Dataset"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted text-xs italic">
                No approved research datasets persisted yet. Select a 15m range on the chart in Research Studio and click "+ Attach Range" on a conviction candidate to generate a dataset!
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FlaskConical className="w-6 h-6 text-purple-400" /> Phase 2: Analysis & Strategy Formalization
                </h2>
                <p className="text-xs text-muted mt-1">
                  Analyzes pre-move technical fingerprints, constructs JEV prompts, and outputs Typeface.ai JEV action scores.
                </p>
              </div>
              <span className="text-xs font-mono bg-purple-500/20 text-purple-400 border border-purple-500/40 px-3 py-1 rounded-full">
                Typeface.ai JEV Engine
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Target Symbol</label>
                <input
                  type="text"
                  value={minerSymbol}
                  onChange={(e) => setMinerSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 font-bold uppercase text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Move Threshold (%)</label>
                <input
                  type="number"
                  value={minerPct}
                  onChange={(e) => setMinerPct(Number(e.target.value))}
                  step="0.5"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Lookahead (Days)</label>
                <input
                  type="number"
                  value={minerDays}
                  onChange={(e) => setMinerDays(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Pre-Move Window (Bars)</label>
                <input
                  type="number"
                  value={minerBars}
                  onChange={(e) => setMinerBars(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => runMiner()}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm py-2 rounded-lg shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" /> Run Analysis
                </button>
              </div>
            </div>
          </div>

          {minerResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-md border-b border-border pb-2 flex justify-between items-center">
                  <span>📝 Typeface.ai JEV Model Prompt</span>
                  <span className="text-xs text-emerald-500 font-normal">Auto-Generated</span>
                </h3>
                <textarea
                  readOnly
                  value={minerResult.miningResult.jevPrompt}
                  className="w-full h-64 bg-[#0d1117] text-emerald-400 font-mono text-xs p-3 rounded-lg border border-border focus:outline-none leading-relaxed"
                />
                <button
                  onClick={saveStrategy}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2 rounded-lg shadow transition"
                >
                  💾 Adopt Strategy into App Universe
                </button>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-bold text-md border-b border-border pb-2 flex justify-between items-center">
                  <span>🧠 Typeface.ai JEV Deterministic Action Scores</span>
                  <span className="text-xs text-purple-400 font-semibold bg-purple-500/20 px-2 py-0.5 rounded">Evaluated</span>
                </h3>

                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-emerald-400">BUY (Long Entry)</span>
                      <span className="text-emerald-400">{minerResult.jevEvaluation.probabilities.BUY}%</span>
                    </div>
                    <div className="w-full bg-background h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${minerResult.jevEvaluation.probabilities.BUY}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-blue-400">HOLD (Maintain Position)</span>
                      <span className="text-blue-400">{minerResult.jevEvaluation.probabilities.HOLD}%</span>
                    </div>
                    <div className="w-full bg-background h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${minerResult.jevEvaluation.probabilities.HOLD}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-rose-400">SELL (Exit Position)</span>
                      <span className="text-rose-400">{minerResult.jevEvaluation.probabilities.SELL}%</span>
                    </div>
                    <div className="w-full bg-background h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${minerResult.jevEvaluation.probabilities.SELL}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-amber-400">SHORT (Short Entry)</span>
                      <span className="text-amber-400">{minerResult.jevEvaluation.probabilities.SHORT}%</span>
                    </div>
                    <div className="w-full bg-background h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${minerResult.jevEvaluation.probabilities.SHORT}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-gray-400">NONE (Do Not Make Any Move)</span>
                      <span className="text-gray-400">{minerResult.jevEvaluation.probabilities.NONE}%</span>
                    </div>
                    <div className="w-full bg-background h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-gray-500 h-full rounded-full" style={{ width: `${minerResult.jevEvaluation.probabilities.NONE}%` }} />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-background rounded-lg border border-border text-xs space-y-1">
                  <div className="font-bold text-foreground">Typeface.ai JEV Rationale:</div>
                  <p className="text-muted">{minerResult.jevEvaluation.rationale}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* VIEW 5: PHASE 3 MONITORING */}
      {activeTab === 'signals' && (
        <section className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold">Phase 3: Live Market Monitoring & Typeface.ai JEV Signals</h2>
              <p className="text-xs text-muted">Active strategies applied to live market data predicting directional moves.</p>
            </div>
            <div className="text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded-lg font-semibold">
              🌐 {strategies.length} Shared Strategies Active
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-md border-b border-border pb-3">Community Strategy Repository</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted border-b border-border uppercase">
                  <tr>
                    <th className="pb-3">Ticker</th>
                    <th className="pb-3">Strategy Name</th>
                    <th className="pb-3">Created By</th>
                    <th className="pb-3">Pre-Move Config</th>
                    <th className="pb-3">Win Rate</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {strategies.map((strat) => (
                    <tr key={strat.id}>
                      <td className="py-3 font-bold text-blue-500">{strat.symbol}</td>
                      <td className="font-semibold">{strat.name}</td>
                      <td>{strat.creator?.name || '@trader'}</td>
                      <td>+{strat.moveThresholdPct}% move / {strat.lookbackBars}-bar window</td>
                      <td className="text-emerald-500 font-bold">{strat.winRate}%</td>
                      <td className="text-right">
                        <button
                          onClick={() => {
                            setMinerSymbol(strat.symbol);
                            setActiveTab('miner');
                            runMiner(strat.symbol);
                          }}
                          className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded font-semibold hover:bg-blue-700"
                        >
                          Inspect & Run Analysis
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      </main>

      {/* Right Buffer (5% Width) */}
      <div className="hidden lg:block lg:w-[5%] shrink-0 pointer-events-none" />

      {/* Trade Execution Modal */}
      {tradeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground">Execute Trade Order</h3>
              <button onClick={() => setTradeModalOpen(false)} className="text-muted hover:text-foreground font-bold">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Symbol</label>
                <input
                  type="text"
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 font-bold uppercase text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Action</label>
                <select
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
                >
                  <option value="BUY">BUY Shares</option>
                  <option value="SELL">SELL Shares</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Quantity (Shares)</label>
                <input
                  type="number"
                  value={tradeQty}
                  onChange={(e) => setTradeQty(Number(e.target.value))}
                  min="1"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-3 border-t border-border">
              <button onClick={() => setTradeModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold text-muted">
                Cancel
              </button>
              <button onClick={handleExecuteTrade} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow">
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
