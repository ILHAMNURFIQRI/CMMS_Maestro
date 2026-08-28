import { useState, useEffect } from 'react';
import { localDataProvider } from '../services/LocalDataProvider';
import type { Machine, Telemetry } from '../types/machine';
import { Map, Zap, Thermometer, Wind, RefreshCw } from 'lucide-react';

export const DigitalTwin = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('M-16');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const machs = await localDataProvider.getMachines();
      setMachines(machs);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (!selectedMachineId) return;
      const tel = await localDataProvider.getTelemetry(selectedMachineId);
      if (tel.length > 0) setTelemetry(tel[tel.length - 1]);
    };
    loadData();
    const interval = setInterval(loadData, 2000); // Live update
    return () => clearInterval(interval);
  }, [selectedMachineId]);

  const selectedMachine = machines.find(m => m.id === selectedMachineId);

  return (
    <div className="space-y-6">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Digital Twin</h2>
          <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">2D INTERACTIVE SCHEMATIC</p>
        </div>
        <div className="neo-card bg-white p-2 flex items-center space-x-2">
          <span className="font-mono font-bold text-xs">SELECT MACHINE:</span>
          <select 
            className="font-mono font-black border-2 border-neo-black p-1 bg-neo-silver outline-none cursor-pointer"
            value={selectedMachineId}
            onChange={(e) => setSelectedMachineId(e.target.value)}
          >
            {machines.map(m => (
              <option key={m.id} value={m.id}>{m.id} - {m.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Machine Schematic (2D) */}
        <div className="lg:col-span-3 neo-card p-6 bg-neo-bg relative overflow-hidden flex flex-col h-[600px]">
          <h3 className="text-lg font-black uppercase mb-6 text-white bg-neo-black inline-block px-2 border-2 border-black self-start">Structural Overview</h3>
          
          <div className="flex-1 relative border-4 border-neo-black bg-white p-4 shadow-neo-sm overflow-hidden flex items-center justify-center">
            
            {/* 2D Machine Representation */}
            <div className="relative w-full max-w-2xl h-96 border-[4px] border-neo-black bg-neo-silver p-8 flex flex-col justify-between">
              
              <div className="absolute top-0 left-0 bg-neo-black text-white px-2 py-1 font-mono font-black text-sm border-r-4 border-b-4 border-neo-black">
                {selectedMachine?.type || 'ASSEMBLY_UNIT'}
              </div>

              {/* Component: Main Spindle/Motor */}
              <div className="flex justify-between items-stretch h-32 space-x-8">
                <div className={`flex-1 border-4 border-neo-black flex items-center justify-center relative transition-colors ${telemetry && telemetry.rpm > 550 ? 'bg-status-warning' : 'bg-white'}`}>
                  <div className="absolute -top-3 -right-3 bg-neo-blue text-white p-2 border-2 border-neo-black shadow-neo-sm z-10 animate-pulse">
                    <RefreshCw size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-black uppercase tracking-widest text-lg">Main Spindle</div>
                    <div className="font-mono font-black text-2xl mt-2 bg-neo-black text-white px-2">{telemetry ? telemetry.rpm.toFixed(0) : '0'} RPM</div>
                  </div>
                </div>

                <div className={`w-1/3 border-4 border-neo-black flex items-center justify-center relative transition-colors ${telemetry && telemetry.temperature > 80 ? 'bg-status-critical text-white' : 'bg-neo-bg'}`}>
                  <div className="absolute -top-3 -right-3 bg-neo-black text-white p-2 border-2 border-neo-black shadow-neo-sm z-10">
                    <Thermometer size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-black uppercase tracking-widest text-sm">Thermal Core</div>
                    <div className="font-mono font-black text-xl mt-2">{telemetry ? telemetry.temperature.toFixed(1) : '0.0'} °C</div>
                  </div>
                </div>
              </div>

              {/* Connecting Pipe / Belt */}
              <div className="h-8 border-l-4 border-r-4 border-neo-black bg-neo-black bg-opacity-10 mx-auto w-3/4 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGwyMCAyMHoiIHN0cm9rZT0iIzBGMTcyQSIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+')] opacity-20 animate-[slide_1s_linear_infinite]"></div>
              </div>

              {/* Component: Power Unit & Chassis */}
              <div className="flex justify-between items-stretch h-32 space-x-8">
                <div className="w-1/3 border-4 border-neo-black bg-neo-blue text-white flex items-center justify-center relative">
                  <div className="absolute -top-3 -right-3 bg-white text-neo-black p-2 border-2 border-neo-black shadow-neo-sm z-10">
                    <Zap size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-black uppercase tracking-widest text-sm">Power Unit</div>
                    <div className="font-mono font-black text-xl mt-2">{telemetry ? telemetry.current.toFixed(1) : '0.0'} A</div>
                  </div>
                </div>

                <div className={`flex-1 border-4 border-neo-black flex items-center justify-center relative transition-colors ${telemetry && telemetry.vibration > 3.0 ? 'bg-status-warning' : 'bg-white'}`}>
                  <div className="absolute -top-3 -right-3 bg-neo-black text-white p-2 border-2 border-neo-black shadow-neo-sm z-10">
                    <Wind size={20} />
                  </div>
                  <div className="text-center">
                    <div className="font-black uppercase tracking-widest text-lg">Chassis Vib</div>
                    <div className="font-mono font-black text-2xl mt-2 bg-neo-black text-white px-2">{telemetry ? telemetry.vibration.toFixed(2) : '0.00'} mm/s</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Sidebar: Context */}
        <div className="space-y-6 flex flex-col">
          <div className="neo-card p-6 bg-white flex-1 border-b-[6px] border-neo-black">
             <h3 className="text-lg font-black uppercase mb-4 text-white bg-neo-black inline-block px-2 border-2 border-black">Diagnostics</h3>
             {selectedMachine && (
               <div className="space-y-4">
                 <div>
                   <div className="text-xs font-mono font-bold text-neo-muted">STATUS</div>
                   <div className={`font-black text-2xl uppercase ${
                     selectedMachine.status === 'NORMAL' ? 'text-status-success' : 
                     selectedMachine.status === 'CRITICAL' ? 'text-status-critical' : 'text-status-warning'
                   }`}>
                     {selectedMachine.status}
                   </div>
                 </div>
                 <div>
                   <div className="text-xs font-mono font-bold text-neo-muted">HEALTH SCORE</div>
                   <div className="font-black font-mono text-4xl">{selectedMachine.health_score}%</div>
                 </div>
                 <div className="pt-4 border-t-4 border-neo-black border-dotted">
                   <div className="text-xs font-mono font-bold text-neo-muted mb-2">LIVE METRICS STREAM</div>
                   <div className="font-mono text-xs bg-neo-bg p-3 border-2 border-neo-black overflow-hidden h-32 flex flex-col justify-end">
                     {telemetry && (
                       <>
                         <div className="text-neo-blue opacity-50">&gt; recv sys.stat</div>
                         <div className="text-neo-black opacity-75">T:{telemetry.temperature.toFixed(2)} V:{telemetry.vibration.toFixed(3)}</div>
                         <div className="text-neo-blue opacity-50">&gt; recv sys.pwr</div>
                         <div className="text-neo-black font-bold">I:{telemetry.current.toFixed(2)} R:{telemetry.rpm.toFixed(1)}</div>
                       </>
                     )}
                   </div>
                 </div>
               </div>
             )}
          </div>
        </div>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slide {
          from { background-position: 0 0; }
          to { background-position: 20px 20px; }
        }
      `}} />
    </div>
  );
};
