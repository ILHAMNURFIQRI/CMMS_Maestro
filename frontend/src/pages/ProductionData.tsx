import { useState, useEffect, useCallback } from 'react';
import { localDataProvider } from '../services/LocalDataProvider';
import type { Machine, ProductionMetrics } from '../types/machine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  FlaskConical, TrendingUp, TrendingDown, Minus, Factory, Gauge, Activity, AlertTriangle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MachineProductionRow {
  machine: Machine;
  metrics: ProductionMetrics;
  yesterdayOutput: number;
  todayOutput: number;
  forecastOutput: number;
  yesterdayOee: number;
  todayOee: number;
  forecastOee: number;
  deltaOutput: number;   // % forecast vs today
  deltaOee: number;      // % forecast vs today
}

/* ------------------------------------------------------------------ */
/*  Deterministic helpers                                              */
/* ------------------------------------------------------------------ */

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const ProductionData = () => {
  const [rows, setRows] = useState<MachineProductionRow[]>([]);
  const [simulationOn, setSimulationOn] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const machines = await localDataProvider.getMachines();
    const newRows: MachineProductionRow[] = [];

    for (const m of machines) {
      const metrics = await localDataProvider.getProductionMetrics(m.id);
      if (!metrics) continue;

      const seed = m.id.charCodeAt(m.id.length - 1) + m.id.charCodeAt(m.id.length - 2);

      // --- Today (live) ---
      const todayOutput = metrics.production_output;
      const todayOee = metrics.oee;

      // --- Yesterday (deterministic variation) ---
      const yVariance = 0.85 + seededRandom(seed * 3) * 0.3;          // 85% – 115%
      const yesterdayOutput = Math.round(todayOutput * yVariance);
      const yesterdayOee = clamp(+(todayOee * (0.9 + seededRandom(seed * 7) * 0.2)).toFixed(1), 40, 99);

      // --- Forecast (health-driven) ---
      const healthFactor = m.health_score / 100;
      let forecastMul = 1.0;
      if (m.status === 'NORMAL')       forecastMul = 1.0 + seededRandom(seed * 11) * 0.04;
      else if (m.status === 'MONITORING') forecastMul = 0.92;
      else if (m.status === 'WARNING')    forecastMul = 0.85;
      else                                forecastMul = 0.70;

      const forecastOutput = Math.round(todayOutput * healthFactor * forecastMul);
      const forecastOee = clamp(+(todayOee * healthFactor * forecastMul).toFixed(1), 20, 99);

      const deltaOutput = todayOutput > 0
        ? +((forecastOutput - todayOutput) / todayOutput * 100).toFixed(1)
        : 0;
      const deltaOee = todayOee > 0
        ? +((forecastOee - todayOee) / todayOee * 100).toFixed(1)
        : 0;

      newRows.push({
        machine: m,
        metrics,
        yesterdayOutput,
        todayOutput,
        forecastOutput,
        yesterdayOee,
        todayOee,
        forecastOee,
        deltaOutput,
        deltaOee,
      });
    }

    setRows(newRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    window.addEventListener('mandor-data-update', loadData);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mandor-data-update', loadData);
    };
  }, [loadData]);

  /* ---- Aggregate KPIs ---- */
  const totalYesterdayOut = rows.reduce((s, r) => s + r.yesterdayOutput, 0);
  const totalTodayOut     = rows.reduce((s, r) => s + r.todayOutput, 0);
  const totalForecastOut  = rows.reduce((s, r) => s + r.forecastOutput, 0);
  const avgTodayOee       = rows.length ? +(rows.reduce((s, r) => s + r.todayOee, 0) / rows.length).toFixed(1) : 0;
  const avgForecastOee    = rows.length ? +(rows.reduce((s, r) => s + r.forecastOee, 0) / rows.length).toFixed(1) : 0;

  /* ---- Chart data ---- */
  const chartData = rows.map(r => ({
    name: r.machine.id,
    Yesterday: r.yesterdayOutput,
    Today: r.todayOutput,
    ...(simulationOn ? { Forecast: r.forecastOutput } : {}),
  }));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center font-mono font-black text-neo-black text-xl uppercase tracking-widest">
        Loading Production Data…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">

      {/* ============ HEADER ============ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">
            Production Data
          </h2>
          <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">
            DAILY OUTPUT · OEE · SIMULATION FORECASTING
          </p>
        </div>

        {/* Simulation toggle */}
        <button
          onClick={() => setSimulationOn(v => !v)}
          className={`neo-btn flex items-center gap-2 text-xs ${
            simulationOn
              ? '!bg-status-success !text-neo-black !border-neo-black'
              : ''
          }`}
        >
          <FlaskConical size={16} strokeWidth={3} className={simulationOn ? 'animate-pulse' : ''} />
          SIMULATION: {simulationOn ? 'ACTIVE' : 'OFF'}
        </button>
      </div>

      {/* ============ SIM BANNER ============ */}
      {simulationOn && (
        <div className="flex items-start gap-3 p-4 bg-status-success border-[3px] border-neo-black shadow-neo">
          <FlaskConical size={22} strokeWidth={3} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm uppercase">Simulation Production Data — Active</p>
            <p className="font-mono font-bold text-xs mt-0.5">
              Forecasted output for tomorrow is projected from each machine's live health score and current OEE, compared against today's actual figures.
            </p>
          </div>
        </div>
      )}

      {/* ============ KPI CARDS ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard label="MACHINES" value={String(rows.length)} sub={`${rows.filter(r => r.machine.status === 'NORMAL').length} NORMAL`} icon={<Factory size={22} strokeWidth={2.5} />} bg="bg-neo-silver" />
        <KpiCard label="TODAY OUTPUT" value={totalTodayOut.toLocaleString()} sub={`YEST: ${totalYesterdayOut.toLocaleString()}`} icon={<Activity size={22} strokeWidth={2.5} />} bg="bg-neo-white" />
        <KpiCard label="AVG OEE TODAY" value={`${avgTodayOee}%`} sub="FLEET AVERAGE" icon={<Gauge size={22} strokeWidth={2.5} />} bg="bg-neo-white" />
        {simulationOn ? (
          <KpiCard
            label="FORECAST OUTPUT"
            value={totalForecastOut.toLocaleString()}
            sub={`OEE: ${avgForecastOee}%`}
            icon={<TrendingUp size={22} strokeWidth={2.5} />}
            bg="bg-status-success"
          />
        ) : (
          <KpiCard label="TOTAL DEFECTS" value={rows.reduce((s, r) => s + r.metrics.defect_count, 0).toLocaleString()} sub="THIS SHIFT" icon={<AlertTriangle size={22} strokeWidth={2.5} />} bg="bg-status-warning" />
        )}
      </div>

      {/* ============ COMPARISON CHART ============ */}
      <div className="neo-card p-6 bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-black uppercase text-white bg-neo-black inline-block px-2 border-2 border-black shadow-neo-sm">
            {simulationOn ? 'Yesterday vs Today vs Forecast' : 'Yesterday vs Today'}
          </h3>
          <span className="font-mono font-bold text-xs text-neo-muted">UNITS PER MACHINE</span>
        </div>

        <div className="h-72 border-4 border-neo-black bg-white p-2 shadow-neo">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0F172A" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, fill: '#0F172A' }}
                stroke="#0F172A"
              />
              <YAxis
                tick={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 800, fill: '#0F172A' }}
                stroke="#0F172A"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '3px solid #0F172A',
                  boxShadow: '4px 4px 0px 0px rgba(15,23,42,1)',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                  borderRadius: 0,
                }}
                itemStyle={{ fontFamily: 'monospace', fontWeight: 800, color: '#0F172A' }}
                cursor={{ fill: 'rgba(0,0,0,0.06)' }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 11, paddingTop: 12 }}
                iconType="square"
              />
              <Bar dataKey="Yesterday" fill="#CBD5E1" stroke="#0F172A" strokeWidth={2} />
              <Bar dataKey="Today"     fill="#2563EB" stroke="#0F172A" strokeWidth={2} />
              {simulationOn && (
                <Bar dataKey="Forecast" fill="#10B981" stroke="#0F172A" strokeWidth={2} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ============ MACHINE DATA TABLE ============ */}
      <div className="neo-card p-0 bg-white overflow-hidden">
        <div className="p-4 border-b-[3px] border-neo-black bg-white flex justify-between items-center">
          <h3 className="text-sm font-black uppercase text-white bg-neo-blue inline-block px-2 border-2 border-black shadow-neo-sm">
            Per-Machine Production Data
          </h3>
          <span className="neo-badge text-xs bg-neo-silver">
            {rows.length} MACHINES
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-neo-black text-white sticky top-0">
              <tr>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs">ID</th>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs">MACHINE</th>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs">STATUS</th>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs text-right">YESTERDAY</th>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs text-right">TODAY</th>
                <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs text-right">OEE</th>
                {simulationOn && (
                  <>
                    <th className="p-3 border-b-2 border-r-2 border-neo-black font-black text-xs text-right bg-status-success text-neo-black">FORECAST</th>
                    <th className="p-3 border-b-2 border-neo-black font-black text-xs text-right bg-status-success text-neo-black">Δ%</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isPositive = r.deltaOutput >= 0;
                return (
                  <tr key={r.machine.id} className={i % 2 === 0 ? 'bg-neo-bg' : 'bg-white'}>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black font-black">{r.machine.id}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black truncate max-w-[120px]">{r.machine.name}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black">
                      <span className={`px-1 border border-neo-black font-black text-xs ${
                        r.machine.status === 'NORMAL' ? 'bg-status-success' :
                        r.machine.status === 'CRITICAL' || r.machine.status === 'INTERVENTION' ? 'bg-status-critical text-white' :
                        'bg-status-warning'
                      }`}>
                        {r.machine.status}
                      </span>
                    </td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black text-right font-bold text-neo-muted">{r.yesterdayOutput.toLocaleString()}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black text-right font-black">{r.todayOutput.toLocaleString()}</td>
                    <td className="p-3 border-b-2 border-r-2 border-neo-black text-right font-bold">{r.todayOee}%</td>
                    {simulationOn && (
                      <>
                        <td className="p-3 border-b-2 border-r-2 border-neo-black text-right font-black text-status-success">{r.forecastOutput.toLocaleString()}</td>
                        <td className="p-3 border-b-2 border-neo-black text-right">
                          <span className={`inline-flex items-center gap-1 font-black text-xs ${isPositive ? 'text-status-success' : 'text-status-critical'}`}>
                            {isPositive
                              ? <TrendingUp size={12} strokeWidth={3} />
                              : r.deltaOutput === 0
                                ? <Minus size={12} strokeWidth={3} />
                                : <TrendingDown size={12} strokeWidth={3} />
                            }
                            {isPositive ? '+' : ''}{r.deltaOutput}%
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  KPI Card (matches Dashboard pattern)                               */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, sub, icon, bg }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className={`neo-card p-4 ${bg} flex flex-col justify-between`}>
      <div className="flex justify-between items-start">
        <div className="text-neo-black font-mono font-black text-xs bg-white inline-block px-1 border-2 border-black shadow-neo-sm">
          {label}
        </div>
        {icon}
      </div>
      <div className="text-4xl font-black text-neo-black mt-4">{value}</div>
      <div className="font-mono font-bold text-[10px] text-neo-muted mt-1 uppercase">{sub}</div>
    </div>
  );
}
