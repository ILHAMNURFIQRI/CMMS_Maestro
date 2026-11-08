export type OrderRole = "customer" | "manager" | "operator";
export type OrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "REVISION_REQUESTED"
  | "REJECTED"
  | "APPROVED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED";

export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string;
  finished_goods_on_hand: number;
  production_rate_per_hour: number;
}

export interface OrderLine {
  product_id: string;
  product_name: string;
  category: string;
  unit: string;
  quantity: number;
  finished_goods_on_hand_at_request: number | null;
  raw_material_availability: "NOT_ASSESSED";
}

export interface OrderInputLine {
  product_id: string;
  quantity: number;
}

export interface OrderDetails {
  items: OrderInputLine[];
  target_at: string;
  notes: string;
}

export interface ProductionOrder {
  id: string;
  customer_email?: string;
  customer_name?: string;
  items: OrderLine[];
  total_quantity: number;
  target_at: string;
  estimated_hours: number;
  estimated_completion_at: string;
  estimate_is_feasible: boolean;
  estimate_summary: string;
  notes: string;
  status: OrderStatus;
  created_at: string;
  manager_note: string | null;
  machine_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  produced_quantity: number;
  operator_note: string;
  history: OrderHistoryEntry[];
}

export interface OrderHistoryEntry {
  status: OrderStatus;
  at: string;
  by: string;
  note: string;
}

export interface OrderSchedule {
  machine_id: "M-16";
  scheduled_start: string;
  scheduled_end: string;
  note: string;
}

const API_ORIGIN = import.meta.env.VITE_API_URL || "http://localhost:8000";
const STORAGE_KEY = "maestro_demo_production_orders";

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "PRD-001",
    name: "Conveyor Roller",
    category: "Conveyor Parts",
    unit: "pcs",
    finished_goods_on_hand: 240,
    production_rate_per_hour: 40,
  },
  {
    id: "PRD-002",
    name: "Mounting Bracket",
    category: "Metal Components",
    unit: "pcs",
    finished_goods_on_hand: 520,
    production_rate_per_hour: 80,
  },
  {
    id: "PRD-003",
    name: "Drive Pulley",
    category: "Conveyor Parts",
    unit: "pcs",
    finished_goods_on_hand: 90,
    production_rate_per_hour: 20,
  },
];

export function currentOrderRole(): OrderRole | null {
  const demo = sessionStorage.getItem("maestro_demo_role");
  if (demo === "customer" || demo === "manager" || demo === "operator") {
    return demo;
  }
  const authenticated = sessionStorage.getItem("maestro_auth_role");
  if (
    authenticated === "customer" ||
    authenticated === "manager" ||
    authenticated === "operator"
  ) {
    return authenticated;
  }
  return null;
}

export function isDemoSession(): boolean {
  return sessionStorage.getItem("maestro_demo_role") !== null;
}

function localOrders(): ProductionOrder[] {
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return [];
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed)) {
    throw new Error("Local demo order data is invalid");
  }
  return parsed as ProductionOrder[];
}

