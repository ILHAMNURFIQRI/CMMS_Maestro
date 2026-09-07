import { LocalStore } from "./LocalStore";
import type {
  Machine,
  Telemetry,
  Alert,
  RootCauseAnalysis,
  ProductionMetrics,
  EnergyMetrics,
} from "../types/machine";
import {
  calculateHealthScore,
  evaluateMachineStatus,
} from "./MachineStatusRules";

export type ScenarioType =
  | "NORMAL"
  | "OVERLOAD"
  | "OVERHEAT"
  | "VIBRATION"
  | "RPM_DROP"
  | "CRITICAL";

export class SimulationEngine {
  private activeScenarios: Record<string, ScenarioType> = {};
  private timer: number | null = null;
  private m16Timer: number | null = null;

  start() {
    if (this.timer) return;
    LocalStore.initialize();

    // Seed production + energy metrics immediately on start
    this.seedProductionAndEnergy();

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
    if (scenario === "NORMAL") {
      const machines = LocalStore.getMachines();
      const m = machines.find((m) => m.id === machineId);
      if (m) {
        m.status = "NORMAL";
        m.health_score = 90 + Math.random() * 10;
        LocalStore.updateMachine(m);
      }
    }
  }

  private generateBaseline(machine: Machine): Telemetry {
    const last = LocalStore.getTelemetry(machine.id).slice(-1)[0];
    const baseRpm = 300;

    // Random walk with boundaries
    const t = last
      ? last.temperature + (Math.random() * 0.4 - 0.2)
      : 34.5 + Math.random() * 1.2;
    const v = last
      ? last.vibration + (Math.random() * 0.2 - 0.1)
      : 3.0 + Math.random() * 2;
    const c = last
      ? last.current + (Math.random() * 0.1 - 0.05)
      : Math.random() * 2.5;
    const r = last ? last.rpm + (Math.random() * 10 - 5) : baseRpm;

    return {
      machine_id: machine.id,
      timestamp: new Date().toISOString(),
      temperature: Math.max(0, Math.min(35.9, t)),
      vibration: Math.max(3.0, Math.min(15, v)),
      current: Math.max(0, Math.min(2.5, c)),
      rpm: Math.max(0, Math.min(400, r)),
      power: Math.max(0, Math.min(2.5, c)) * 12,
    };
  }

  private applyScenario(machine: Machine, telemetry: Telemetry): Telemetry {
    const scenario = this.activeScenarios[machine.id] || "NORMAL";
    if (scenario === "NORMAL") return telemetry;

    switch (scenario) {
      case "OVERLOAD":
        telemetry.temperature += 15;
        telemetry.vibration += 2.0;
        telemetry.current += 1.5;
        telemetry.rpm -= 100;
        telemetry.power = telemetry.current * 12;
        break;
      case "OVERHEAT":
        telemetry.temperature += 25;
        telemetry.current += 0.5;
        break;
      case "VIBRATION":
        telemetry.vibration += 3.5;
        telemetry.temperature += 5;
        break;
      case "RPM_DROP":
        telemetry.rpm -= 150;
        telemetry.current += 1.0;
        break;
      case "CRITICAL":
        telemetry.temperature += 35;
        telemetry.vibration += 4.5;
        telemetry.current += 3.0;
        telemetry.rpm -= 200;
        break;
    }
    return telemetry;
  }

  private calculateHealth(telemetry: Telemetry): number {
    return calculateHealthScore(telemetry);
  }

  private evaluateMachine(machine: Machine, telemetry: Telemetry) {
    const health = this.calculateHealth(telemetry);
    machine.health_score = Math.round(health);

    const evaluation = evaluateMachineStatus(telemetry);
    const newStatus = evaluation.status;

    // Transition logic for alerts and RCA
    if (newStatus !== "NORMAL" && machine.status === "NORMAL") {
      this.generateRCA(machine, telemetry);
    }

    machine.status = newStatus;
    LocalStore.updateMachine(machine);
  }

  private generateRCA(machine: Machine, telemetry: Telemetry) {
    const rcas = LocalStore.get<RootCauseAnalysis[]>("mandor_rca", []);
    const evaluation = evaluateMachineStatus(telemetry);

    if (evaluation.status !== "NORMAL") {
      const cause =
        evaluation.status === "CRITICAL"
          ? "CRITICAL TEMPERATURE / MACHINE CONDITION"
          : "TEMPERATURE ABOVE NORMAL BASELINE";
      const rca: RootCauseAnalysis = {
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        probable_cause: cause,
        confidence: evaluation.status === "CRITICAL" ? 95 : 85,
        evidence: [evaluation.reason],
        recommended_action:
          evaluation.status === "CRITICAL"
            ? "Hentikan mesin dan periksa sistem pendingin serta beban mekanis."
            : "Turunkan beban mesin dan pantau suhu sampai kembali di bawah 36.0 °C.",
      };

      const existingIdx = rcas.findIndex((r) => r.machine_id === machine.id);
      if (existingIdx !== -1) rcas[existingIdx] = rca;
      else rcas.push(rca);

      LocalStore.set("mandor_rca", rcas);

      // Generate Alert
      const alerts = LocalStore.get<Alert[]>("mandor_alerts", []);
      alerts.push({
        id: `ALT-${Date.now()}`,
        machine_id: machine.id,
        timestamp: new Date().toISOString(),
        type: "CRITICAL",
        severity: evaluation.status === "CRITICAL" ? 90 : 60,
        message: `${cause} detected.`,
        root_cause: cause,
        confidence: evaluation.status === "CRITICAL" ? 95 : 85,
        acknowledged: false,
      });
      LocalStore.set("mandor_alerts", alerts);
    }
  }

