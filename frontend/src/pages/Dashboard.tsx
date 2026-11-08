import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, AlertTriangle, Zap, CheckCircle } from 'lucide-react';

export const Dashboard = () => {
  const energyData = [
    { time: '08:00', kw: 240 },
    { time: '09:00', kw: 310 },
    { time: '10:00', kw: 450 },
    { time: '11:00', kw: 420 },
    { time: '12:00', kw: 280 },
    { time: '13:00', kw: 480 },
    { time: '14:00', kw: 520 },
  ];

  const mockAlerts = [
    { id: 1, time: '14:02:41', machine: 'M-16', type: 'WARNING', msg: 'Vibration deviation detected on main axis.' },
    { id: 2, time: '13:45:22', machine: 'M-03', type: 'INFO', msg: 'Scheduled maintenance reminder.' },
    { id: 3, time: '12:50:04', machine: 'M-09', type: 'CRITICAL', msg: 'Spindle overload. Emergency stop triggered.' },
    { id: 4, time: '11:30:10', machine: 'M-01', type: 'INTERVENTION', msg: 'Auto RPM reduction applied successfully.' },
    { id: 5, time: '10:15:00', machine: 'M-12', type: 'WARNING', msg: 'Temperature rising above baseline.' },
  ];

  // Dummy fleet status for the mini grid (16 machines)
  const fleetGrid = Array(16).fill('NORMAL');
  fleetGrid[8] = 'CRITICAL';
  fleetGrid[15] = 'WARNING';
  fleetGrid[2] = 'INFO';
  fleetGrid[0] = 'INTERVENTION';

  const getStatusBg = (status: string) => {
    if (status === 'NORMAL') return 'bg-status-success';
    if (status === 'WARNING') return 'bg-status-warning';
    if (status === 'CRITICAL') return 'bg-status-critical';
    if (status === 'INTERVENTION') return 'bg-neo-blue';
    return 'bg-neo-silver';
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Dashboard</h2>
          <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">SYSTEM OVERVIEW & KPI</p>
        </div>
        <div className="text-right font-mono font-bold text-xs bg-neo-card border-2 border-neo-black p-2 shadow-neo-sm flex flex-col items-end">
          <div className="text-neo-muted">LAST UPDATE</div>
          <div className="text-status-success text-lg flex items-center">
            <span className="w-2 h-2 rounded-full bg-status-success mr-2 animate-pulse"></span>
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
      
      {/* Top Row: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
        {[
          { label: 'TOTAL MACHINES', value: 16, status: 'info', color: 'neo-silver', icon: <Activity size={24} /> },
          { label: 'NORMAL', value: 12, status: 'success', color: 'neo-white', icon: <CheckCircle size={24} className="text-status-success" /> },
          { label: 'WARNING / INTERV', value: 3, status: 'warning', color: 'status-warning', icon: <AlertTriangle size={24} /> },
          { label: 'CRITICAL', value: 1, status: 'critical', color: 'status-critical text-white', icon: <AlertTriangle size={24} /> }
        ].map(kpi => (
          <div key={kpi.label} className={`neo-card p-4 bg-${kpi.color} flex flex-col justify-between`}>
            <div className="flex justify-between items-start">
              <div className="text-neo-black font-mono font-black text-xs mb-2 bg-white inline-block px-1 border-2 border-black shadow-neo-sm">{kpi.label}</div>
              {kpi.icon}
            </div>
            <div className="text-5xl font-black text-neo-black mt-4">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Middle Row: OEE & Energy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* OEE Overview */}
        <div className="lg:col-span-2 neo-card p-6 bg-white">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black uppercase text-white bg-neo-black inline-block px-2 border-2 border-black shadow-neo-sm">Plant OEE</h3>
            <div className="font-mono font-bold text-3xl">78.4%</div>
          </div>
          
          <div className="space-y-6">
            <ProgressBar label="AVAILABILITY" percentage={85.2} color="bg-neo-blue" />
            <ProgressBar label="PERFORMANCE" percentage={92.1} color="bg-status-success" />
            <ProgressBar label="QUALITY" percentage={99.8} color="bg-status-info" />
          </div>
        </div>

        {/* Energy Consumption */}
        <div className="neo-card p-6 bg-neo-silver">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black uppercase text-white bg-neo-blue inline-block px-2 border-2 border-black shadow-neo-sm">Power Load</h3>
            <Zap className="text-neo-black" />
          </div>
          <div className="h-48 border-4 border-neo-black bg-white p-2 shadow-neo">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={energyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000" opacity={0.1} />
                <XAxis dataKey="time" tick={{fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold'}} stroke="#000" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} 
                  itemStyle={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000' }}
                  cursor={{fill: 'rgba(0,0,0,0.1)'}}
                />
                <Bar dataKey="kw" fill="#2563EB" stroke="#000" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: Alerts & Mini Fleet */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Alerts Feed */}
        <div className="lg:col-span-2 neo-card p-0 flex flex-col h-80">
          <div className="p-4 border-b-[3px] border-neo-black bg-white flex justify-between items-center">
            <h3 className="text-sm font-black uppercase text-white bg-status-critical inline-block px-2 border-2 border-black shadow-neo-sm">System Alerts Log</h3>
            <span className="neo-badge text-xs bg-neo-silver">LIVE</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neo-bg">
            {mockAlerts.map(alert => (
              <div key={alert.id} className="flex border-2 border-neo-black bg-white shadow-neo-sm">
                <div className={`w-2 ${getStatusBg(alert.type)} border-r-2 border-neo-black`}></div>
                <div className="p-2 flex-1 flex flex-col sm:flex-row sm:items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-xs font-bold text-neo-muted">{alert.time}</span>
                    <span className="font-mono text-xs font-black bg-neo-silver px-1 border border-black">{alert.machine}</span>
                    <span className="font-bold text-sm">{alert.msg}</span>
                  </div>
                  <button className="text-xs font-mono font-bold border-2 border-black px-2 py-1 hover:bg-neo-blue hover:text-white mt-2 sm:mt-0 transition-colors">
                    ACKNOWLEDGE
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mini Fleet Overview */}
        <div className="neo-card p-6 bg-white flex flex-col">
          <h3 className="text-lg font-black uppercase mb-6 text-white bg-neo-black inline-block px-2 border-2 border-black self-start shadow-neo-sm">Fleet Grid</h3>
          <div className="grid grid-cols-4 gap-2 flex-1">
            {fleetGrid.map((status, idx) => (
              <div 
                key={idx} 
                title={`M-${(idx + 1).toString().padStart(2, '0')} - ${status}`}
                className={`border-2 border-neo-black shadow-neo-sm ${getStatusBg(status)} hover:scale-105 transition-transform cursor-pointer flex items-center justify-center`}
              >
                <span className="font-mono font-bold text-[10px] bg-white bg-opacity-70 px-1 border border-black">
                  M{(idx + 1).toString().padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t-2 border-neo-black flex justify-between text-[10px] font-mono font-bold">
            <span className="flex items-center"><span className="w-2 h-2 bg-status-success border border-black mr-1"></span> RUN</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-status-warning border border-black mr-1"></span> WARN</span>
            <span className="flex items-center"><span className="w-2 h-2 bg-status-critical border border-black mr-1"></span> CRIT</span>
          </div>
        </div>

      </div>

    </div>
  );
};

// Progress Bar Helper
const ProgressBar = ({ label, percentage, color }: { label: string, percentage: number, color: string }) => (
  <div>
    <div className="flex justify-between text-xs font-mono font-bold text-neo-black mb-1">
      <span>{label}</span>
      <span>{percentage}%</span>
    </div>
    <div className="h-6 w-full bg-neo-bg border-[3px] border-neo-black p-0.5">
      <div className={`h-full ${color} border-r-2 border-neo-black`} style={{ width: `${percentage}%` }}></div>
    </div>
  </div>
);

export const PlaceholderPage = ({ title }: { title: string }) => (
  <div>
    <h2 className="text-3xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black mb-6 shadow-neo">{title}</h2>
    <div className="neo-card p-12 text-center text-neo-black font-mono font-bold text-xl bg-neo-silver">
      🚧 {title} MODULE - UNDER CONSTRUCTION 🚧
    </div>
  </div>
);
