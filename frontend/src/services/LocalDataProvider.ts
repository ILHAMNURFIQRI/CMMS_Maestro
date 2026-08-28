import type { MachineDataProvider } from './MachineDataProvider';
import type { Machine, Telemetry, Alert, RootCauseAnalysis, InterventionEvent, ProductionMetrics, EnergyMetrics } from '../types/machine';
import { LocalStore } from './LocalStore';

export class LocalDataProvider implements MachineDataProvider {
  constructor() {
    LocalStore.initialize();
  }

  async getMachines(): Promise<Machine[]> {
    return LocalStore.getMachines();
  }

  async getMachine(id: string): Promise<Machine> {
    const machines = LocalStore.getMachines();
    const machine = machines.find(m => m.id === id);
    if (!machine) throw new Error(`Machine ${id} not found`);
    return machine;
  }

  async getTelemetry(id: string): Promise<Telemetry[]> {
    return LocalStore.getTelemetry(id);
  }

  async getAlerts(): Promise<Alert[]> {
    return LocalStore.get<Alert[]>('mandor_alerts', []);
  }

  async getRCA(id: string): Promise<RootCauseAnalysis | null> {
    const rcas = LocalStore.get<RootCauseAnalysis[]>('mandor_rca', []);
    return rcas.find(r => r.machine_id === id) || null;
  }

  async getProductionMetrics(id: string): Promise<ProductionMetrics | null> {
    const metrics = LocalStore.get<ProductionMetrics[]>('mandor_production', []);
    return metrics.find(m => m.machine_id === id) || null;
  }

  async getEnergyMetrics(id: string): Promise<EnergyMetrics | null> {
    const metrics = LocalStore.get<EnergyMetrics[]>('mandor_energy', []);
    return metrics.find(m => m.machine_id === id) || null;
  }

  async triggerIntervention(id: string, targetRpm: number, reason: string): Promise<InterventionEvent> {
    const event: InterventionEvent = {
      id: `INT-${Date.now()}`,
      machine_id: id,
      timestamp: new Date().toISOString(),
      action: reason,
      target_value: targetRpm,
      verified: false,
      status: 'PENDING'
    };
    const interventions = LocalStore.get<InterventionEvent[]>('mandor_interventions', []);
    interventions.push(event);
    LocalStore.set('mandor_interventions', interventions);
    
    // Simulate MQTT command sent and actual RPM adjustment
    // (In reality, this is handled by MockMQTTService or Backend)
    setTimeout(() => {
      const ints = LocalStore.get<InterventionEvent[]>('mandor_interventions', []);
      const idx = ints.findIndex(i => i.id === event.id);
      if (idx !== -1) {
        ints[idx].verified = true;
        ints[idx].status = 'SUCCESS';
        ints[idx].actual_value = targetRpm + (Math.random() * 4 - 2); // +/- 2 RPM error
        LocalStore.set('mandor_interventions', ints);
      }
    }, 2000);

    return event;
  }

  async getInterventionHistory(id: string): Promise<InterventionEvent[]> {
    const interventions = LocalStore.get<InterventionEvent[]>('mandor_interventions', []);
    return interventions.filter(i => i.machine_id === id);
  }
}

export const localDataProvider = new LocalDataProvider();