function saveLocalOrders(orders: ProductionOrder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, {
      ...init,
      credentials: "include",
    });
  } catch {
    throw new Error("Tidak dapat menghubungi backend. Pastikan API berjalan.");
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

function requireRole(...roles: OrderRole[]): OrderRole {
  const role = currentOrderRole();
  if (!role || !roles.includes(role)) {
    throw new Error("Role ini tidak memiliki izin untuk tindakan tersebut.");
  }
  return role;
}

function buildLocalOrder(
  details: OrderDetails,
  status: "DRAFT" | "SUBMITTED" = "SUBMITTED",
  existing?: ProductionOrder,
): ProductionOrder {
  const lines: OrderLine[] = details.items.map((item) => {
    const product = DEMO_PRODUCTS.find((candidate) => candidate.id === item.product_id);
    if (!product) throw new Error(`Unknown demo product: ${item.product_id}`);
    return {
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      unit: product.unit,
      quantity: item.quantity,
      finished_goods_on_hand_at_request: product.finished_goods_on_hand,
      raw_material_availability: "NOT_ASSESSED",
    };
  });
  const hours = Math.max(
    1,
    Math.ceil(
      details.items.reduce((sum, item) => {
        const product = DEMO_PRODUCTS.find((candidate) => candidate.id === item.product_id);
        return sum + item.quantity / (product?.production_rate_per_hour ?? 1);
      }, 0),
    ),
  );
  const now = new Date();
  const target = new Date(details.target_at);
  const estimatedCompletion = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const feasible = estimatedCompletion <= target;
  const remainingHours = Math.max(0, (target.getTime() - now.getTime()) / 3_600_000);
  const id = existing?.id ?? `PO-DEMO-${Date.now().toString(36).toUpperCase()}`;

  return {
    id,
    customer_email: "customer.demo@maestro.local",
    customer_name: "Customer Demo",
    items: lines,
    total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    target_at: target.toISOString(),
    estimated_hours: hours,
    estimated_completion_at: estimatedCompletion.toISOString(),
    estimate_is_feasible: feasible,
    estimate_summary: feasible
      ? "Target waktu terlihat cukup berdasarkan estimasi kapasitas demo."
      : `Target waktu berisiko: kapasitas demo memperkirakan sekitar ${hours} jam, sementara waktu yang tersedia ${remainingHours.toFixed(1)} jam.`,
    notes: details.notes.trim(),
    status,
    created_at: existing?.created_at ?? now.toISOString(),
    manager_note: null,
    machine_id: existing?.machine_id ?? null,
    scheduled_start: existing?.scheduled_start ?? null,
    scheduled_end: existing?.scheduled_end ?? null,
    produced_quantity: existing?.produced_quantity ?? 0,
    operator_note: existing?.operator_note ?? "",
    history: existing?.history ?? [
      {
        status,
        at: now.toISOString(),
        by: "customer.demo@maestro.local",
        note:
          status === "DRAFT"
            ? "Permintaan disimpan sebagai draft."
            : "Permintaan produksi dikirim.",
      },
    ],
  };
}

export const productionOrderService = {
  async getProducts(): Promise<Product[]> {
    requireRole("customer", "manager", "operator");
    if (isDemoSession()) return DEMO_PRODUCTS;
    return requestJson<Product[]>("/products");
  },

  async getOrders(): Promise<ProductionOrder[]> {
    const role = requireRole("customer", "manager", "operator");
    if (isDemoSession()) {
      const orders = localOrders();
      if (role === "customer") {
        return orders.filter(
          (order) => order.customer_email === "customer.demo@maestro.local",
        );
      }
      if (role === "operator") {
        return orders
          .filter((order) =>
            ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(order.status),
          )
          .map((order) => {
            const operatorOrder = { ...order };
            delete operatorOrder.customer_email;
            delete operatorOrder.customer_name;
            return operatorOrder;
          });
      }
      return orders.filter((order) => order.status !== "DRAFT");
    }
    return requestJson<ProductionOrder[]>("/production-orders");
  },

  async createOrder(details: OrderDetails): Promise<ProductionOrder> {
    requireRole("customer");
    if (isDemoSession()) {
      const order = buildLocalOrder(details);
      saveLocalOrders([order, ...localOrders()]);
      return order;
    }
    return requestJson<ProductionOrder>("/production-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    });
  },

  async createDraft(details: OrderDetails): Promise<ProductionOrder> {
    requireRole("customer");
    if (isDemoSession()) {
      const order = buildLocalOrder(details, "DRAFT");
      saveLocalOrders([order, ...localOrders()]);
      return order;
    }
    return requestJson<ProductionOrder>("/production-orders/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    });
  },

  async updateDraft(orderId: string, details: OrderDetails): Promise<ProductionOrder> {
    requireRole("customer");
    if (isDemoSession()) {
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0 || orders[index].status !== "DRAFT") {
        throw new Error("Draft tidak ditemukan atau sudah dikirim.");
      }
      const updated = buildLocalOrder(details, "DRAFT", orders[index]);
      updated.history = [
        ...(orders[index].history ?? []),
        {
          status: "DRAFT",
          at: new Date().toISOString(),
          by: "customer.demo@maestro.local",
          note: "Customer memperbarui draft.",
        },
      ];
      orders[index] = updated;
      saveLocalOrders(orders);
      return updated;
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/draft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      },
    );
  },

  async submitDraft(orderId: string): Promise<ProductionOrder> {
    requireRole("customer");
    if (isDemoSession()) {
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0 || orders[index].status !== "DRAFT") {
        throw new Error("Draft tidak ditemukan atau sudah dikirim.");
      }
      const now = new Date().toISOString();
      orders[index] = {
        ...orders[index],
        status: "SUBMITTED",
        history: [
          ...(orders[index].history ?? []),
          {
            status: "SUBMITTED",
            at: now,
            by: "customer.demo@maestro.local",
            note: "Draft dikirim untuk validasi Manager.",
          },
        ],
      };
      saveLocalOrders(orders);
      return orders[index];
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/submit`,
      { method: "POST" },
    );
  },

  async resubmitOrder(orderId: string, details: OrderDetails): Promise<ProductionOrder> {
    requireRole("customer");
    if (isDemoSession()) {
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0 || orders[index].status !== "REVISION_REQUESTED") {
        throw new Error("Permintaan ini tidak sedang menunggu revisi.");
      }
      const previous = orders[index];
      const next = buildLocalOrder(details, "SUBMITTED", previous);
      next.history = [
        ...(previous.history ?? []),
        {
          status: "SUBMITTED",
          at: new Date().toISOString(),
          by: "customer.demo@maestro.local",
          note: "Customer mengirim revisi.",
        },
      ];
      const order = next;
      orders[index] = order;
      saveLocalOrders(orders);
      return order;
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/resubmit`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      },
    );
  },

  async reviewOrder(
    orderId: string,
    decision: "approve" | "reject" | "request_revision",
    note: string,
  ): Promise<ProductionOrder> {
    requireRole("manager");
    if (isDemoSession()) {
      if (decision !== "approve" && !note.trim()) {
        throw new Error("Catatan wajib untuk menolak atau meminta revisi.");
      }
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0 || orders[index].status !== "SUBMITTED") {
        throw new Error("Permintaan tidak lagi menunggu validasi.");
      }
      const statuses: Record<
        "approve" | "reject" | "request_revision",
        OrderStatus
      > = {
        approve: "APPROVED",
        reject: "REJECTED",
        request_revision: "REVISION_REQUESTED",
      };
      const status = statuses[decision];
      const now = new Date().toISOString();
      orders[index] = {
        ...orders[index],
        status,
        manager_note: note.trim(),
        history: [
          ...(orders[index].history ?? []),
          {
            status,
            at: now,
            by: "manager.demo@maestro.local",
            note: note.trim(),
          },
        ],
      };
      saveLocalOrders(orders);
      return orders[index];
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/review`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      },
    );
  },

  async scheduleOrder(
    orderId: string,
    schedule: OrderSchedule,
  ): Promise<ProductionOrder> {
    requireRole("manager");
    if (isDemoSession()) {
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      if (index < 0 || orders[index].status !== "APPROVED") {
        throw new Error("Hanya order yang disetujui yang dapat dijadwalkan.");
      }
      const start = new Date(schedule.scheduled_start);
      const end = new Date(schedule.scheduled_end);
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        start <= new Date()
      ) {
        throw new Error("Waktu mulai dan selesai harus valid serta di masa depan.");
      }
      if (end <= start) throw new Error("Waktu selesai harus setelah waktu mulai.");
      if (end > new Date(orders[index].target_at)) {
        throw new Error("Jadwal selesai tidak boleh melewati target Customer.");
      }
      if (end.getTime() - start.getTime() > 7 * 24 * 60 * 60_000) {
        throw new Error("Jadwal produksi tidak boleh lebih dari tujuh hari.");
      }
      const overlap = orders.some(
        (order) =>
          order.id !== orderId &&
          ["SCHEDULED", "IN_PROGRESS"].includes(order.status) &&
          order.machine_id === schedule.machine_id &&
          order.scheduled_start &&
          order.scheduled_end &&
          start < new Date(order.scheduled_end) &&
          end > new Date(order.scheduled_start),
      );
      if (overlap) throw new Error("M-16 sudah memiliki jadwal pada waktu tersebut.");
      const now = new Date().toISOString();
      orders[index] = {
        ...orders[index],
        status: "SCHEDULED",
        machine_id: schedule.machine_id,
        scheduled_start: start.toISOString(),
        scheduled_end: end.toISOString(),
        manager_note: schedule.note.trim() || orders[index].manager_note,
        history: [
          ...(orders[index].history ?? []),
          {
            status: "SCHEDULED",
            at: now,
            by: "manager.demo@maestro.local",
            note: schedule.note.trim() || "Jadwal produksi ditetapkan.",
          },
        ],
      };
      saveLocalOrders(orders);
      return orders[index];
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/schedule`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      },
    );
  },

  async updateExecution(
    orderId: string,
    action: "start" | "update" | "complete",
    machineId?: string,
    producedQuantity?: number,
    note = "",
  ): Promise<ProductionOrder> {
    requireRole("operator");
    if (isDemoSession()) {
      const orders = localOrders();
      const index = orders.findIndex((order) => order.id === orderId);
      const order = orders[index];
      if (!order) throw new Error("Permintaan produksi tidak ditemukan.");
      if (action === "start") {
        if (order.status !== "SCHEDULED" || machineId !== order.machine_id) {
          throw new Error("Pilih order yang sudah dijadwalkan pada mesinnya.");
        }
        const now = new Date().toISOString();
        orders[index] = {
          ...order,
          status: "IN_PROGRESS",
          operator_note: note,
          history: [
            ...(order.history ?? []),
            {
              status: "IN_PROGRESS",
              at: now,
              by: "operator.demo@maestro.local",
              note: note || "Produksi dimulai.",
            },
          ],
        };
      } else {
        if (order.status !== "IN_PROGRESS" || producedQuantity === undefined) {
          throw new Error("Order belum berjalan atau jumlah hasil belum diisi.");
        }
        if (producedQuantity < order.produced_quantity || producedQuantity > order.total_quantity) {
          throw new Error("Jumlah hasil produksi harus antara jumlah sebelumnya dan total order.");
        }
        if (action === "complete" && producedQuantity !== order.total_quantity) {
          throw new Error("Jumlah hasil harus sama dengan total order sebelum diselesaikan.");
        }
        const nextStatus =
          action === "complete" ? "COMPLETED" : "IN_PROGRESS";
        const now = new Date().toISOString();
        orders[index] = {
          ...order,
          status: nextStatus,
          produced_quantity: producedQuantity,
          operator_note: note,
          history: [
            ...(order.history ?? []),
            {
              status: nextStatus,
              at: now,
              by: "operator.demo@maestro.local",
              note: note || (action === "complete" ? "Produksi selesai." : "Progres diperbarui."),
            },
          ],
        };
      }
      saveLocalOrders(orders);
      return orders[index];
    }
    return requestJson<ProductionOrder>(
      `/production-orders/${encodeURIComponent(orderId)}/execution`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          machine_id: machineId,
          produced_quantity: producedQuantity,
          note,
        }),
      },
    );
  },
};
