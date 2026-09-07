import type { Machine, Telemetry } from "../types/machine";

export const API_ORIGIN =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_URL = `${API_ORIGIN}/api`;

export const apiDataProvider = {
  async getMachine(machineId: string): Promise<Machine> {
    const response = await fetch(`${API_URL}/machines/${machineId}`);
    if (!response.ok)
      throw new Error(`Failed to load machine: ${response.status}`);
    return response.json();
  },

  async getMachines(): Promise<Machine[]> {
    const response = await fetch(`${API_URL}/machines`);
    if (!response.ok)
      throw new Error(`Failed to load machines: ${response.status}`);
    return response.json();
  },

  async getTelemetry(machineId: string, limit = 100): Promise<Telemetry[]> {
    const response = await fetch(
      `${API_URL}/machines/${machineId}/telemetry?limit=${limit}`,
    );
    if (!response.ok)
      throw new Error(`Failed to load telemetry: ${response.status}`);
    return response.json();
  },
};
