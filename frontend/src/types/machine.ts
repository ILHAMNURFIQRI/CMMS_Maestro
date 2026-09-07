export type MachineStatus =
  | "NORMAL"
  | "MONITORING"
  | "WARNING"
  | "INTERVENTION"
  | "CRITICAL";
export type DataSource = "SIMULATION" | "MQTT";

export interface Machine {
  id: string;
  name: string;
  type: string;
  line: string;
  area: string;
  status: MachineStatus;
  health_score: number;
  data_source: DataSource;
  mqtt_status?: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
}

export interface Telemetry {
  machine_id: string;
  timestamp: string;
  temperature: number;
  vibration: number;
  current: number;
  rpm: number;
  power: number;
  target_rpm?: number;
  actual_rpm?: number;
  status?: MachineStatus;
  status_reason?: string;
}

export interface ProductionMetrics {
  machine_id: string;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  cycle_time: number;
  production_output: number;
  defect_count: number;
  downtime: number;
}

export interface EnergyMetrics {
  machine_id: string;
  energy_consumption: number;
  energy_saved: number;
}

export interface RootCauseAnalysis {
  machine_id: string;
  timestamp: string;
  probable_cause: string;
  confidence: number;
  evidence: string[];
  recommended_action: string;
}

export interface Alert {
  id: string;
  machine_id: string;
  timestamp: string;
  type: "INFO" | "WARNING" | "INTERVENTION" | "CRITICAL";
  severity: number;
  message: string;
  root_cause?: string;
  confidence?: number;
  acknowledged: boolean;
}

export interface InterventionEvent {
  id: string;
  machine_id: string;
  timestamp: string;
  action: string;
  target_value: number;
  actual_value?: number;
  verified: boolean;
  status: "PENDING" | "SUCCESS" | "FAILED";
}
