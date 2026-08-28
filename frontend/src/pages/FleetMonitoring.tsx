import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MachineCard } from '../components/MachineCard';
import { localDataProvider } from '../services/LocalDataProvider';
import type { Machine, Telemetry } from '../types/machine';

export const FleetMonitoring = () => {
  const { mode } = useOutletContext<{ mode: string }>();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});

  const loadData = async () => {
    const provider = localDataProvider; // Connect mode later
    const machs = await provider.getMachines();
    setMachines(machs);

    const latestTelemetry: Record<string, Telemetry> = {};
    for (const m of machs) {
      const tel = await provider.getMachineTelemetry(m.id, 1);
      if (tel.length > 0) {
        latestTelemetry[m.id] = tel[0];
      }
    }
    setTelemetry(latestTelemetry);
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('mandor-data-update', handleUpdate);
    return () => window.removeEventListener('mandor-data-update', handleUpdate);
  }, [mode]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">Fleet Monitoring</h2>
        <p className="text-neo-black font-mono font-bold mt-2 bg-neo-silver inline-block px-1 border-2 border-black">LIVE FACTORY FLOOR STATUS</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {machines.map(m => (
          <MachineCard key={m.id} machine={m} telemetry={telemetry[m.id]} />
        ))}
      </div>
    </div>
  );
};
