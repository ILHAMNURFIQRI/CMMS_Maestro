import type { Machine, Telemetry, Alert, RootCauseAnalysis, InterventionEvent, ProductionMetrics, EnergyMetrics } from '../types/machine';

export interface MachineDataProvider {
  getMachines(): Promise<Machine[]>;
  getMachine(id: string): Promise<Machine>;
  getTelemetry(id: string): Promise<Telemetry[]>;
  getAlerts(): Promise<Alert[]>;
  getRCA(id: string): Promise<RootCauseAnalysis | null>;
  getProductionMetrics(id: string): Promise<ProductionMetrics | null>;
  getEnergyMetrics(id: string): Promise<EnergyMetrics | null>;
  triggerIntervention(id: string, targetRpm: number, reason: string): Promise<InterventionEvent>;
  getInterventionHistory(id: string): Promise<InterventionEvent[]>;
}
