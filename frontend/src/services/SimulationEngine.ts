import { LocalStore } from './LocalStore';
import type { Machine, Telemetry, Alert, RootCauseAnalysis } from '../types/machine';

export type ScenarioType = 'NORMAL' | 'OVERLOAD' | 'OVERHEAT' | 'VIBRATION' | 'RPM_DROP' | 'CRITICAL';

export class SimulationEngine {
  private activeScenarios: Record<string, ScenarioType> = {};
  private timer: number | null = null;
  private m16Timer: number | null = null;

  start() {
    if (this.timer) return;
    LocalStore.initialize();
    
    // Simulate 15 dummy machines every 5 seconds
    this.timer = window.setInterval(() => this.tick(), 5000);
    
    // Simulate M-16 (MQTT) every 2 seconds for faster response
    this.m16Timer = window.setInterval(() => this.tickM16(), 2000);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    if (this.m16Timer) window.clearInterval(this.m16Timer);
    this.timer = null;
    this.m16Timer = null;
  }

  setScenario(machineId: string, scenario: ScenarioType) {
    this.activeScenarios[machineId] = scenario;
    if (scenario === 'NORMAL') {
      const machines = LocalStore.getMachines();
      const m = machines.find(m => m.id === machineId);
      if (m) {
        m.status = 'NORMAL';
        m.health_score = 90 + Math.random() * 10;
        LocalStore.updateMachine(m);
      }
    }
  }

  private generateBaseline(machine: Machine): Telemetry {
    const last = LocalStore.getTelemetry(machine.id).slice(-1)[0];
    const baseRpm = 500;
    
    // Random walk with boundaries
    const t = last ? last.temperature + (Math.random() * 2 - 1) : 45 + Math.random() * 10;
    const v = last ? last.vibration + (Math.random() * 0.2 - 0.1) : 1.0 + Math.random() * 1.5;
    const c = last ? last.current + (Math.random() * 0.1 - 0.05) : 1.5 + Math.random() * 0.5;
    const r = last ? last.rpm + (Math.random() * 10 - 5) : baseRpm;
    
    return {
      machine_id: machine.id,
      timestamp: new Date().toISOString(),
      temperature: Math.max(40, Math.min(60, t)),
      vibration: Math.max(0.5, Math.min(2.5, v)),
      current: Math.max(1.0, Math.min(2.5, c)),
      rpm: Math.max(480, Math.min(520, r)),
      power: (Math.max(1.0, Math.min(2.5, c))) * 12, // approx V*I
    };
  }

  private applyScenario(machine: Machine, telemetry: Telemetry): Telemetry {
    const scenario = this.activeScenarios[machine.id] || 'NORMAL';
    if (scenario === 'NORMAL') return telemetry;

    switch (scenario) {
      case 'OVERLOAD':
        telemetry.temperature += 15;
        telemetry.vibration += 2.0;
        telemetry.current += 1.5;
        telemetry.rpm -= 100;
        telemetry.power = telemetry.current * 12;
        break;
      case 'OVERHEAT':
        telemetry.temperature += 25;
        telemetry.current += 0.5;
        break;
      case 'VIBRATION':
        telemetry.vibration += 3.5;
        telemetry.temperature += 5;
        break;
      case 'RPM_DROP':
        telemetry.rpm -= 150;
        telemetry.current += 1.0;
        break;
      case 'CRITICAL':
        telemetry.temperature += 35;
        telemetry.vibration += 4.5;
        telemetry.current += 3.0;
        telemetry.rpm -= 200;
        break;
    }
    return telemetry;
  }

  private calculateHealth(telemetry: Telemetry): number {
    // Basic normalized score
    let score = 100;
    
    // Temperature: normal 40-60
    if (telemetry.temperature > 60) score -= (telemetry.temperature - 60) * 1.5;
    // Vibration: normal < 2.5
    if (telemetry.vibration > 2.5) score -= (telemetry.vibration - 2.5) * 10;
    // Current: normal < 2.5
    if (telemetry.current > 2.5) score -= (telemetry.current - 2.5) * 15;
    // RPM: normal > 450
    if (telemetry.rpm < 450) score -= (450 - telemetry.rpm) * 0.2;

    return Math.max(0, Math.min(100, score));
  }

