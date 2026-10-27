import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { apiDataProvider } from "../services/ApiDataProvider";
import type {
  MachineCondition,
  MachinePrediction as MachinePredictionResult,
  PredictionHistoryItem,
  SensorReadingInput,
} from "../services/ApiDataProvider";
import type { Machine } from "../types/machine";

type SensorFormValues = Record<keyof Omit<SensorReadingInput, "machine_id">, string>;

const EMPTY_SENSORS: SensorFormValues = {
  current: "",
  temperature: "",
  rpm: "",
  vibration: "",
};

const SENSOR_FIELDS: Array<{
  key: keyof SensorFormValues;
  label: string;
  unit: string;
  step: string;
}> = [
  { key: "current", label: "Arus", unit: "A", step: "0.01" },
  { key: "temperature", label: "Suhu", unit: "°C", step: "0.1" },
  { key: "rpm", label: "RPM", unit: "RPM", step: "1" },
  { key: "vibration", label: "Getaran", unit: "mm/s", step: "0.01" },
];

const STATUS_STYLE: Record<
  MachineCondition,
  { label: string; className: string }
> = {
  NORMAL: {
    label: "NORMAL",
    className: "bg-status-success text-neo-black",
  },
  WARNING: {
    label: "WARNING",
    className: "bg-status-warning text-neo-black",
  },
  CRITICAL: {
    label: "CRITICAL",
    className: "bg-status-critical text-white",
  },
};

const FOLLOW_UP: Record<
  MachineCondition,
  { title: string; summary: string; actions: string[] }
