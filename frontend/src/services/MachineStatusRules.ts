import type { Telemetry, MachineStatus } from "../types/machine";

export const MACHINE_THRESHOLDS = {
  temperature: {
    normalMax: 35.9,
    warningMin: 36.0,
    criticalMin: 40.0,
  },
  vibration: {
    normalMin: 3.0,
    normalMax: 15.0,
    warningAtTemperature: 37.5,
    warningMin: 4.0,
    criticalAtTemperature: 40.0,
    criticalMin: 3.5,
  },
  current: {
    normalMax: 2.5,
    warningAtTemperature: 37.5,
    warningWithVibration: 9.0,
    warningMin: 0.05,
  },
  rpm: {
    normalMin: 0,
    normalMax: 400,
  },
} as const;

export type MachineStatusEvaluation = {
  status: MachineStatus;
  reason: string;
};

export function evaluateMachineStatus(
  telemetry: Telemetry,
): MachineStatusEvaluation {
  const { temperature, vibration, current } = telemetry;

  // Temperature is the primary threshold from the sensitivity test.
  if (temperature >= MACHINE_THRESHOLDS.temperature.criticalMin) {
    return {
      status: "CRITICAL",
      reason: `Suhu dominan mencapai ${temperature.toFixed(1)} °C (batas kritis >= 40.0 °C).`,
    };
  }
  if (temperature >= MACHINE_THRESHOLDS.temperature.warningMin) {
    return {
      status: "WARNING",
      reason: `Suhu dominan mencapai ${temperature.toFixed(1)} °C (rentang warning 36.0-39.9 °C).`,
    };
  }

  // Supporting parameters only affect a temperature-context combination.
  if (
    temperature >= MACHINE_THRESHOLDS.vibration.warningAtTemperature &&
    vibration >= MACHINE_THRESHOLDS.vibration.warningMin
  ) {
    return {
      status: "WARNING",
      reason: "Kombinasi suhu dan getaran memicu warning.",
    };
  }
  if (
    temperature >= MACHINE_THRESHOLDS.current.warningAtTemperature &&
    vibration >= MACHINE_THRESHOLDS.current.warningWithVibration &&
    current >= MACHINE_THRESHOLDS.current.warningMin
  ) {
    return {
      status: "WARNING",
      reason: "Kombinasi suhu, getaran, dan arus memicu warning.",
    };
  }

  return {
    status: "NORMAL",
    reason: "Semua parameter berada pada kondisi normal.",
  };
}

export function calculateHealthScore(telemetry: Telemetry): number {
  const evaluation = evaluateMachineStatus(telemetry);
  const { temperature, vibration, current } = telemetry;

  if (evaluation.status === "NORMAL") {
    const vibrationPenalty = vibration < 3.0 ? (3.0 - vibration) * 2 : 0;
    const currentPenalty = Math.max(0, current - 2.5) * 4;
    return Math.round(
      Math.max(80, Math.min(100, 100 - vibrationPenalty - currentPenalty)),
    );
  }

  if (evaluation.status === "WARNING") {
    if (temperature >= 36.0) {
      const progress = Math.min(1, Math.max(0, (temperature - 36.0) / 3.9));
      return Math.round(79 - progress * 39);
    }
    return 70;
  }

  const criticalProgress = Math.min(1, Math.max(0, (temperature - 40.0) / 20));
  return Math.round(39 - criticalProgress * 39);
}