  private evaluateMachine(machine: Machine, telemetry: Telemetry) {
    const health = this.calculateHealth(telemetry);
    machine.health_score = Math.round(health);

    let newStatus = machine.status;
    if (health >= 80) newStatus = 'NORMAL';
    else if (health >= 60) newStatus = 'MONITORING';
    else if (health >= 40) newStatus = 'WARNING';
    else newStatus = 'CRITICAL';

    // Transition logic for alerts and RCA
    if (newStatus !== 'NORMAL' && machine.status === 'NORMAL') {
      this.generateRCA(machine, telemetry);
    }
    
    if (newStatus === 'CRITICAL' || newStatus === 'WARNING') {
        newStatus = 'INTERVENTION'; // For demo purposes, push straight to intervention if bad
    }

    machine.status = newStatus;
    LocalStore.updateMachine(machine);
  }

  private generateRCA(machine: Machine, telemetry: Telemetry) {
    const rcas = LocalStore.get<RootCauseAnalysis[]>('mandor_rca', []);
    
    let cause = 'UNKNOWN';
    let confidence = 0;
    let evidence: string[] = [];

    if (telemetry.temperature > 70 && telemetry.current > 3 && telemetry.vibration > 3 && telemetry.rpm < 400) {
      cause = 'MECHANICAL OVERLOAD';
      confidence = 91;
      evidence = ['Temperature HIGH', 'Vibration HIGH', 'Current HIGH', 'RPM LOW'];
    } else if (telemetry.vibration > 4) {
      cause = 'BEARING DEGRADATION';
      confidence = 84;
      evidence = ['Vibration VERY HIGH', 'Temperature Elevated'];
    } else if (telemetry.temperature > 75) {
      cause = 'THERMAL OVERLOAD';
      confidence = 88;
      evidence = ['Temperature VERY HIGH'];
    }

    if (cause !== 'UNKNOWN') {
      const rca: RootCauseAnalysis = {
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        probable_cause: cause,
        confidence,
        evidence,
        recommended_action: 'Inspect machine immediately. Reduce load or RPM.',
      };
      
      const existingIdx = rcas.findIndex(r => r.machine_id === machine.id);
      if (existingIdx !== -1) rcas[existingIdx] = rca;
      else rcas.push(rca);
      
      LocalStore.set('mandor_rca', rcas);
      
      // Generate Alert
      const alerts = LocalStore.get<Alert[]>('mandor_alerts', []);
      alerts.push({
        id: `ALT-${Date.now()}`,
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        type: 'CRITICAL',
        severity: 90,
        message: `${cause} detected.`,
        root_cause: cause,
        confidence,
        acknowledged: false
      });
      LocalStore.set('mandor_alerts', alerts);
    }
  }

  private tick() {
    const machines = LocalStore.getMachines().filter(m => m.id !== 'M-16');
    machines.forEach(machine => {
      let t = this.generateBaseline(machine);
      t = this.applyScenario(machine, t);
      LocalStore.addTelemetry(t);
      this.evaluateMachine(machine, t);
    });
    // Trigger re-render by dispatching event
    window.dispatchEvent(new Event('mandor-data-update'));
  }

  private tickM16() {
    const machines = LocalStore.getMachines();
    const m16 = machines.find(m => m.id === 'M-16');
    if (!m16) return;
    
    let t = this.generateBaseline(m16);
    t = this.applyScenario(m16, t);
    
    // Check if there are active interventions
    const ints = LocalStore.get<any[]>('mandor_interventions', []).filter(i => i.machine_id === 'M-16');
    const latestInt = ints[ints.length - 1];
    
    if (latestInt && latestInt.status === 'SUCCESS' && this.activeScenarios['M-16'] !== 'NORMAL') {
       // intervention applied, simulate reduction
       t.rpm = latestInt.target_value + (Math.random() * 4 - 2);
       t.temperature = Math.max(45, t.temperature - 10);
       t.vibration = Math.max(1.0, t.vibration - 1.5);
       t.current = Math.max(1.0, t.current - 1.0);
       t.power = t.current * 12;
    }

    LocalStore.addTelemetry(t);
    this.evaluateMachine(m16, t);
    window.dispatchEvent(new Event('mandor-data-update'));
  }
}

export const simulationEngine = new SimulationEngine();
