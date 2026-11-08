import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useOutletContext } from "react-router-dom";
import { RefreshCw, Wrench } from "lucide-react";
import type { Machine } from "../types/machine";
import { apiDataProvider } from "../services/ApiDataProvider";
import { localDataProvider } from "../services/LocalDataProvider";
import {
  currentOrderRole,
} from "../services/ProductionOrders";
import {
  maintenanceWorkOrderService,
  type AssignableOperator,
  type MaintenanceWorkOrder,
  type MaintenanceWorkOrderDraft,
  type MaintenanceWorkOrderPriority,
  type MaintenanceWorkOrderStatus,
  type MaintenanceWorkOrderType,
  type WorkOrderExecution,
} from "../services/MaintenanceWorkOrders";

type LayoutContext = { mode: "STANDALONE" | "CONNECTED" };
type AlertWorkOrderContext = {
  alert?: {
    id: string;
    machine_id: string;
    message: string;
    severity: string;
  };
};

const statusLabels: Record<MaintenanceWorkOrderStatus, string> = {
  SUBMITTED: "Menunggu triage Manager",
  NEEDS_INFO: "Menunggu informasi pemohon",
  TRIAGED: "Disetujui · menunggu jadwal",
  SCHEDULED: "Terjadwal",
  IN_PROGRESS: "Sedang dikerjakan",
  ON_HOLD: "Ditahan",
  PENDING_VERIFICATION: "Menunggu verifikasi Manager",
  CLOSED: "Selesai dan ditutup",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

function localDateTimeValue(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Permintaan tidak dapat diproses.";
}

export const MaintenanceWorkOrders = () => {
  const role = currentOrderRole();
  const { mode } = useOutletContext<LayoutContext>();
  const localMode = mode === "STANDALONE";
  const location = useLocation();
  const alertContext = location.state as AlertWorkOrderContext | null;
  const alert = alertContext?.alert;

  const [orders, setOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<AssignableOperator[]>([]);
  const [machineId, setMachineId] = useState(alert?.machine_id ?? "");
  const [workType, setWorkType] = useState<MaintenanceWorkOrderType>("CORRECTIVE");
  const [title, setTitle] = useState(
    alert ? `Pemeriksaan alert ${alert.id}` : "",
  );
  const [description, setDescription] = useState(
    alert
      ? `Alert ${alert.id} (${alert.severity}): ${alert.message}`
      : "",
  );
  const [sourceAlertId, setSourceAlertId] = useState<string | null>(
    alert?.id ?? null,
  );
  const [priority, setPriority] = useState<MaintenanceWorkOrderPriority>(
    alert?.severity === "CRITICAL" ? "URGENT" : "NORMAL",
  );
  const [managerPriorities, setManagerPriorities] = useState<
    Record<string, MaintenanceWorkOrderPriority>
  >({});
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [executionNotes, setExecutionNotes] = useState<Record<string, string>>({});
  const [performed, setPerformed] = useState<Record<string, string>>({});
  const [parts, setParts] = useState<Record<string, string>>({});
  const [downtime, setDowntime] = useState<Record<string, string>>({});
  const [scheduleStart, setScheduleStart] = useState<Record<string, string>>({});
  const [scheduleEnd, setScheduleEnd] = useState<Record<string, string>>({});
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [defaultScheduleStart] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 30 * 60_000)),
  );
  const [defaultScheduleEnd] = useState(() =>
    localDateTimeValue(new Date(Date.now() + 90 * 60_000)),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [orderList, machineList] = await Promise.all([
        maintenanceWorkOrderService.list(localMode),
        localMode ? localDataProvider.getMachines() : apiDataProvider.getMachines(),
      ]);
      setOrders(orderList);
      setMachines(machineList);
      setMachineId((current) => current || machineList[0]?.id || "");
      if (role === "manager") {
        setOperators(await maintenanceWorkOrderService.listOperators(localMode));
      }
    } finally {
      setLoading(false);
    }
  }, [localMode, role]);

  useEffect(() => {
    void refresh()
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, [refresh]);

  if (role !== "manager" && role !== "operator") {
    return <Navigate to="/" replace />;
  }

  const runAction = async (
    action: () => Promise<MaintenanceWorkOrder>,
    message: string,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const submitNewOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft: MaintenanceWorkOrderDraft = {
      machine_id: machineId,
      work_type: workType,
      title: title.trim(),
      description: description.trim(),
      priority,
      source_alert_id: sourceAlertId,
    };
    void runAction(
      async () => {
        const order = await maintenanceWorkOrderService.create(draft, localMode);
        setTitle("");
        setDescription("");
        setSourceAlertId(null);
        return order;
      },
      "Maintenance Work Order berhasil diajukan.",
    );
  };

  const review = (
    order: MaintenanceWorkOrder,
    decision: "approve" | "request_info" | "reject",
  ) =>
    runAction(
      () =>
        maintenanceWorkOrderService.review(
          order.id,
          decision,
          managerPriorities[order.id] ?? order.priority,
          managerNotes[order.id] ?? "",
          localMode,
        ),
      "Hasil triage berhasil disimpan.",
    );

  const schedule = (order: MaintenanceWorkOrder) => {
    const start = scheduleStart[order.id] ?? defaultScheduleStart;
    const end = scheduleEnd[order.id] ?? defaultScheduleEnd;
    void runAction(
      () =>
        maintenanceWorkOrderService.schedule(
          order.id,
          {
            assigned_to_id: assignees[order.id] ?? operators[0]?.id ?? "",
            scheduled_start: new Date(start).toISOString(),
            scheduled_end: new Date(end).toISOString(),
            note: managerNotes[order.id] ?? "",
          },
          localMode,
        ),
      "Operator dan jadwal sudah ditetapkan.",
    );
  };

  const execute = (
    order: MaintenanceWorkOrder,
    action: WorkOrderExecution["action"],
  ) => {
    const payload: WorkOrderExecution = {
      action,
      note: executionNotes[order.id] ?? "",
      work_performed: performed[order.id] ?? "",
      parts_used: parts[order.id] ?? "",
      downtime_minutes:
        downtime[order.id] === undefined || downtime[order.id] === ""
          ? null
          : Number(downtime[order.id]),
    };
    void runAction(
      () => maintenanceWorkOrderService.execute(order.id, payload, localMode),
      action === "complete"
        ? "Pekerjaan diajukan untuk verifikasi Manager."
        : "Status dan catatan pekerjaan berhasil diperbarui.",
    );
  };

  return (
    <section className="space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="inline-block border-[3px] border-neo-black bg-neo-blue px-2 text-3xl text-white shadow-neo">
            Maintenance Work Orders
          </h2>
          <p className="mt-2 font-mono text-sm font-bold">
            Pengajuan perawatan mesin terpisah dari Production Order dan tidak
            menjalankan perintah mesin secara otomatis.
          </p>
        </div>
        <button
          className="neo-btn flex items-center gap-2"
          disabled={loading || busy}
          onClick={() =>
            void refresh().catch((requestError: unknown) =>
              setError(errorMessage(requestError)),
            )
          }
          type="button"
        >
          <RefreshCw size={15} /> MUAT ULANG
        </button>
      </header>

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

      <form className="neo-card space-y-4 bg-white p-5" onSubmit={submitNewOrder}>
        <div className="flex items-center gap-2">
          <Wrench size={20} />
          <h3 className="m-0 text-xl">Ajukan Maintenance Work Order</h3>
        </div>
        {sourceAlertId && alert && (
          <p className="border-2 border-neo-black bg-neo-yellow p-3 font-mono text-xs">
            Alert {sourceAlertId} menjadi konteks usulan saja. WO hanya dibuat setelah
            formulir ini diajukan.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <label className="font-mono text-xs font-bold">
            MESIN
            <select
              className="neo-input mt-1 w-full"
              onChange={(event) => setMachineId(event.target.value)}
              required
              value={machineId}
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.id} · {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-mono text-xs font-bold">
            JENIS PEKERJAAN
            <select
              className="neo-input mt-1 w-full"
              onChange={(event) =>
                setWorkType(event.target.value as MaintenanceWorkOrderType)
              }
              value={workType}
            >
              <option value="CORRECTIVE">Corrective</option>
              <option value="PREVENTIVE">Preventive</option>
              <option value="INSPECTION">Inspection</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="font-mono text-xs font-bold">
            JUDUL
            <input
              className="neo-input mt-1 w-full"
              maxLength={120}
              minLength={3}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label className="font-mono text-xs font-bold">
            PRIORITAS
            <select
              className="neo-input mt-1 w-full"
              onChange={(event) =>
                setPriority(event.target.value as MaintenanceWorkOrderPriority)
              }
              value={priority}
            >
              <option value="LOW">Rendah</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Tinggi</option>
              <option value="URGENT">Darurat</option>
            </select>
          </label>
        </div>
        <label className="block font-mono text-xs font-bold">
          GEJALA / DESKRIPSI
          <textarea
            className="neo-input mt-1 min-h-24 w-full"
            maxLength={3000}
            minLength={5}
            onChange={(event) => setDescription(event.target.value)}
            required
            value={description}
          />
        </label>
        <button
          className="neo-btn !bg-neo-blue !text-white"
          disabled={busy || loading || machines.length === 0}
          type="submit"
        >
          AJUKAN WO
        </button>
      </form>

      <div>
        <h3 className="mb-3 text-xl">
          {role === "manager" ? "Daftar Maintenance WO" : "WO Saya"}
        </h3>
        {loading && (
          <div className="neo-card bg-white p-5 font-mono text-sm">
            Memuat Maintenance WO...
          </div>
        )}
        {!loading && orders.length === 0 && (
          <div className="neo-card bg-white p-5 font-mono text-sm text-neo-muted">
            Belum ada Maintenance Work Order.
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          {orders.map((order) => {
            const note = managerNotes[order.id] ?? "";
            const executionNote = executionNotes[order.id] ?? "";
            return (
              <article className="neo-card space-y-4 bg-white p-5" key={order.id}>
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 font-mono text-xs text-neo-muted">
                      {order.id} · {order.machine_id} · {order.work_type}
                    </p>
                    <h4 className="mb-1 mt-1 text-xl">{order.title}</h4>
                    <p className="m-0 font-mono text-xs text-neo-muted">
                      Diajukan {order.requested_by_name} ·{" "}
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="neo-badge neo-badge-info">
                    {statusLabels[order.status]}
                  </span>
                </header>
                <p className="m-0 whitespace-pre-wrap font-mono text-sm">
                  {order.description}
                </p>
                <dl className="grid grid-cols-2 gap-3 border-y-2 border-neo-silver py-3 font-mono text-xs">
                  <div>
                    <dt className="text-neo-muted">PRIORITAS</dt>
                    <dd className="m-0 font-bold">{order.priority}</dd>
                  </div>
                  <div>
                    <dt className="text-neo-muted">OPERATOR</dt>
                    <dd className="m-0 font-bold">
                      {order.assigned_to_name ?? "Belum ditugaskan"}
                    </dd>
                  </div>
                  {order.scheduled_start && (
                    <div className="col-span-2">
                      <dt className="text-neo-muted">JADWAL</dt>
                      <dd className="m-0 font-bold">
                        {new Date(order.scheduled_start).toLocaleString()} –{" "}
                        {order.scheduled_end
                          ? new Date(order.scheduled_end).toLocaleString()
                          : ""}
                      </dd>
                    </div>
                  )}
                  {order.source_alert_id && (
                    <div className="col-span-2">
                      <dt className="text-neo-muted">SUMBER</dt>
                      <dd className="m-0 font-bold">Alert {order.source_alert_id}</dd>
                    </div>
                  )}
                </dl>

                {role === "manager" &&
                  ["SUBMITTED", "NEEDS_INFO"].includes(order.status) && (
                    <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                      <label className="block font-mono text-xs font-bold">
                        PRIORITAS HASIL TRIAGE
                        <select
                          className="neo-input mt-1 w-full"
                          onChange={(event) =>
                            setManagerPriorities({
                              ...managerPriorities,
                              [order.id]: event.target
                                .value as MaintenanceWorkOrderPriority,
                            })
                          }
                          value={managerPriorities[order.id] ?? order.priority}
                        >
                          <option value="LOW">Rendah</option>
                          <option value="NORMAL">Normal</option>
                          <option value="HIGH">Tinggi</option>
                          <option value="URGENT">Darurat</option>
                        </select>
                      </label>
                      <label className="block font-mono text-xs font-bold">
                        CATATAN REVIEW
                        <textarea
                          className="neo-input mt-1 min-h-16 w-full"
                          onChange={(event) =>
                            setManagerNotes({
                              ...managerNotes,
                              [order.id]: event.target.value,
                            })
                          }
                          value={note}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="neo-btn !bg-green-200"
                          disabled={busy}
                          onClick={() => void review(order, "approve")}
                          type="button"
                        >
                          SETUJUI UNTUK DIJADWALKAN
                        </button>
                        <button
                          className="neo-btn !bg-neo-yellow"
                          disabled={busy || !note.trim()}
                          onClick={() => void review(order, "request_info")}
                          type="button"
                        >
                          MINTA INFORMASI
                        </button>
                        <button
                          className="neo-btn !bg-red-200"
                          disabled={busy || !note.trim()}
                          onClick={() => void review(order, "reject")}
                          type="button"
                        >
                          TOLAK
                        </button>
                      </div>
                    </div>
                  )}

                {role === "manager" && order.status === "TRIAGED" && (
                  <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                    <label className="block font-mono text-xs font-bold">
                      OPERATOR
                      <select
                        className="neo-input mt-1 w-full"
                        onChange={(event) =>
                          setAssignees({
                            ...assignees,
                            [order.id]: event.target.value,
                          })
                        }
                        value={assignees[order.id] ?? operators[0]?.id ?? ""}
                      >
                        {operators.map((operator) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.name} · {operator.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="font-mono text-xs font-bold">
                        MULAI
                        <input
                          className="neo-input mt-1 w-full"
                          onChange={(event) =>
                            setScheduleStart({
                              ...scheduleStart,
                              [order.id]: event.target.value,
                            })
                          }
                          type="datetime-local"
                          value={
                            scheduleStart[order.id] ?? defaultScheduleStart
                          }
                        />
                      </label>
                      <label className="font-mono text-xs font-bold">
                        SELESAI
                        <input
                          className="neo-input mt-1 w-full"
                          onChange={(event) =>
                            setScheduleEnd({
                              ...scheduleEnd,
                              [order.id]: event.target.value,
                            })
                          }
                          type="datetime-local"
                          value={
                            scheduleEnd[order.id] ?? defaultScheduleEnd
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="neo-btn !bg-neo-blue !text-white"
                      disabled={busy || operators.length === 0}
                      onClick={() => schedule(order)}
                      type="button"
                    >
                      TETAPKAN OPERATOR & JADWAL
                    </button>
                  </div>
                )}

                {role === "operator" && order.status === "NEEDS_INFO" && (
                  <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                    <label className="block font-mono text-xs font-bold">
                      JAWAB PERMINTAAN INFORMASI
                      <textarea
                        className="neo-input mt-1 min-h-16 w-full"
                        onChange={(event) =>
                          setExecutionNotes({
                            ...executionNotes,
                            [order.id]: event.target.value,
                          })
                        }
                        value={executionNote}
                      />
                    </label>
                    <button
                      className="neo-btn"
                      disabled={busy || !executionNote.trim()}
                      onClick={() =>
                        void runAction(
                          () =>
                            maintenanceWorkOrderService.provideInformation(
                              order.id,
                              executionNote,
                              localMode,
                            ),
                          "Informasi tambahan berhasil dikirim.",
                        )
                      }
                      type="button"
                    >
                      KIRIM INFORMASI
                    </button>
                  </div>
                )}

                {role === "operator" &&
                  (order.status === "SCHEDULED" ||
                    order.status === "IN_PROGRESS" ||
                    order.status === "ON_HOLD") && (
                    <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                      {order.status === "SCHEDULED" ? (
                        <button
                          className="neo-btn !bg-neo-blue !text-white"
                          disabled={busy}
                          onClick={() => execute(order, "start")}
                          type="button"
                        >
                          MULAI PEKERJAAN
                        </button>
                      ) : (
                        <>
                          <label className="block font-mono text-xs font-bold">
                            CATATAN / ALASAN
                            <textarea
                              className="neo-input mt-1 min-h-16 w-full"
                              onChange={(event) =>
                                setExecutionNotes({
                                  ...executionNotes,
                                  [order.id]: event.target.value,
                                })
                              }
                              value={executionNote}
                            />
                          </label>
                          {order.status === "IN_PROGRESS" && (
                            <>
                              <label className="block font-mono text-xs font-bold">
                                PEKERJAAN YANG DILAKUKAN
                                <textarea
                                  className="neo-input mt-1 min-h-16 w-full"
                                  onChange={(event) =>
                                    setPerformed({
                                      ...performed,
                                      [order.id]: event.target.value,
                                    })
                                  }
                                  value={performed[order.id] ?? order.work_performed}
                                />
                              </label>
                              <div className="grid gap-2 md:grid-cols-2">
                                <label className="font-mono text-xs font-bold">
                                  SUKU CADANG
                                  <input
                                    className="neo-input mt-1 w-full"
                                    onChange={(event) =>
                                      setParts({
                                        ...parts,
                                        [order.id]: event.target.value,
                                      })
                                    }
                                    value={parts[order.id] ?? order.parts_used}
                                  />
                                </label>
                                <label className="font-mono text-xs font-bold">
                                  DOWNTIME (MENIT)
                                  <input
                                    className="neo-input mt-1 w-full"
                                    min={0}
                                    onChange={(event) =>
                                      setDowntime({
                                        ...downtime,
                                        [order.id]: event.target.value,
                                      })
                                    }
                                    type="number"
                                    value={
                                      downtime[order.id] ??
                                      (order.downtime_minutes === null
                                        ? ""
                                        : String(order.downtime_minutes))
                                    }
                                  />
                                </label>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="neo-btn"
                                  disabled={busy}
                                  onClick={() => execute(order, "update")}
                                  type="button"
                                >
                                  SIMPAN PROGRES
                                </button>
                                <button
                                  className="neo-btn !bg-neo-yellow"
                                  disabled={busy || !executionNote.trim()}
                                  onClick={() => execute(order, "hold")}
                                  type="button"
                                >
                                  TAHAN PEKERJAAN
                                </button>
                                <button
                                  className="neo-btn !bg-green-200"
                                  disabled={busy || !(performed[order.id] ?? order.work_performed).trim()}
                                  onClick={() => execute(order, "complete")}
                                  type="button"
                                >
                                  AJUKAN VERIFIKASI
                                </button>
                              </div>
                            </>
                          )}
                          {order.status === "ON_HOLD" && (
                            <button
                              className="neo-btn !bg-neo-blue !text-white"
                              disabled={busy}
                              onClick={() => execute(order, "resume")}
                              type="button"
                            >
                              LANJUTKAN PEKERJAAN
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                {role === "manager" && order.status === "PENDING_VERIFICATION" && (
                  <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                    <p className="font-mono text-sm">
                      <strong>Tindakan:</strong> {order.work_performed || "—"}
                      <br />
                      <strong>Suku cadang:</strong> {order.parts_used || "—"}
                      <br />
                      <strong>Downtime:</strong>{" "}
                      {order.downtime_minutes ?? "—"} menit
                    </p>
                    <label className="block font-mono text-xs font-bold">
                      CATATAN VERIFIKASI
                      <textarea
                        className="neo-input mt-1 min-h-16 w-full"
                        onChange={(event) =>
                          setManagerNotes({
                            ...managerNotes,
                            [order.id]: event.target.value,
                          })
                        }
                        value={note}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        className="neo-btn !bg-green-200"
                        disabled={busy || note.trim().length < 3}
                        onClick={() =>
                          void runAction(
                            () =>
                              maintenanceWorkOrderService.verify(
                                order.id,
                                "close",
                                note,
                                localMode,
                              ),
                            "Pekerjaan telah diverifikasi dan ditutup.",
                          )
                        }
                        type="button"
                      >
                        VERIFIKASI & TUTUP
                      </button>
                      <button
                        className="neo-btn !bg-neo-yellow"
                        disabled={busy || note.trim().length < 3}
                        onClick={() =>
                          void runAction(
                            () =>
                              maintenanceWorkOrderService.verify(
                                order.id,
                                "reopen",
                                note,
                                localMode,
                              ),
                            "WO dikembalikan ke triage untuk dikerjakan ulang.",
                          )
                        }
                        type="button"
                      >
                        KEMBALIKAN KE TRIAGE
                      </button>
                    </div>
                  </div>
                )}

                {role === "manager" &&
                  [
                    "SUBMITTED",
                    "NEEDS_INFO",
                    "TRIAGED",
                    "SCHEDULED",
                    "ON_HOLD",
                  ].includes(order.status) && (
                    <div className="space-y-2 border-t-2 border-neo-silver pt-3">
                      <label className="block font-mono text-xs font-bold">
                        ALASAN PEMBATALAN
                        <input
                          className="neo-input mt-1 w-full"
                          maxLength={1000}
                          minLength={3}
                          onChange={(event) =>
                            setManagerNotes({
                              ...managerNotes,
                              [order.id]: event.target.value,
                            })
                          }
                          value={note}
                        />
                      </label>
                      <button
                        className="neo-btn !bg-red-200"
                        disabled={busy || note.trim().length < 3}
                        onClick={() =>
                          void runAction(
                            () =>
                              maintenanceWorkOrderService.cancel(
                                order.id,
                                note,
                                localMode,
                              ),
                            "Maintenance WO dibatalkan.",
                          )
                        }
                        type="button"
                      >
                        BATALKAN WO
                      </button>
                    </div>
                  )}

                {order.history.length > 0 && (
                  <details className="border-t-2 border-neo-silver pt-2">
                    <summary className="cursor-pointer font-mono text-xs font-bold">
                      RIWAYAT ({order.history.length})
                    </summary>
                    <ol className="mt-2 space-y-2 pl-5 font-mono text-xs">
                      {order.history
                        .slice()
                        .reverse()
                        .map((entry, index) => (
                          <li key={`${entry.at}-${index}`}>
                            <strong>{entry.status.replaceAll("_", " ")}</strong> ·{" "}
                            {entry.by_name} · {new Date(entry.at).toLocaleString()}
                            {entry.note ? ` — ${entry.note}` : ""}
                          </li>
                        ))}
                    </ol>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
};
