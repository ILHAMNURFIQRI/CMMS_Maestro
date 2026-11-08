import { API_ORIGIN } from "./ApiDataProvider";
import { currentOrderRole } from "./ProductionOrders";

export type MaintenanceWorkOrderStatus =
  | "SUBMITTED"
  | "NEEDS_INFO"
  | "TRIAGED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "PENDING_VERIFICATION"
  | "CLOSED"
  | "REJECTED"
  | "CANCELLED";

export type MaintenanceWorkOrderType =
  | "CORRECTIVE"
  | "PREVENTIVE"
  | "INSPECTION";
export type MaintenanceWorkOrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface WorkOrderHistoryEntry {
  status: MaintenanceWorkOrderStatus;
  at: string;
  by_id: string;
  by_name: string;
  note: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  machine_id: string;
  machine_name: string;
  work_type: MaintenanceWorkOrderType;
  title: string;
  description: string;
  priority: MaintenanceWorkOrderPriority;
  source_alert_id: string | null;
  status: MaintenanceWorkOrderStatus;
  requested_by_id: string;
  requested_by_name: string;
  requested_by_email: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  manager_note: string;
  requester_response?: string;
  work_performed: string;
  parts_used: string;
  downtime_minutes: number | null;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  history: WorkOrderHistoryEntry[];
}

export interface AssignableOperator {
  id: string;
  name: string;
  email: string;
}

export interface MaintenanceWorkOrderDraft {
  machine_id: string;
  work_type: MaintenanceWorkOrderType;
  title: string;
  description: string;
  priority: MaintenanceWorkOrderPriority;
  source_alert_id: string | null;
}

export interface WorkOrderSchedule {
  assigned_to_id: string;
  scheduled_start: string;
  scheduled_end: string;
  note: string;
}

export interface WorkOrderExecution {
  action: "start" | "update" | "hold" | "resume" | "complete";
  note: string;
  work_performed: string;
  parts_used: string;
  downtime_minutes: number | null;
}

const API_URL = `${API_ORIGIN}/api`;
const STORAGE_KEY = "maestro_demo_maintenance_work_orders";

function localActor() {
  const role = currentOrderRole();
  if (role !== "manager" && role !== "operator") {
    throw new Error("Hanya Manager dan Operator yang dapat mengakses Maintenance WO.");
  }
  return {
    role,
    id: `demo-${role}`,
    name: role === "manager" ? "Manager Demo" : "Operator Demo",
    email: `${role}.demo@maestro.local`,
  };
}

function requireLocalRole(role: "manager" | "operator") {
  const actor = localActor();
  if (actor.role !== role) {
    throw new Error(`Tindakan ini hanya dapat dilakukan oleh ${role}.`);
  }
  return actor;
}

function readLocalOrders(): MaintenanceWorkOrder[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("Data Maintenance WO demo tidak valid.");
  }
  return parsed as MaintenanceWorkOrder[];
}

