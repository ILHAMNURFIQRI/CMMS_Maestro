import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, CircleAlert, Play, RefreshCw, X } from "lucide-react";
import {
  currentOrderRole,
  productionOrderService,
  type OrderSchedule,
  type ProductionOrder,
} from "../services/ProductionOrders";

function localDateTimeValue(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function estimatedScheduleEnd(start: string, durationHours: number): string {
  const startTime = new Date(start).getTime();
  if (!Number.isFinite(startTime)) return "";
  return localDateTimeValue(
    new Date(startTime + Math.max(durationHours, 1) * 60 * 60_000),
  );
}

const statusLabels: Record<ProductionOrder["status"], string> = {
  DRAFT: "Draft Customer",
  SUBMITTED: "Menunggu validasi Manager",
  REVISION_REQUESTED: "Menunggu revisi Customer",
  REJECTED: "Ditolak",
  APPROVED: "Disetujui — menunggu penjadwalan",
  SCHEDULED: "Terjadwal — menunggu Operator",
  IN_PROGRESS: "Sedang berjalan",
  COMPLETED: "Selesai",
};

export const ProductionOrders = () => {
  const role = currentOrderRole();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [produced, setProduced] = useState<Record<string, number>>({});
  const [scheduleStart, setScheduleStart] = useState<Record<string, string>>({});
  const [scheduleEnd, setScheduleEnd] = useState<Record<string, string>>({});
  const [scheduleStartDefault] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 5 * 60_000)),
  );
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const result = await productionOrderService.getOrders();
    setOrders(result);
    setProduced((previous) => {
      const next = { ...previous };
      for (const order of result) {
        next[order.id] ??= order.produced_quantity;
      }
      return next;
    });
  };

  useEffect(() => {
    void refresh()
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Permintaan tidak dapat dimuat.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  if (role !== "manager" && role !== "operator") {
    return <Navigate to="/" replace />;
  }

  const runAction = async (
    orderId: string,
    action: () => Promise<ProductionOrder>,
    successMessage: string,
  ) => {
    setBusyOrder(orderId);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Aksi tidak dapat disimpan.",
      );
    } finally {
      setBusyOrder(null);
    }
  };

  return (
    <section className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="inline-block border-[3px] border-neo-black bg-neo-blue px-2 text-3xl text-white shadow-neo">
            {role === "manager" ? "Validasi Permintaan" : "Order Produksi"}
          </h2>
          <p className="mt-2 font-mono text-sm font-bold">
            {role === "manager"
              ? "Validasi permintaan Customer, lalu tetapkan jadwal M-16 sebelum diteruskan ke Operator."
              : "Jalankan order terjadwal dan catat progres produksi."}
          </p>
        </div>
        <button
          className="neo-btn flex items-center gap-2"
          disabled={loading}
          onClick={() =>
            void refresh().catch((requestError: unknown) =>
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "Gagal memuat ulang.",
              ),
            )
          }
          type="button"
        >
          <RefreshCw size={15} /> MUAT ULANG
        </button>
      </header>

      {role === "manager" && (
        <p className="border-2 border-neo-black bg-neo-yellow p-3 font-mono text-xs leading-5">
          Estimasi pada order adalah aturan kapasitas demo, bukan hasil AI.
          Keputusan menyetujui tetap dilakukan Manager.
        </p>
      )}
      {error && (
        <p className="border-2 border-neo-black bg-red-100 p-3 font-mono text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p className="border-2 border-neo-black bg-green-100 p-3 font-mono text-sm text-green-900">
          {notice}
        </p>
      )}

      {loading && (
        <div className="neo-card bg-white p-5 font-mono text-sm">
          Memuat Production Order...
        </div>
      )}
      {!loading && orders.length === 0 && (
        <div className="neo-card bg-white p-5 font-mono text-sm text-neo-muted">
          Belum ada permintaan produksi.
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {orders.map((order) => {
          const isBusy = busyOrder === order.id;
          const selectedStart = scheduleStart[order.id] ?? scheduleStartDefault;
          const selectedEnd =
            scheduleEnd[order.id] ??
            estimatedScheduleEnd(selectedStart, order.estimated_hours);
          return (
            <article className="neo-card bg-white p-5" key={order.id}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="m-0 font-mono text-xs text-neo-muted">
                    {order.id}
                    {role === "manager" && order.customer_name
                      ? ` · ${order.customer_name}`
                      : ""}
                  </p>
                  <h3 className="mb-1 mt-1 text-xl">{statusLabels[order.status]}</h3>
                </div>
                <span
                  className={`neo-badge ${order.status === "COMPLETED" ? "neo-badge-success" : order.status === "REJECTED" ? "neo-badge-critical" : order.status === "SUBMITTED" || order.status === "REVISION_REQUESTED" ? "neo-badge-warning" : "neo-badge-info"}`}
                >
                  {order.status.replaceAll("_", " ")}
                </span>
              </header>

              <div className="my-4 space-y-1 border-y-2 border-neo-silver py-3">
                {order.items.map((item, index) => (
                  <div key={`${item.product_id}-${index}`}>
                    <p className="m-0 font-mono text-sm">
                      {item.product_id} · {item.product_name} —{" "}
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                    </p>
                    {role === "manager" && (
                      <p className="m-0 font-mono text-xs text-neo-muted">
                        Barang jadi saat pengajuan:{" "}
                        {item.finished_goods_on_hand_at_request ??
                          "tidak tersedia"}{" "}
                        {item.unit}; bahan baku:{" "}
                        {item.raw_material_availability === "NOT_ASSESSED"
                          ? "belum diperiksa"
                          : item.raw_material_availability}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div>
                  <dt className="text-neo-muted">TARGET</dt>
                  <dd className="m-0 font-bold">
                    {new Date(order.target_at).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-neo-muted">KAPASITAS DEMO</dt>
                  <dd
                    className={`m-0 font-bold ${order.estimate_is_feasible ? "text-green-800" : "text-red-700"}`}
                  >
                    {order.estimated_hours} jam ·{" "}
                    {order.estimate_is_feasible ? "Target cukup" : "Target berisiko"}
                  </dd>
                </div>
                {order.machine_id && (
                  <div>
                    <dt className="text-neo-muted">MESIN</dt>
                    <dd className="m-0 font-bold">{order.machine_id}</dd>
                  </div>
                )}
                {order.scheduled_start && order.scheduled_end && (
                  <div className="col-span-2">
                    <dt className="text-neo-muted">JADWAL PRODUKSI</dt>
                    <dd className="m-0 font-bold">
                      {new Date(order.scheduled_start).toLocaleString()} —{" "}
                      {new Date(order.scheduled_end).toLocaleString()}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-neo-muted">PROGRES</dt>
                  <dd className="m-0 font-bold">
                    {order.produced_quantity} / {order.total_quantity}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 font-mono text-xs leading-5">
                {order.estimate_summary}
              </p>
              {order.notes && (
                <p className="border-2 border-neo-black bg-neo-bg p-3 font-mono text-xs">
                  <strong>CATATAN CUSTOMER:</strong> {order.notes}
                </p>
              )}
              {order.manager_note && (
                <p className="border-2 border-neo-black bg-neo-silver p-3 font-mono text-xs">
                  <strong>CATATAN MANAGER:</strong> {order.manager_note}
                </p>
              )}
              {(order.history ?? []).length > 0 && (
                <details className="mt-3 font-mono text-xs">
                  <summary className="cursor-pointer font-bold">
                    RIWAYAT STATUS ({order.history.length})
                  </summary>
                  <ol className="mt-2 space-y-1">
                    {order.history.map((entry, index) => (
                      <li key={`${entry.status}-${entry.at}-${index}`}>
                        {new Date(entry.at).toLocaleString()} · {entry.status.replaceAll("_", " ")}
                        {entry.note ? ` — ${entry.note}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {role === "manager" && order.status === "SUBMITTED" && (
                <div className="mt-4 space-y-3 border-t-2 border-neo-black pt-4">
                  <label className="block font-mono text-xs font-bold">
                    CATATAN KEPUTUSAN (WAJIB UNTUK REVISI/PENOLAKAN)
                    <textarea
                      className="mt-1 w-full border-2 border-neo-black p-2 font-sans text-sm"
                      maxLength={1000}
                      rows={2}
                      value={notes[order.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="neo-btn neo-btn-primary flex items-center gap-2"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(
                          order.id,
                          () =>
                            productionOrderService.reviewOrder(
                              order.id,
                              "approve",
                              notes[order.id] ?? "",
                            ),
                          "Permintaan disetujui. Tetapkan jadwal M-16 agar dapat dijalankan Operator.",
                        )
                      }
                      type="button"
                    >
                      <Check size={15} /> SETUJUI
                    </button>
                    <button
                      className="neo-btn neo-btn-warning flex items-center gap-2"
                      disabled={isBusy || !(notes[order.id] ?? "").trim()}
                      onClick={() =>
                        void runAction(
                          order.id,
                          () =>
                            productionOrderService.reviewOrder(
                              order.id,
                              "request_revision",
                              notes[order.id] ?? "",
                            ),
                          "Permintaan revisi dikirim kepada Customer.",
                        )
                      }
                      type="button"
                    >
                      <CircleAlert size={15} /> MINTA REVISI
                    </button>
                    <button
                      className="neo-btn neo-btn-critical flex items-center gap-2"
                      disabled={isBusy || !(notes[order.id] ?? "").trim()}
                      onClick={() =>
                        void runAction(
                          order.id,
                          () =>
                            productionOrderService.reviewOrder(
                              order.id,
                              "reject",
                              notes[order.id] ?? "",
                            ),
                          "Permintaan ditolak.",
                        )
                      }
                      type="button"
                    >
                      <X size={15} /> TOLAK
                    </button>
                  </div>
                </div>
              )}

              {role === "manager" && order.status === "APPROVED" && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t-2 border-neo-black pt-4">
                  <label className="font-mono text-xs font-bold">
                    MESIN
                    <input
                      className="mt-1 block border-2 border-neo-black bg-neo-silver p-2 font-sans text-sm"
                      readOnly
                      value="M-16 · CONVEYOR-01"
                    />
                  </label>
                  <label className="font-mono text-xs font-bold">
                    MULAI
                    <input
                      className="mt-1 block border-2 border-neo-black p-2 font-sans text-sm"
                      type="datetime-local"
                      min={scheduleStartDefault}
                      required
                      value={selectedStart}
                      onChange={(event) =>
                        setScheduleStart((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="font-mono text-xs font-bold">
                    SELESAI
                    <input
                      className="mt-1 block border-2 border-neo-black p-2 font-sans text-sm"
                      type="datetime-local"
                      min={scheduleStart[order.id] ?? scheduleStartDefault}
                      required
                      value={selectedEnd}
                      onChange={(event) =>
                        setScheduleEnd((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="neo-btn neo-btn-primary"
                    disabled={isBusy}
                    onClick={() => {
                      const startDate = new Date(selectedStart);
                      const endDate = new Date(selectedEnd);
                      if (
                        !Number.isFinite(startDate.getTime()) ||
                        !Number.isFinite(endDate.getTime()) ||
                        startDate <= new Date() ||
                        endDate <= startDate
                      ) {
                        setError("Periksa kembali waktu mulai dan selesai.");
                        return;
                      }
                      if (endDate > new Date(order.target_at)) {
                        setError("Jadwal selesai tidak boleh melewati target Customer.");
                        return;
                      }
                      const schedule: OrderSchedule = {
                        machine_id: "M-16",
                        scheduled_start: startDate.toISOString(),
                        scheduled_end: endDate.toISOString(),
                        note: notes[order.id] ?? "",
                      };
                      void runAction(
                        order.id,
                        () =>
                          productionOrderService.scheduleOrder(order.id, schedule),
                        "Jadwal M-16 berhasil ditetapkan.",
                      );
                    }}
                    type="button"
                  >
                    JADWALKAN DI M-16
                  </button>
                </div>
              )}

              {role === "operator" && order.status === "SCHEDULED" && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t-2 border-neo-black pt-4">
                  <button
                    className="neo-btn neo-btn-primary flex items-center gap-2"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(
                        order.id,
                        () =>
                          productionOrderService.updateExecution(
                            order.id,
                            "start",
                            order.machine_id ?? "M-16",
                          ),
                        "Produksi dimulai.",
                      )
                    }
                    type="button"
                  >
                    <Play size={15} /> MULAI PRODUKSI
                  </button>
                </div>
              )}

              {role === "operator" && order.status === "IN_PROGRESS" && (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t-2 border-neo-black pt-4">
                  <label className="font-mono text-xs font-bold">
                    JUMLAH SELESAI
                    <input
                      className="mt-1 block w-36 border-2 border-neo-black p-2 font-sans text-sm"
                      type="number"
                      min={order.produced_quantity}
                      max={order.total_quantity}
                      value={produced[order.id] ?? order.produced_quantity}
                      onChange={(event) =>
                        setProduced((current) => ({
                          ...current,
                          [order.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <button
                    className="neo-btn"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(
                        order.id,
                        () =>
                          productionOrderService.updateExecution(
                            order.id,
                            "update",
                            undefined,
                            produced[order.id] ?? order.produced_quantity,
                            notes[order.id] ?? "",
                          ),
                        "Progres produksi berhasil diperbarui.",
                      )
                    }
                    type="button"
                  >
                    UPDATE PROGRES
                  </button>
                  <button
                    className="neo-btn neo-btn-primary"
                    disabled={
                      isBusy ||
                      (produced[order.id] ?? order.produced_quantity) !==
                        order.total_quantity
                    }
                    onClick={() =>
                      void runAction(
                        order.id,
                        () =>
                          productionOrderService.updateExecution(
                            order.id,
                            "complete",
                            undefined,
                            produced[order.id] ?? order.produced_quantity,
                            notes[order.id] ?? "",
                          ),
                        "Production Order ditandai selesai.",
                      )
                    }
                    type="button"
                  >
                    SELESAIKAN
                  </button>
                  <label className="w-full font-mono text-xs font-bold">
                    CATATAN OPERATOR
                    <input
                      className="mt-1 block w-full border-2 border-neo-black p-2 font-sans text-sm"
                      maxLength={1000}
                      value={notes[order.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [order.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