> = {
  NORMAL: {
    title: "Lanjutkan pemantauan rutin",
    summary:
      "Klasifikasi akhir menunjukkan kondisi NORMAL. Ini bukan jaminan bahwa mesin bebas dari kerusakan.",
    actions: [
      "Catat hasil ini sebagai baseline dan lanjutkan inspeksi sesuai SOP.",
      "Bandingkan pembacaan berikutnya untuk melihat perubahan pola sensor.",
    ],
  },
  WARNING: {
    title: "Perlu pemeriksaan terjadwal",
    summary:
      "Klasifikasi akhir menunjukkan kondisi WARNING. Periksa pembacaan dan tren sebelum menentukan tindakan.",
    actions: [
      "Ulangi pengukuran untuk memastikan nilai sensor konsisten.",
      "Jadwalkan inspeksi teknisi dan tinjau histori maintenance mesin.",
    ],
  },
  CRITICAL: {
    title: "Prioritas pemeriksaan segera",
    summary:
      "Klasifikasi akhir menunjukkan kondisi CRITICAL. Ikuti prosedur keselamatan dan eskalasi ke teknisi yang bertanggung jawab.",
    actions: [
      "Validasi sensor dan lakukan pemeriksaan sesuai SOP keselamatan lokasi.",
      "Tentukan apakah mesin perlu dihentikan berdasarkan prosedur dan penilaian teknisi.",
    ],
  },
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

export const MachinePrediction = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState("");
  const [sensors, setSensors] = useState<SensorFormValues>(EMPTY_SENSORS);
  const [prediction, setPrediction] = useState<MachinePredictionResult | null>(
    null,
  );
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyRequestId = useRef(0);

  const loadHistory = async (selectedMachineId: string) => {
    const requestId = ++historyRequestId.current;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const items =
        await apiDataProvider.getMachinePredictions(selectedMachineId);
      if (requestId === historyRequestId.current) setHistory(items);
    } catch (loadError) {
      if (requestId === historyRequestId.current) {
        setHistoryError(
          loadError instanceof Error
            ? loadError.message
            : "Histori prediksi tidak dapat dimuat.",
        );
      }
    } finally {
      if (requestId === historyRequestId.current) setLoadingHistory(false);
    }
  };

  useEffect(() => {
    let active = true;

    apiDataProvider
      .getMachines()
      .then((items) => {
        if (!active) return;
        setMachines(items);
        setMachineId(
          items.find((machine) => machine.id === "M-16")?.id ??
            items[0]?.id ??
            "",
        );
        const firstMachine =
          items.find((machine) => machine.id === "M-16") ?? items[0];
        if (firstMachine) void loadHistory(firstMachine.id);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Daftar mesin tidak dapat dimuat.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingMachines(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const reading: SensorReadingInput = {
      machine_id: machineId,
      current: Number(sensors.current),
      temperature: Number(sensors.temperature),
      rpm: Number(sensors.rpm),
      vibration: Number(sensors.vibration),
    };

    try {
      const result = await apiDataProvider.predictMachineCondition(reading);
      setPrediction(result);
      await loadHistory(machineId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Prediksi gagal dijalankan. Periksa koneksi backend.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMachine = machines.find((machine) => machine.id === machineId);
  const historyCounts = history.reduce(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    { NORMAL: 0, WARNING: 0, CRITICAL: 0 },
  );
  const highRiskCount = historyCounts.WARNING + historyCounts.CRITICAL;
  const highRiskRate = history.length
    ? Math.round((highRiskCount / history.length) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h2 className="inline-block border-[3px] border-neo-black bg-neo-blue px-2 text-3xl uppercase tracking-widest text-white shadow-neo">
          AI Machine Prediction
        </h2>
        <p className="mt-2 inline-block border-2 border-neo-black bg-neo-silver px-1 font-mono text-sm font-bold text-neo-black">
          MANUAL SENSOR INPUT & PREDICTIVE CONDITION ANALYSIS
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border-[3px] border-neo-black bg-neo-yellow px-4 py-3 font-mono font-bold shadow-neo"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
        <section className="neo-card bg-white p-6 xl:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="border-2 border-neo-black bg-neo-cyan p-2 shadow-neo-sm">
              <BrainCircuit size={22} />
            </div>
            <div>
              <h3 className="font-black uppercase">Sensor reading</h3>
              <p className="font-mono text-xs text-neo-muted">
                Isi nilai empat sensor untuk memprediksi kondisi mesin.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block font-mono text-xs font-black uppercase">
                Mesin
              </span>
              <select
                required
                value={machineId}
                disabled={loadingMachines || machines.length === 0 || submitting}
                onChange={(event) => {
                  const selected = event.target.value;
                  setMachineId(selected);
                  setPrediction(null);
                  if (selected) void loadHistory(selected);
                }}
                className="w-full border-[3px] border-neo-black bg-white px-3 py-2 font-bold shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-blue"
              >
                {loadingMachines && <option value="">Memuat mesin...</option>}
                {!loadingMachines && machines.length === 0 && (
                  <option value="">Tidak ada mesin tersedia</option>
                )}
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.id} — {machine.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SENSOR_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1 block font-mono text-xs font-black uppercase">
                    {field.label}{" "}
                    <span className="text-neo-muted">({field.unit})</span>
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step={field.step}
                    inputMode="decimal"
                    value={sensors[field.key]}
                    onChange={(event) =>
                      setSensors((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className="w-full border-[3px] border-neo-black bg-neo-bg px-3 py-2 font-mono font-bold shadow-neo-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-neo-blue"
                    placeholder="Masukkan nilai"
                  />
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={
                loadingMachines ||
                submitting ||
                !machineId ||
                machines.length === 0
              }
              className="flex w-full items-center justify-center gap-2 border-[3px] border-neo-black bg-neo-blue px-4 py-3 font-mono font-black text-white shadow-neo transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
              {submitting ? "MENGANALISIS..." : "PREDIKSI KONDISI MESIN"}
            </button>
          </form>

          <p className="mt-4 border-l-4 border-neo-cyan pl-3 font-mono text-xs text-neo-muted">
            Hasil prediksi beserta pembacaan sensor akan disimpan ke MongoDB.
          </p>
        </section>

        <section className="space-y-6 xl:col-span-3">
          {prediction ? (
            <PredictionResultCard prediction={prediction} />
          ) : (
            <div className="neo-card flex min-h-56 flex-col items-center justify-center bg-neo-silver p-8 text-center">
              <BrainCircuit className="mb-3 text-neo-muted" size={40} />
              <h3 className="font-black uppercase">Belum ada hasil prediksi</h3>
              <p className="mt-2 max-w-md font-mono text-sm text-neo-muted">
                Masukkan data sensor dan jalankan prediksi untuk melihat
                klasifikasi kondisi mesin.
              </p>
            </div>
          )}

          <section className="neo-card bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black uppercase">Prediction history</h3>
                <p className="font-mono text-xs text-neo-muted">
                  {selectedMachine
                    ? `${selectedMachine.id} — ${selectedMachine.name}`
                    : "Pilih mesin untuk melihat histori"}
                </p>
              </div>
              <button
                type="button"
                disabled={!machineId || loadingHistory}
                onClick={() => void loadHistory(machineId)}
                className="flex items-center gap-2 border-2 border-neo-black bg-neo-cyan px-3 py-2 font-mono text-xs font-black shadow-neo-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingHistory ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <RefreshCw size={15} />
                )}
                REFRESH
              </button>
            </div>

            {!loadingHistory && history.length > 0 && (
              <HistoryInsights
                counts={historyCounts}
                highRiskCount={highRiskCount}
                highRiskRate={highRiskRate}
                items={history}
              />
            )}

            {historyError && (
              <p role="alert" className="mb-3 font-mono text-sm font-bold text-red-700">
                {historyError}
              </p>
            )}

            {loadingHistory ? (
              <div className="flex items-center justify-center gap-2 py-10 font-mono text-sm font-bold">
                <LoaderCircle className="animate-spin" size={18} />
                Memuat histori...
              </div>
            ) : history.length === 0 ? (
              <div className="border-2 border-dashed border-neo-black/30 px-4 py-8 text-center font-mono text-sm text-neo-muted">
                Belum ada histori prediksi untuk mesin ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b-[3px] border-neo-black bg-neo-silver font-mono text-xs uppercase">
                      <th className="px-3 py-2">Waktu</th>
                      <th className="px-3 py-2">Kondisi</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Sensor (A / °C / RPM / mm/s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr
                        key={item.prediction_id ?? item._id}
                        className="border-b border-neo-black/20 font-mono text-xs"
                      >
                        <td className="px-3 py-3">
                          {formatTimestamp(item.evaluated_at)}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-3 py-3 font-bold">
                          {(item.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-3">
                          {item.features.current} / {item.features.temperature} /{" "}
                          {item.features.rpm} / {item.features.vibration}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
};

const PredictionResultCard = ({
  prediction,
}: {
  prediction: MachinePredictionResult;
}) => {
  const icon =
    prediction.status === "NORMAL" ? (
      <CheckCircle2 size={26} />
    ) : (
      <AlertTriangle size={26} />
    );

  return (
    <section className="neo-card bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold text-neo-muted">
            AI CONDITION RESULT
          </p>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={prediction.status} large />
            <span className="text-neo-muted">{icon}</span>
          </div>
        </div>
        <div className="border-2 border-neo-black bg-neo-silver px-3 py-2 text-right shadow-neo-sm">
          <p className="font-mono text-[10px] font-bold text-neo-muted">
            CLASSIFIER CONFIDENCE
          </p>
          <p className="text-2xl font-black">
            {(prediction.confidence * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 font-mono text-xs text-neo-muted">
        <Clock3 size={14} />
        {formatTimestamp(prediction.evaluated_at)} · Keputusan:{" "}
        {prediction.decision_method}
      </p>

      {prediction.classifier_status !== prediction.status && (
        <p className="mt-3 border-2 border-neo-black bg-neo-yellow/50 p-3 font-mono text-xs">
          Status classifier: <strong>{prediction.classifier_status}</strong>. Status
          akhir pada indikator berikut dinaikkan oleh penyaringan khusus M-16.
          Grafik probabilitas di bawah tetap menunjukkan keluaran classifier,
          bukan status akhir.
        </p>
      )}

      <div className="mt-5 border-2 border-neo-black bg-neo-bg p-3">
        <p className="mb-2 font-mono text-[10px] font-black uppercase text-neo-muted">
          Status akhir — AI Condition Result
        </p>
        <div
          aria-label={`Status akhir: ${prediction.status}`}
          className="grid grid-cols-3 gap-2"
        >
          {(Object.keys(STATUS_STYLE) as MachineCondition[]).map((status) => (
            <div
              key={status}
              aria-current={prediction.status === status ? "step" : undefined}
              className={`border-2 border-neo-black px-2 py-2 text-center font-mono text-xs font-black ${STATUS_STYLE[status].className} ${
                prediction.status === status ? "ring-2 ring-neo-black ring-offset-2" : "opacity-60"
              }`}
            >
              {status}
              {prediction.status === status ? " · AKHIR" : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <p className="font-mono text-[10px] font-black uppercase text-neo-muted">
          Probabilitas classifier (sebelum penyaringan)
        </p>
        <p className="border-l-4 border-neo-blue bg-neo-bg px-3 py-2 font-mono text-xs leading-relaxed">
          Anggap ini sebagai suara awal model tentang kondisi sensor. Aturan
          khusus M-16 dapat menaikkan status akhir jika suhu atau arus melewati
          ambangnya—seperti pemeriksaan tambahan yang menandai risiko. Karena
          itu, probabilitas model bisa berbeda dari status akhir di atas.
        </p>
        {(Object.keys(STATUS_STYLE) as MachineCondition[]).map((status) => {
          const probability = prediction.probabilities[status] ?? 0;
          return (
            <div key={status}>
              <div className="mb-1 flex justify-between font-mono text-xs font-bold">
                <span
                  className={`border border-neo-black px-1 ${STATUS_STYLE[status].className}`}
                >
                  {status}
                </span>
                <span>{(probability * 100).toFixed(1)}%</span>
              </div>
              <div className="h-3 border-2 border-neo-black bg-neo-silver">
                <div
                  className={`h-full ${
                    status === "NORMAL"
                      ? "bg-status-success"
                      : status === "WARNING"
                        ? "bg-status-warning"
                        : "bg-status-critical"
                  }`}
                  style={{ width: `${Math.min(100, probability * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t-2 border-neo-black/15 pt-4 sm:grid-cols-4">
        {SENSOR_FIELDS.map((field) => (
          <div key={field.key} className="bg-neo-bg p-3">
            <p className="font-mono text-[10px] font-bold uppercase text-neo-muted">
              {field.label}
            </p>
            <p className="mt-1 font-mono font-black">
              {prediction.features[field.key]}{" "}
              <span className="text-xs font-bold text-neo-muted">
                {field.unit}
              </span>
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 border-[3px] border-neo-black bg-neo-cyan/30 p-4">
        <h3 className="font-black uppercase">
          Analisis dan tindak lanjut: {FOLLOW_UP[prediction.status].title}
        </h3>
        <p className="mt-2 font-mono text-sm">
          {FOLLOW_UP[prediction.status].summary}
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 font-mono text-sm">
          {FOLLOW_UP[prediction.status].actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        {prediction.decision_notes.length > 0 && (
          <div className="mt-4 border-t border-neo-black/20 pt-3">
            <h4 className="font-mono text-xs font-black uppercase">
              Faktor keputusan
            </h4>
            <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-xs">
              {prediction.decision_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 border-t border-neo-black/20 pt-3 font-mono text-xs text-neo-muted">
          Confidence adalah skor keluaran model, bukan kepastian kondisi mesin.
          Prediksi ini mengklasifikasikan kondisi dari empat sensor; belum
          mendiagnosis akar kerusakan atau memperkirakan durasi downtime.
        </p>
      </div>
    </section>
  );
};

const HistoryInsights = ({
  counts,
  highRiskCount,
  highRiskRate,
  items,
}: {
  counts: Record<MachineCondition, number>;
  highRiskCount: number;
  highRiskRate: number;
  items: PredictionHistoryItem[];
}) => {
  const recentItems = items.slice(0, 5);

  return (
    <div className="mb-4 border-2 border-neo-black bg-neo-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-black uppercase">Ringkasan pola prediksi</h4>
          <p className="font-mono text-xs text-neo-muted">
            Berdasarkan {items.length} prediksi terakhir yang dimuat untuk
            mesin ini.
          </p>
        </div>
        <span className="border-2 border-neo-black bg-neo-yellow px-2 py-1 font-mono text-xs font-black">
          {highRiskRate}% WARNING / CRITICAL ({highRiskCount}/{items.length})
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["NORMAL", "WARNING", "CRITICAL"] as MachineCondition[]).map(
          (status) => (
            <div
              key={status}
              className="flex items-center justify-between gap-2 border border-neo-black/20 bg-white px-2 py-2 font-mono text-xs"
            >
              <StatusBadge status={status} />
              <span className="font-black">{counts[status]}</span>
            </div>
          ),
        )}
      </div>

      <div className="mt-3">
        <p className="mb-2 font-mono text-[10px] font-black uppercase text-neo-muted">
          Lima prediksi terbaru (baru ke lama)
        </p>
        <div className="flex flex-wrap gap-2">
          {recentItems.map((item) => (
            <span
              key={item.prediction_id ?? item._id}
              className="flex items-center gap-2 border border-neo-black/20 bg-white px-2 py-1 font-mono text-[10px]"
            >
              <StatusBadge status={item.status} />
              {formatTimestamp(item.evaluated_at)}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 border-t border-neo-black/15 pt-2 font-mono text-[10px] text-neo-muted">
        Ringkasan ini hanya menghitung histori prediksi yang dimuat. Analisis
        downtime, akar kerusakan, dan efektivitas maintenance memerlukan catatan
        downtime serta work order yang tervalidasi.
      </p>
    </div>
  );
};

const StatusBadge = ({
  status,
  large = false,
}: {
  status: MachineCondition;
  large?: boolean;
}) => (
  <span
    className={`inline-flex items-center border-2 border-neo-black px-2 py-1 font-mono font-black shadow-neo-sm ${STATUS_STYLE[status].className} ${
      large ? "text-lg" : "text-[10px]"
    }`}
  >
    {STATUS_STYLE[status].label}
  </span>
);