function writeLocalOrders(orders: MaintenanceWorkOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
    });
  } catch {
    throw new Error("Tidak dapat menghubungi backend untuk Maintenance WO.");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
        ? body.detail
        : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function localUpdate(
  orders: MaintenanceWorkOrder[],
  orderId: string,
  allowedStatuses: MaintenanceWorkOrderStatus[],
  status: MaintenanceWorkOrderStatus,
  note: string,
  changes: Partial<MaintenanceWorkOrder> = {},
): MaintenanceWorkOrder {
  const actor = localActor();
  const index = orders.findIndex((order) => order.id === orderId);
  const order = orders[index];
  if (!order || !allowedStatuses.includes(order.status)) {
    throw new Error("Maintenance WO tidak ditemukan atau statusnya sudah berubah.");
  }
  const now = new Date().toISOString();
  const updated = {
    ...order,
    ...changes,
    status,
    updated_at: now,
    history: [
      ...order.history,
      {
        status,
        at: now,
        by_id: actor.id,
        by_name: actor.name,
        note: note.trim(),
      },
    ],
  };
  orders[index] = updated;
  writeLocalOrders(orders);
  return updated;
}

export const maintenanceWorkOrderService = {
  async list(localMode: boolean): Promise<MaintenanceWorkOrder[]> {
    const actor = localMode ? localActor() : null;
    if (localMode) {
      const orders = readLocalOrders();
      return actor?.role === "manager"
        ? orders
        : orders.filter(
            (order) =>
              order.requested_by_id === actor?.id ||
              order.assigned_to_id === actor?.id,
          );
    }
    return requestJson<MaintenanceWorkOrder[]>("/maintenance-work-orders");
  },

  async listOperators(localMode: boolean): Promise<AssignableOperator[]> {
    if (localMode) {
      requireLocalRole("manager");
      return [{ id: "demo-operator", name: "Operator Demo", email: "operator.demo@maestro.local" }];
    }
    return requestJson<AssignableOperator[]>("/maintenance-work-orders/operators");
  },

  async create(
    payload: MaintenanceWorkOrderDraft,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>("/maintenance-work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    const actor = localActor();
    const now = new Date().toISOString();
    const order: MaintenanceWorkOrder = {
      ...payload,
      id: `MWO-DEMO-${Date.now().toString(36).toUpperCase()}`,
      machine_name: payload.machine_id,
      status: "SUBMITTED",
      requested_by_id: actor.id,
      requested_by_name: actor.name,
      requested_by_email: actor.email,
      assigned_to_id: null,
      assigned_to_name: null,
      assigned_to_email: null,
      scheduled_start: null,
      scheduled_end: null,
      manager_note: "",
      work_performed: "",
      parts_used: "",
      downtime_minutes: null,
      created_at: now,
      updated_at: now,
      history: [
        {
          status: "SUBMITTED",
          at: now,
          by_id: actor.id,
          by_name: actor.name,
          note: "Maintenance Work Order diajukan.",
        },
      ],
    };
    writeLocalOrders([order, ...readLocalOrders()]);
    return order;
  },

  async review(
    orderId: string,
    decision: "approve" | "request_info" | "reject",
    priority: MaintenanceWorkOrderPriority,
    note: string,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, priority, note }),
        },
      );
    }
    requireLocalRole("manager");
    if (decision !== "approve" && !note.trim()) {
      throw new Error("Catatan wajib untuk meminta informasi atau menolak WO.");
    }
    const orders = readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order || !["SUBMITTED", "NEEDS_INFO"].includes(order.status)) {
      throw new Error("Maintenance WO tidak menunggu review Manager.");
    }
    const nextStatus: MaintenanceWorkOrderStatus =
      decision === "approve"
        ? "TRIAGED"
        : decision === "request_info"
          ? "NEEDS_INFO"
          : "REJECTED";
    return localUpdate(
      orders,
      orderId,
      ["SUBMITTED", "NEEDS_INFO"],
      nextStatus,
      note || "Triage selesai; siap dijadwalkan.",
      { priority, manager_note: note },
    );
  },

  async provideInformation(
    orderId: string,
    note: string,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/information`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
    }
    const actor = localActor();
    const orders = readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (
      actor.role !== "operator" ||
      !order ||
      order.requested_by_id !== actor.id ||
      order.status !== "NEEDS_INFO"
    ) {
      throw new Error("Hanya Operator pemohon dapat menjawab permintaan informasi.");
    }
    return localUpdate(
      orders,
      orderId,
      ["NEEDS_INFO"],
      "SUBMITTED",
      note,
      { requester_response: note.trim() },
    );
  },

  async schedule(
    orderId: string,
    payload: WorkOrderSchedule,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/schedule`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    }
    requireLocalRole("manager");
    const orders = readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    const operator = (await this.listOperators(true)).find(
      (item) => item.id === payload.assigned_to_id,
    );
    if (!order || order.status !== "TRIAGED" || !operator) {
      throw new Error("Order harus selesai ditriage dan Operator harus dipilih.");
    }
    const start = new Date(payload.scheduled_start);
    const end = new Date(payload.scheduled_end);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start <= new Date() ||
      end <= start
    ) {
      throw new Error("Periksa waktu mulai dan selesai.");
    }
    if (
      orders.some(
        (candidate) =>
          candidate.id !== orderId &&
          candidate.machine_id === order.machine_id &&
          ["SCHEDULED", "IN_PROGRESS", "ON_HOLD"].includes(candidate.status) &&
          candidate.scheduled_start &&
          candidate.scheduled_end &&
          start < new Date(candidate.scheduled_end) &&
          end > new Date(candidate.scheduled_start),
      )
    ) {
      throw new Error("Jadwal maintenance mesin tersebut bentrok.");
    }
    return localUpdate(
      orders,
      orderId,
      ["TRIAGED"],
      "SCHEDULED",
      payload.note || "Operator ditugaskan dan jadwal ditetapkan.",
      {
        assigned_to_id: operator.id,
        assigned_to_name: operator.name,
        assigned_to_email: operator.email,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
      },
    );
  },

  async execute(
    orderId: string,
    payload: WorkOrderExecution,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/execution`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
    }
    const actor = localActor();
    const orders = readLocalOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order || actor.role !== "operator" || order.assigned_to_id !== actor.id) {
      throw new Error("Order tidak ditugaskan kepada Operator ini.");
    }
    const transitions = {
      start: { from: "SCHEDULED", to: "IN_PROGRESS" },
      update: { from: "IN_PROGRESS", to: "IN_PROGRESS" },
      hold: { from: "IN_PROGRESS", to: "ON_HOLD" },
      resume: { from: "ON_HOLD", to: "IN_PROGRESS" },
      complete: { from: "IN_PROGRESS", to: "PENDING_VERIFICATION" },
    } as const;
    const transition = transitions[payload.action];
    if (order.status !== transition.from) {
      throw new Error(`WO berstatus ${order.status} tidak dapat diproses.`);
    }
    if (payload.action === "hold" && !payload.note.trim()) {
      throw new Error("Berikan alasan sebelum menahan WO.");
    }
    if (payload.action === "complete" && !payload.work_performed.trim()) {
      throw new Error("Isi tindakan yang dilakukan sebelum meminta verifikasi.");
    }
    const changes: Partial<MaintenanceWorkOrder> =
      payload.action === "update" || payload.action === "complete"
        ? {
            work_performed: payload.work_performed || order.work_performed,
            parts_used: payload.parts_used,
            downtime_minutes:
              payload.downtime_minutes ?? order.downtime_minutes,
          }
        : {};
    return localUpdate(
      orders,
      orderId,
      [transition.from],
      transition.to,
      payload.note || `Aksi ${payload.action} dicatat.`,
      changes,
    );
  },

  async verify(
    orderId: string,
    decision: "close" | "reopen",
    note: string,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/verify`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note }),
        },
      );
    }
    requireLocalRole("manager");
    const orders = readLocalOrders();
    const changes: Partial<MaintenanceWorkOrder> =
      decision === "reopen"
        ? {
            assigned_to_id: null,
            assigned_to_name: null,
            assigned_to_email: null,
            scheduled_start: null,
            scheduled_end: null,
          }
        : { closed_at: new Date().toISOString() };
    return localUpdate(
      orders,
      orderId,
      ["PENDING_VERIFICATION"],
      decision === "close" ? "CLOSED" : "TRIAGED",
      note,
      changes,
    );
  },

  async cancel(
    orderId: string,
    note: string,
    localMode: boolean,
  ): Promise<MaintenanceWorkOrder> {
    if (!localMode) {
      return requestJson<MaintenanceWorkOrder>(
        `/maintenance-work-orders/${encodeURIComponent(orderId)}/cancel`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        },
      );
    }
    requireLocalRole("manager");
    return localUpdate(
      readLocalOrders(),
      orderId,
      ["SUBMITTED", "NEEDS_INFO", "TRIAGED", "SCHEDULED", "ON_HOLD"],
      "CANCELLED",
      note,
    );
  },
};
