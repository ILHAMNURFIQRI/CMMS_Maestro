import type { Machine, Telemetry } from '../types/machine';

const KEYS = {
  MACHINES: 'mandor_machines',
  TELEMETRY: 'mandor_telemetry',
  ALERTS: 'mandor_alerts',
  RCA: 'mandor_rca',
  INTERVENTIONS: 'mandor_interventions',
  PRODUCTION: 'mandor_production',
  ENERGY: 'mandor_energy',
};

// Initial Machine Seed
export const INITIAL_MACHINES: Machine[] = [
  { id: 'M-01', name: 'CNC LATHE', type: 'Machining', line: 'Line A', area: 'Zone 1', status: 'NORMAL', health_score: 95, data_source: 'SIMULATION' },
  { id: 'M-02', name: 'CNC MILL', type: 'Machining', line: 'Line A', area: 'Zone 1', status: 'NORMAL', health_score: 92, data_source: 'SIMULATION' },
  { id: 'M-03', name: 'PRESS', type: 'Forming', line: 'Line A', area: 'Zone 2', status: 'NORMAL', health_score: 88, data_source: 'SIMULATION' },
  { id: 'M-04', name: 'GRINDER', type: 'Finishing', line: 'Line B', area: 'Zone 2', status: 'NORMAL', health_score: 90, data_source: 'SIMULATION' },
  { id: 'M-05', name: 'ASSEMBLY UNIT', type: 'Assembly', line: 'Line B', area: 'Zone 3', status: 'NORMAL', health_score: 98, data_source: 'SIMULATION' },
  { id: 'M-06', name: 'DRILLING UNIT', type: 'Machining', line: 'Line B', area: 'Zone 1', status: 'NORMAL', health_score: 85, data_source: 'SIMULATION' },
  { id: 'M-07', name: 'MILLING UNIT', type: 'Machining', line: 'Line C', area: 'Zone 1', status: 'NORMAL', health_score: 94, data_source: 'SIMULATION' },
  { id: 'M-08', name: 'ROBOTIC CELL', type: 'Assembly', line: 'Line C', area: 'Zone 3', status: 'NORMAL', health_score: 97, data_source: 'SIMULATION' },
  { id: 'M-09', name: 'CUTTING UNIT', type: 'Machining', line: 'Line C', area: 'Zone 2', status: 'NORMAL', health_score: 89, data_source: 'SIMULATION' },
  { id: 'M-10', name: 'POLISHING UNIT', type: 'Finishing', line: 'Line D', area: 'Zone 2', status: 'NORMAL', health_score: 91, data_source: 'SIMULATION' },
  { id: 'M-11', name: 'PACKAGING UNIT', type: 'Packaging', line: 'Line D', area: 'Zone 4', status: 'NORMAL', health_score: 96, data_source: 'SIMULATION' },
  { id: 'M-12', name: 'ASSEMBLY LINE', type: 'Assembly', line: 'Line D', area: 'Zone 3', status: 'NORMAL', health_score: 93, data_source: 'SIMULATION' },
  { id: 'M-13', name: 'MACHINING UNIT', type: 'Machining', line: 'Line E', area: 'Zone 1', status: 'NORMAL', health_score: 87, data_source: 'SIMULATION' },
  { id: 'M-14', name: 'INSPECTION UNIT', type: 'Inspection', line: 'Line E', area: 'Zone 4', status: 'NORMAL', health_score: 99, data_source: 'SIMULATION' },
  { id: 'M-15', name: 'PROCESS UNIT', type: 'Processing', line: 'Line E', area: 'Zone 2', status: 'NORMAL', health_score: 92, data_source: 'SIMULATION' },
  { id: 'M-16', name: 'CONVEYOR-01', type: 'Transport', line: 'Main', area: 'Logistics', status: 'NORMAL', health_score: 95, data_source: 'MQTT', mqtt_status: 'CONNECTED' },
];

export const LocalStore = {
  get<T>(key: string, defaultValue: T): T {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  },
  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  },
  initialize() {
    if (!localStorage.getItem(KEYS.MACHINES)) {
      this.set(KEYS.MACHINES, INITIAL_MACHINES);
    }
    // Initialize empty records if not present
    ['TELEMETRY', 'ALERTS', 'RCA', 'INTERVENTIONS', 'PRODUCTION', 'ENERGY'].forEach(k => {
      if (!localStorage.getItem(KEYS[k as keyof typeof KEYS])) {
        this.set(KEYS[k as keyof typeof KEYS], k === 'TELEMETRY' ? {} : []);
      }
    });
  },
  getMachines(): Machine[] {
    return this.get(KEYS.MACHINES, INITIAL_MACHINES);
  },
  updateMachine(machine: Machine) {
    const machines = this.getMachines();
    const idx = machines.findIndex(m => m.id === machine.id);
    if (idx !== -1) {
      machines[idx] = machine;
      this.set(KEYS.MACHINES, machines);
    }
  },
  getTelemetry(machineId: string): Telemetry[] {
    const all = this.get<Record<string, Telemetry[]>>(KEYS.TELEMETRY, {});
    return all[machineId] || [];
  },
  addTelemetry(telemetry: Telemetry) {
    const all = this.get<Record<string, Telemetry[]>>(KEYS.TELEMETRY, {});
    if (!all[telemetry.machine_id]) all[telemetry.machine_id] = [];
    all[telemetry.machine_id].push(telemetry);
    // Keep only last 100 points per machine to avoid breaking localStorage limit
    if (all[telemetry.machine_id].length > 100) {
      all[telemetry.machine_id].shift();
    }
    this.set(KEYS.TELEMETRY, all);
  }
};
