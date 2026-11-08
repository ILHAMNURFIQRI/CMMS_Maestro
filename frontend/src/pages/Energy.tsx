import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Zap, TrendingUp, BatteryCharging } from 'lucide-react';

export const Energy = () => {
  // Mock data for factory energy consumption
  const hourlyData = Array.from({ length: 24 }).map((_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    line1: 120 + ((i * 17) % 40) + (i > 8 && i < 18 ? 80 : 0),
    line2: 90 + ((i * 13) % 30) + (i > 8 && i < 18 ? 60 : 0),
    total:
      210 +
      ((i * 17) % 40) +
      ((i * 13) % 30) +
      (i > 8 && i < 18 ? 140 : 0),
  }));

  const totalToday = Math.round(hourlyData.reduce((acc, curr) => acc + curr.total, 0));
  const peakLoad = Math.round(Math.max(...hourlyData.map(d => d.total)));

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Energy Monitoring</h2>
        <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">POWER CONSUMPTION ANALYTICS</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="neo-card p-6 bg-white flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="font-black uppercase text-sm bg-neo-black text-white px-2 border-2 border-black">TOTAL CONSUMPTION (TODAY)</h3>
            <Zap className="text-neo-blue" />
          </div>
          <div className="text-5xl font-black mt-4">{totalToday.toLocaleString()} <span className="text-lg">kWh</span></div>
        </div>
        <div className="neo-card p-6 bg-neo-silver flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="font-black uppercase text-sm bg-neo-black text-white px-2 border-2 border-black">PEAK LOAD</h3>
            <TrendingUp className="text-status-critical" />
          </div>
          <div className="text-5xl font-black mt-4 text-status-critical">{peakLoad} <span className="text-lg text-neo-black">kW</span></div>
        </div>
        <div className="neo-card p-6 bg-neo-blue text-white flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="font-black uppercase text-sm bg-white text-neo-black px-2 border-2 border-black">POWER EFFICIENCY (PUE)</h3>
            <BatteryCharging className="text-neo-silver" />
          </div>
          <div className="text-5xl font-black mt-4">1.18 <span className="text-lg text-neo-silver font-mono">TARGET: 1.15</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card p-6 bg-white">
          <h3 className="text-lg font-black uppercase mb-6 text-white bg-neo-black inline-block px-2 border-2 border-black">Hourly Power Load (24h)</h3>
          <div className="h-80 border-4 border-neo-black p-2 bg-neo-bg">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.1} />
                <XAxis dataKey="hour" tick={{fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold'}} />
                <YAxis tick={{fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} 
                  itemStyle={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                <Line type="stepAfter" dataKey="total" name="Total (kW)" stroke="#0F172A" strokeWidth={4} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neo-card p-6 bg-neo-silver">
          <h3 className="text-lg font-black uppercase mb-6 text-white bg-neo-blue inline-block px-2 border-2 border-black">Line Distribution</h3>
          <div className="h-80 border-4 border-neo-black p-2 bg-white">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.1} />
                <XAxis dataKey="hour" tick={{fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold'}} />
                <YAxis tick={{fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} 
                  itemStyle={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'monospace', fontWeight: 'bold' }} />
                <Bar dataKey="line1" stackId="a" name="CNC Line" fill="#2563EB" stroke="#000" strokeWidth={2} />
                <Bar dataKey="line2" stackId="a" name="Assembly Line" fill="#CBD5E1" stroke="#000" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
