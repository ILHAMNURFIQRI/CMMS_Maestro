import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MachineCard } from "../components/MachineCard";
import { localDataProvider } from "../services/LocalDataProvider";
import { apiDataProvider } from "../services/ApiDataProvider";
import type { Machine, Telemetry } from "../types/machine";

export const FleetMonitoring = () => {
  const { mode } = useOutletContext<{ mode: string }>();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const loadData = async () => {
    const provider = mode === "CONNECTED" ? apiDataProvider : localDataProvider;
    const machs = await provider.getMachines();
    setMachines(machs);
    setConnectionError(null);

    const latestTelemetry: Record<string, Telemetry> = {};
    for (const m of machs) {
      const tel = await provider.getTelemetry(m.id, 1);
      if (tel.length > 0) {
        latestTelemetry[m.id] = tel[0];
      }
    }
    setTelemetry(latestTelemetry);
  };

  useEffect(() => {
    loadData().catch((error) => {
      console.error("Fleet data error:", error);
      setConnectionError(
        mode === "CONNECTED"
          ? "Backend belum terhubung. Jalankan FastAPI di port 8000."
          : "Data lokal tidak dapat dimuat.",
      );
    });
    const handleUpdate = () => loadData();
    window.addEventListener("mandor-data-update", handleUpdate);
    let socket: WebSocket | undefined;
    if (mode === "CONNECTED") {
      const apiOrigin = new URL(
        import.meta.env.VITE_API_URL || "http://localhost:8000",
      );
      apiOrigin.protocol = apiOrigin.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${apiOrigin.origin}/ws/telemetry`);
      socket.onmessage = (event) => {
        const incoming = JSON.parse(event.data) as Telemetry;
        setConnectionError(null);
        setTelemetry((current) => ({
          ...current,
          [incoming.machine_id]: incoming,
        }));
        setMachines((current) =>
          current.map((machine) =>
            machine.id === incoming.machine_id
              ? {
                  ...machine,
                  ...(incoming.status
                    ? { status: incoming.status as Machine["status"] }
                    : {}),
                  data_source: "MQTT",
                  mqtt_status: "CONNECTED",
                }
              : machine,
          ),
        );
      };
      socket.onerror = (error) => {
        console.error("Telemetry WebSocket error:", error);
        setConnectionError("WebSocket telemetry belum terhubung ke backend.");
      };
    }
    return () => {
      window.removeEventListener("mandor-data-update", handleUpdate);
      socket?.close();
    };
  }, [mode]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">
          Fleet Monitoring
        </h2>
        <p className="text-neo-black font-mono font-bold mt-2 bg-neo-silver inline-block px-1 border-2 border-black">
          LIVE FACTORY FLOOR STATUS
        </p>
      </div>

      {connectionError && mode === "CONNECTED" && (
        <div className="mb-6 border-[3px] border-neo-black bg-neo-yellow px-3 py-2 font-mono font-bold shadow-neo">
          MQTT / BACKEND: {connectionError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {machines.map((m) => (
          <MachineCard key={m.id} machine={m} telemetry={telemetry[m.id]} />
        ))}
      </div>
    </div>
  );
};
