import type { Machine, Telemetry } from "../types/machine";

export const API_ORIGIN =
  import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_URL = `${API_ORIGIN}/api`;

export type MachineCondition = "NORMAL" | "WARNING" | "CRITICAL";

export interface SensorReadingInput {
  machine_id: string;
  current: number;
  temperature: number;
  rpm: number;
  vibration: number;
}

export interface MachinePrediction {
  status: MachineCondition;
  classifier_status: MachineCondition;
  confidence: number;
  probabilities: Record<MachineCondition, number>;
  features: Omit<SensorReadingInput, "machine_id">;
  model: string;
  decision_method: string;
  decision_notes: string[];
  evaluated_at: string;
  sensor_reading_id: string;
  prediction_id: string;
}

export interface PredictionHistoryItem extends MachinePrediction {
  _id: string;
  machine_id: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSource {
  title: string;
  source: string;
  excerpt: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
}

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CHAT_HISTORY_LENGTH = 7000;
const CHAT_HISTORY_TURNS = 8;
const TRUNCATION_MARKER = "\n[...riwayat dipersingkat...]\n";

function fitHistoryContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  if (maxLength <= TRUNCATION_MARKER.length) {
    return content.slice(-maxLength);
  }

  const availableLength = maxLength - TRUNCATION_MARKER.length;
  const beginningLength = Math.ceil(availableLength / 2);
  const endingLength = availableLength - beginningLength;
  return (
    content.slice(0, beginningLength) +
    TRUNCATION_MARKER +
    content.slice(-endingLength)
  );
}

function prepareChatHistory(
  history: ChatTurn[],
  currentMessageLength: number,
): ChatTurn[] {
  let remainingLength = MAX_CHAT_HISTORY_LENGTH - currentMessageLength;
  const selected: ChatTurn[] = [];

  for (const turn of history.slice(-CHAT_HISTORY_TURNS).reverse()) {
    if (remainingLength <= 0) break;
    const allowedLength = Math.min(
      MAX_CHAT_MESSAGE_LENGTH,
      remainingLength,
      turn.content.length,
    );
    if (allowedLength <= 0) continue;

    const content = fitHistoryContent(turn.content, allowedLength);
    selected.push({ role: turn.role, content });
    remainingLength -= content.length;
  }

  return selected.reverse();
}

function formatRequestError(status: number, detail: unknown): string {
  if (typeof detail === "string") {
    return `Request failed (${status}): ${detail}`;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const error = item as { loc?: unknown; msg?: unknown };
        const location = Array.isArray(error.loc)
          ? error.loc.map(String).join(".")
          : "";
        const message = typeof error.msg === "string" ? error.msg : "";
        return [location, message].filter(Boolean).join(": ");
      })
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      return `Request failed (${status}): ${messages.join("; ")}`;
    }
  }
  return `Request failed (${status})`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(formatRequestError(response.status, body?.detail));
  }
  return response.json() as Promise<T>;
}

export const apiDataProvider = {
  async predictMachineCondition(
    reading: SensorReadingInput,
  ): Promise<MachinePrediction> {
    return requestJson<MachinePrediction>(`${API_URL}/ai/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reading),
    });
  },

  async getMachinePredictions(
    machineId: string,
    limit = 20,
  ): Promise<PredictionHistoryItem[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    return requestJson<PredictionHistoryItem[]>(
      `${API_URL}/ai/machines/${encodeURIComponent(machineId)}/predictions?${query}`,
    );
  },

  async getMachine(machineId: string): Promise<Machine> {
    return requestJson<Machine>(
      `${API_URL}/machines/${encodeURIComponent(machineId)}`,
    );
  },

  async getMachines(): Promise<Machine[]> {
    return requestJson<Machine[]>(`${API_URL}/machines`);
  },

  async getTelemetry(machineId: string, limit = 100): Promise<Telemetry[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    return requestJson<Telemetry[]>(
      `${API_URL}/machines/${encodeURIComponent(machineId)}/telemetry?${query}`,
    );
  },

  async chatWithAssistant(
    message: string,
    machineId: string | undefined,
    history: ChatTurn[],
  ): Promise<ChatResponse> {
    return requestJson<ChatResponse>(`${API_URL}/chatbot/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        machine_id: machineId || null,
        all_machines: !machineId,
        history: prepareChatHistory(history, message.length),
      }),
    });
  },

  async chatWithCustomerAssistant(
    message: string,
    history: ChatTurn[],
  ): Promise<ChatResponse> {
    return requestJson<ChatResponse>(`${API_URL}/chatbot/customer/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: prepareChatHistory(history, message.length),
      }),
    });
  },
};
