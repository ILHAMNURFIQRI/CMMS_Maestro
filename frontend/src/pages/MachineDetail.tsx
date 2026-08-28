import { useEffect, useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { localDataProvider } from '../services/LocalDataProvider';
import { simulationEngine } from '../services/SimulationEngine';
import type { ScenarioType } from '../services/SimulationEngine';
import type { Machine, Telemetry, RootCauseAnalysis, InterventionEvent } from '../types/machine';

export const MachineDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { mode } = useOutletContext<{ mode: string }>();
  
  const [machine, setMachine] = useState<Machine | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<Telemetry[]>([]);
  const [rca, setRca] = useState<RootCauseAnalysis | null>(null);
  const [interventions, setInterventions] = useState<InterventionEvent[]>([]);
  const [targetRpm, setTargetRpm] = useState<number>(500);

  const loadData = async () => {
    if (!id) return;
    try {
      const m = await localDataProvider.getMachine(id);
      setMachine(m);
      
      const tel = await localDataProvider.getTelemetry(id);
      setTelemetryHistory(tel);
      
      const r = await localDataProvider.getRCA(id);
      setRca(r);

      const ints = await localDataProvider.getInterventionHistory(id);
      setInterventions(ints);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('mandor-data-update', handleUpdate);
    return () => window.removeEventListener('mandor-data-update', handleUpdate);
  }, [id, mode]);

  const handleIntervention = async () => {
    if (!id) return;
    if (window.confirm(`Issue command to change RPM to ${targetRpm}?`)) {
      await localDataProvider.triggerIntervention(id, targetRpm, 'MANUAL_OVERRIDE');
      loadData();
    }
  };

  const triggerScenario = (scenario: ScenarioType) => {
    if (!id) return;
    simulationEngine.setScenario(id, scenario);
  };

  if (!machine) return <div className="text-neo-muted p-8 font-mono font-bold text-xl">Loading...</div>;

  const currentTel = telemetryHistory[telemetryHistory.length - 1];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-4 mb-2">
            <h2 className="text-4xl font-bold font-mono tracking-tighter text-white bg-neo-blue px-2 border-[3px] border-neo-black shadow-neo">{machine.id}</h2>
            <div className={`neo-badge text-lg neo-badge-${
              machine.status === 'NORMAL' ? 'success' : 
              machine.status === 'MONITORING' ? 'info' : 
              machine.status === 'CRITICAL' ? 'critical' : 'warning'
            }`}>
              {machine.status}
            </div>
          </div>
          <div className="text-neo-black font-mono font-bold text-lg bg-white inline-block px-1 border-2 border-black mt-1">
            {machine.name} | {machine.line} | {machine.area}
          </div>
        </div>
        <div className="text-right border-[3px] border-neo-black bg-neo-card p-2 shadow-neo">
          <div className="text-neo-muted font-mono font-bold text-xs">DATA SOURCE</div>
          <div className={`font-black font-mono text-xl ${machine.data_source === 'MQTT' ? 'text-status-info' : 'text-neo-black'}`}>
            {machine.data_source}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: AI & RCA */}
        <div className="space-y-6">
          <div className="neo-card p-6 bg-neo-silver border-[3px] border-neo-black">
            <h3 className="text-lg font-black uppercase mb-4 text-white bg-neo-blue inline-block px-1 border-2 border-black">AI Assessment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border-2 border-black p-2">
                <div className="text-[10px] text-neo-muted font-mono font-bold mb-1">HEALTH SCORE</div>
                <div className={`text-5xl font-black ${machine.health_score < 60 ? 'text-status-warning' : machine.health_score < 40 ? 'text-status-critical' : 'text-status-success'}`}>
                  {machine.health_score}
                </div>
              </div>
              <div className="bg-white border-2 border-black p-2">
                <div className="text-[10px] text-neo-muted font-mono font-bold mb-1">ANOMALY CONFIDENCE</div>
                <div className="text-4xl font-black text-neo-black">{machine.status !== 'NORMAL' ? '87%' : '12%'}</div>
              </div>
            </div>
          </div>

          {rca && (
            <div className="neo-card p-6 bg-white border-[3px] border-status-warning">
              <h3 className="text-lg font-black uppercase mb-4 text-neo-black bg-status-warning inline-block px-1 border-2 border-black">Root Cause Analysis</h3>
              <div className="mb-4 bg-white border-2 border-black p-2">
                <div className="text-[10px] text-neo-muted font-mono font-bold mb-1">PROBABLE CAUSE</div>
                <div className="text-xl font-black text-neo-black">{rca.probable_cause}</div>
                <div className="text-status-critical font-mono font-bold mt-1 bg-neo-bg px-1 inline-block border border-black">{rca.confidence}% Confidence</div>
              </div>
              <div className="mb-4 bg-white border-2 border-black p-2">
                <div className="text-[10px] text-neo-muted font-mono font-bold mb-1">EVIDENCE</div>
                <ul className="list-disc pl-5 text-sm font-mono font-bold text-neo-black space-y-1">
                  {rca.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
                </ul>
              </div>
              <div className="bg-neo-black border-2 border-black p-2">
                <div className="text-[10px] text-white font-mono font-bold mb-1">RECOMMENDED ACTION</div>
                <div className="text-sm font-mono font-bold text-neo-silver">
                  {rca.recommended_action}
                </div>
              </div>
            </div>
          )}

          {/* Control Panel (Only for M-16 or if demoing) */}
          <div className="neo-card p-6 bg-neo-silver border-[3px] border-neo-black">
            <h3 className="text-lg font-black uppercase mb-4 text-white bg-neo-blue inline-block px-1 border-2 border-black">Motor Control</h3>
            <div className="space-y-4 bg-white border-2 border-black p-4">
              <div>
                <div className="flex justify-between text-xs font-mono font-bold text-neo-black mb-2">
                  <span>TARGET RPM</span>
                  <span className="bg-neo-silver border-2 border-black px-1">{targetRpm}</span>
                </div>
                <input 
                  type="range" 
                  min="100" max="600" step="10" 
                  value={targetRpm}
                  onChange={(e) => setTargetRpm(Number(e.target.value))}
                  className="w-full accent-neo-blue"
                />
              </div>
              <button 
                onClick={handleIntervention}
                className="w-full neo-btn !bg-neo-blue !text-white !border-neo-black hover:scale-[1.02]"
              >
                SET RPM COMMAND
              </button>
            </div>
            
            {interventions.length > 0 && (
              <div className="mt-4 bg-white border-2 border-black p-3">
                <div className="text-xs font-mono font-bold text-neo-muted mb-2">LATEST INTERVENTION</div>
                <div className="text-sm font-mono font-bold p-2 bg-neo-bg border-2 border-black">
                  <div className="flex justify-between">
                    <span className="text-neo-black">TARGET: {interventions[interventions.length - 1].target_value}</span>
                    <span className={interventions[interventions.length - 1].status === 'SUCCESS' ? 'text-status-success' : 'text-status-warning'}>
                      {interventions[interventions.length - 1].status}
                    </span>
                  </div>
                  {interventions[interventions.length - 1].actual_value && (
                    <div className="mt-1 text-neo-black bg-neo-silver px-1 inline-block border-2 border-black mt-2">
                      VERIFIED RPM: {interventions[interventions.length - 1].actual_value?.toFixed(0)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Telemetry Snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="TEMPERATURE" value={currentTel?.temperature} unit="°C" color="bg-white" />
            <MetricCard label="VIBRATION" value={currentTel?.vibration} unit="" color="bg-neo-silver" />
            <MetricCard label="CURRENT" value={currentTel?.current} unit="A" color="bg-white" />
            <MetricCard label="RPM" value={currentTel?.rpm} unit="" color="bg-neo-silver" />
          </div>

          <div className="neo-card p-6 bg-white border-[3px] border-neo-black">
             <h3 className="text-lg font-black uppercase mb-4 text-white bg-neo-blue inline-block px-1 border-2 border-black">Telemetry Stream</h3>
             
             {/* Chart 1: Temp & Vib */}
             <div className="h-64 mb-8 border-4 border-black bg-neo-bg p-2 shadow-neo">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={telemetryHistory}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#000000" opacity={0.2} />
                   <XAxis dataKey="timestamp" hide />
                   <YAxis yAxisId="left" stroke="#000000" domain={['auto', 'auto']} tick={{fontFamily: 'monospace', fontWeight: 'bold'}} />
                   <YAxis yAxisId="right" orientation="right" stroke="#000000" domain={['auto', 'auto']} tick={{fontFamily: 'monospace', fontWeight: 'bold'}} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#ffffff', border: '3px solid #000000', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} 
                     itemStyle={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000000' }}
                   />
                   <ReferenceLine y={60} yAxisId="left" stroke="#EF4444" strokeDasharray="3 3" strokeWidth={3} />
                   <Line yAxisId="left" type="stepAfter" dataKey="temperature" stroke="#EF4444" strokeWidth={4} dot={false} isAnimationActive={false} />
                   <Line yAxisId="right" type="stepAfter" dataKey="vibration" stroke="#2563EB" strokeWidth={4} dot={false} isAnimationActive={false} />
                 </LineChart>
               </ResponsiveContainer>
             </div>

             {/* Chart 2: RPM & Current */}
             <div className="h-64 border-4 border-black bg-neo-bg p-2 shadow-neo">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={telemetryHistory}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#000000" opacity={0.2} />
                   <XAxis dataKey="timestamp" hide />
                   <YAxis yAxisId="left" stroke="#000000" domain={[0, 600]} tick={{fontFamily: 'monospace', fontWeight: 'bold'}} />
                   <YAxis yAxisId="right" orientation="right" stroke="#000000" domain={['auto', 'auto']} tick={{fontFamily: 'monospace', fontWeight: 'bold'}} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#ffffff', border: '3px solid #000000', borderRadius: 0, boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }} 
                     itemStyle={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#000000' }}
                   />
                   <Line yAxisId="left" type="stepAfter" dataKey="rpm" stroke="#10B981" strokeWidth={4} dot={false} isAnimationActive={false} />
                   <Line yAxisId="right" type="stepAfter" dataKey="current" stroke="#F59E0B" strokeWidth={4} dot={false} isAnimationActive={false} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
          </div>

          {/* Demo Controls */}
          {mode === 'STANDALONE' && (
            <div className="neo-card p-6 bg-white border-dashed border-[4px] border-neo-black">
              <h3 className="text-sm font-black uppercase mb-4 text-neo-black bg-neo-silver inline-block px-1 border-2 border-black">Simulation Demo Controls</h3>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => triggerScenario('NORMAL')} className="neo-btn text-xs bg-white hover:bg-neo-bg">RECOVER / NORMAL</button>
                <button onClick={() => triggerScenario('OVERLOAD')} className="neo-btn text-xs bg-status-warning">OVERLOAD</button>
                <button onClick={() => triggerScenario('OVERHEAT')} className="neo-btn text-xs bg-status-critical text-white">OVERHEAT</button>
                <button onClick={() => triggerScenario('VIBRATION')} className="neo-btn text-xs bg-neo-blue text-white">HIGH VIBRATION</button>
                <button onClick={() => triggerScenario('CRITICAL')} className="neo-btn text-xs bg-neo-black text-white">CRITICAL FAILURE</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, unit, color }: { label: string, value?: number, unit: string, color: string }) => (
  <div className={`neo-card p-4 ${color}`}>
    <div className="text-[10px] text-neo-black bg-white inline-block px-1 border-2 border-black font-mono font-bold mb-2 shadow-neo-sm">{label}</div>
    <div className="text-3xl font-black text-neo-black mt-2">
      {value !== undefined ? value.toFixed(1) : '--'}
      <span className="text-sm font-black ml-1">{unit}</span>
    </div>
  </div>
);