  /* ------------------------------------------------------------ */
  /*  Production & Energy Metrics Generation                       */
  /* ------------------------------------------------------------ */

  private generateProductionMetrics(
    machine: Machine,
    telemetry: Telemetry,
  ): void {
    const production = LocalStore.get<ProductionMetrics[]>(
      "mandor_production",
      [],
    );
    const health = machine.health_score;

    // Derive realistic production numbers from health + telemetry
    const seed = machine.id.charCodeAt(machine.id.length - 1);
    const baseOutput = 800 + seed * 12; // 800–1000 range
    const healthFactor = health / 100;
    const rpmFactor = Math.min(1, telemetry.rpm / 500);

    const availability = Math.min(
      99,
      Math.round(75 + healthFactor * 24 + (Math.random() * 2 - 1)),
    );
    const performance = Math.min(
      99,
      Math.round(70 + rpmFactor * 25 + (Math.random() * 2 - 1)),
    );
    const quality = Math.min(
      100,
      Math.round(88 + healthFactor * 11 + (Math.random() * 1 - 0.5)),
    );
    const oee = +((availability * performance * quality) / 10000).toFixed(1);

    const productionOutput = Math.round(baseOutput * healthFactor * rpmFactor);
    const defectCount = Math.round(productionOutput * ((100 - quality) / 100));
    const cycleTime = +(
      18 +
      (1 - healthFactor) * 12 +
      (Math.random() * 2 - 1)
    ).toFixed(1);
    const downtime = Math.round((100 - availability) * 4.8); // minutes

    const metrics: ProductionMetrics = {
      machine_id: machine.id,
      oee,
      availability,
      performance,
      quality,
      cycle_time: cycleTime,
      production_output: productionOutput,
      defect_count: defectCount,
      downtime,
    };

    const existingIdx = production.findIndex(
      (p) => p.machine_id === machine.id,
    );
    if (existingIdx !== -1) production[existingIdx] = metrics;
    else production.push(metrics);

    LocalStore.set("mandor_production", production);
  }

  private generateEnergyMetrics(machine: Machine, telemetry: Telemetry): void {
    const energy = LocalStore.get<EnergyMetrics[]>("mandor_energy", []);

    const consumption = +(
      telemetry.power *
      (0.9 + Math.random() * 0.2)
    ).toFixed(1);
    const saved = +(consumption * (machine.health_score / 100) * 0.12).toFixed(
      1,
    );

    const metrics: EnergyMetrics = {
      machine_id: machine.id,
      energy_consumption: consumption,
      energy_saved: saved,
    };

    const existingIdx = energy.findIndex((e) => e.machine_id === machine.id);
    if (existingIdx !== -1) energy[existingIdx] = metrics;
    else energy.push(metrics);

    LocalStore.set("mandor_energy", energy);
  }

  /** Seed production + energy for ALL machines immediately so pages have data on load */
  private seedProductionAndEnergy(): void {
    const machines = LocalStore.getMachines();
    for (const m of machines) {
      const telHistory = LocalStore.getTelemetry(m.id);
      // Use latest telemetry if available, otherwise fabricate a baseline
      const tel =
        telHistory.length > 0
          ? telHistory[telHistory.length - 1]
          : this.generateBaseline(m);
      this.generateProductionMetrics(m, tel);
      this.generateEnergyMetrics(m, tel);
    }
  }

  private tick() {
    const machines = LocalStore.getMachines().filter((m) => m.id !== "M-16");
    machines.forEach((machine) => {
      let t = this.generateBaseline(machine);
      t = this.applyScenario(machine, t);
      LocalStore.addTelemetry(t);
      this.evaluateMachine(machine, t);
      this.generateProductionMetrics(machine, t);
      this.generateEnergyMetrics(machine, t);
    });
    // Trigger re-render by dispatching event
    window.dispatchEvent(new Event("mandor-data-update"));
  }

  private tickM16() {
    const machines = LocalStore.getMachines();
    const m16 = machines.find((m) => m.id === "M-16");
    if (!m16) return;

    let t = this.generateBaseline(m16);
    t = this.applyScenario(m16, t);

    // Check if there are active interventions
    const ints = LocalStore.get<any[]>("mandor_interventions", []).filter(
      (i) => i.machine_id === "M-16",
    );
    const latestInt = ints[ints.length - 1];

    if (
      latestInt &&
      latestInt.status === "SUCCESS" &&
      this.activeScenarios["M-16"] !== "NORMAL"
    ) {
      // intervention applied, simulate reduction
      t.rpm = latestInt.target_value + (Math.random() * 4 - 2);
      t.temperature = Math.max(45, t.temperature - 10);
      t.vibration = Math.max(1.0, t.vibration - 1.5);
      t.current = Math.max(1.0, t.current - 1.0);
      t.power = t.current * 12;
    }

    LocalStore.addTelemetry(t);
    this.evaluateMachine(m16, t);
    this.generateProductionMetrics(m16, t);
    this.generateEnergyMetrics(m16, t);
    window.dispatchEvent(new Event("mandor-data-update"));
  }
}

export const simulationEngine = new SimulationEngine();
