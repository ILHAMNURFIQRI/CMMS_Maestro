import { useState, useEffect } from 'react';
import { localDataProvider } from '../services/LocalDataProvider';
import type { Alert } from '../types/machine';
import { FileWarning, CheckCircle } from 'lucide-react';

export const Alerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    // Generate dummy alerts if the datastore is empty
    const fetchAlerts = async () => {
      const dbAlerts = await localDataProvider.getAlerts();
      if (dbAlerts.length === 0) {
        setAlerts([
          { id: 'ALR-1', machine_id: 'M-16', timestamp: new Date(Date.now() - 1000*60*5).toISOString(), severity: 'WARNING', message: 'Vibration deviation detected on main axis.', resolved: false },
          { id: 'ALR-2', machine_id: 'M-09', timestamp: new Date(Date.now() - 1000*60*45).toISOString(), severity: 'CRITICAL', message: 'Spindle overload. Emergency stop triggered.', resolved: false },
          { id: 'ALR-3', machine_id: 'M-03', timestamp: new Date(Date.now() - 1000*60*60*2).toISOString(), severity: 'INFO', message: 'Scheduled maintenance reminder.', resolved: true },
          { id: 'ALR-4', machine_id: 'M-12', timestamp: new Date(Date.now() - 1000*60*60*4).toISOString(), severity: 'WARNING', message: 'Temperature rising above baseline.', resolved: false },
        ]);
      } else {
        setAlerts(dbAlerts);
      }
    };
    fetchAlerts();
  }, []);

  const acknowledgeAlert = (id: string) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, resolved: true } : a));
  };

  const getSeverityStyles = (severity: string, resolved: boolean) => {
    if (resolved) return 'bg-neo-silver text-neo-muted border-neo-muted';
    if (severity === 'CRITICAL') return 'bg-status-critical text-white border-neo-black';
    if (severity === 'WARNING') return 'bg-status-warning text-neo-black border-neo-black';
    return 'bg-neo-blue text-white border-neo-black';
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Alerts</h2>
          <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">CENTRAL ALARM LOG</p>
        </div>
        <div className="neo-card bg-white p-2 flex items-center space-x-4">
          <div className="flex items-center text-xs font-mono font-bold"><span className="w-3 h-3 bg-status-critical border border-black mr-2"></span> {alerts.filter(a => a.severity === 'CRITICAL' && !a.resolved).length} CRIT</div>
          <div className="flex items-center text-xs font-mono font-bold"><span className="w-3 h-3 bg-status-warning border border-black mr-2"></span> {alerts.filter(a => a.severity === 'WARNING' && !a.resolved).length} WARN</div>
        </div>
      </div>

      <div className="neo-card p-0 bg-white">
        <div className="p-4 border-b-[3px] border-neo-black bg-neo-black text-white flex items-center">
          <FileWarning className="mr-2" />
          <h3 className="text-lg font-black uppercase">Active & Recent Alerts</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-neo-silver text-neo-black">
              <tr>
                <th className="p-4 border-b-2 border-r-2 border-neo-black">ID</th>
                <th className="p-4 border-b-2 border-r-2 border-neo-black">TIME</th>
                <th className="p-4 border-b-2 border-r-2 border-neo-black">MACHINE</th>
                <th className="p-4 border-b-2 border-r-2 border-neo-black">SEVERITY</th>
                <th className="p-4 border-b-2 border-r-2 border-neo-black">MESSAGE</th>
                <th className="p-4 border-b-2 border-neo-black text-center">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, i) => (
                <tr key={alert.id} className={i % 2 === 0 ? 'bg-neo-bg' : 'bg-white'}>
                  <td className="p-4 border-b-2 border-r-2 border-neo-black font-bold text-neo-muted">{alert.id}</td>
                  <td className="p-4 border-b-2 border-r-2 border-neo-black font-bold">{new Date(alert.timestamp).toLocaleTimeString()}</td>
                  <td className="p-4 border-b-2 border-r-2 border-neo-black">
                    <span className="bg-white border-2 border-neo-black px-2 py-1 font-black">{alert.machine_id}</span>
                  </td>
                  <td className="p-4 border-b-2 border-r-2 border-neo-black">
                    <span className={`px-2 py-1 border-[2px] font-black ${getSeverityStyles(alert.severity, alert.resolved)}`}>
                      {alert.resolved ? 'RESOLVED' : alert.severity}
                    </span>
                  </td>
                  <td className={`p-4 border-b-2 border-r-2 border-neo-black font-bold ${alert.resolved ? 'text-neo-muted line-through' : ''}`}>
                    {alert.message}
                  </td>
                  <td className="p-4 border-b-2 border-neo-black text-center">
                    {!alert.resolved ? (
                      <button 
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="neo-btn !bg-neo-blue !text-white !py-1 !px-2 !text-xs hover:scale-[1.05]"
                      >
                        ACKNOWLEDGE
                      </button>
                    ) : (
                      <CheckCircle className="mx-auto text-status-success" />
                    )}
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center font-bold text-neo-muted bg-neo-bg">No alerts found. System is stable.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
