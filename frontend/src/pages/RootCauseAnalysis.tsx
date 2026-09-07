import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { localDataProvider } from "../services/LocalDataProvider";
import { apiDataProvider, API_ORIGIN } from "../services/ApiDataProvider";
import { simulationEngine } from "../services/SimulationEngine";
import { evaluateMachineStatus } from "../services/MachineStatusRules";
import type {
  Machine,
  RootCauseAnalysis as RCAType,
  Telemetry,
} from "../types/machine";
import { Microscope, AlertOctagon, Wrench, Bug } from "lucide-react";

export const RootCauseAnalysis = () => {
  const [issues, setIssues] = useState<
    { machine: Machine; rca: RCAType | null }[]
  >([]);
  const { mode } = useOutletContext<{ mode: string }>();

  useEffect(() => {
    const fetchData = async () => {
      const provider =
        mode === "CONNECTED" ? apiDataProvider : localDataProvider;
      const machines = await provider.getMachines();
      const rcaData = await Promise.all(
        machines.map(async (machine) => {
          const storedRca =
            mode === "CONNECTED"
              ? null
              : await localDataProvider.getRCA(machine.id);
          const telemetry = await provider.getTelemetry(machine.id, 1);
          const latestTelemetry = telemetry[0];
          const evaluatedMachine = latestTelemetry
            ? {
                ...machine,
                status: evaluateMachineStatus(latestTelemetry).status,
              }
            : machine;
          if (evaluatedMachine.status === "NORMAL") return null;
          if (storedRca) return { machine: evaluatedMachine, rca: storedRca };
          return {
            machine: evaluatedMachine,
            rca: buildRca(evaluatedMachine, latestTelemetry),
          };
        }),
      );
      setIssues(
        rcaData.filter(
          (issue): issue is { machine: Machine; rca: RCAType | null } =>
            issue !== null,
        ),
      );
    };
    fetchData().catch((error) => console.error("RCA data error:", error));
    const handleUpdate = () => fetchData();
    window.addEventListener("mandor-data-update", handleUpdate);

    let socket: WebSocket | undefined;
    if (mode === "CONNECTED") {
      const websocketOrigin = new URL(API_ORIGIN);
      websocketOrigin.protocol =
        websocketOrigin.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${websocketOrigin.origin}/ws/telemetry`);
      socket.onmessage = () =>
        fetchData().catch((error) =>
          console.error("RCA live data error:", error),
        );
      socket.onerror = (error) => console.error("RCA WebSocket error:", error);
    }

    return () => {
      window.removeEventListener("mandor-data-update", handleUpdate);
      socket?.close();
    };
  }, [mode]);

  const simulateRandomAnomaly = () => {
    const scenarios: any[] = ["OVERLOAD", "OVERHEAT", "VIBRATION", "CRITICAL"];
    const randomScenario =
      scenarios[Math.floor(Math.random() * scenarios.length)];
    // Randomize machine between M-16, M-03, M-09
    const targetMachines = ["M-16", "M-03", "M-09"];
    const target =
      targetMachines[Math.floor(Math.random() * targetMachines.length)];

    simulationEngine.setScenario(target, randomScenario);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
        <div>
          <h2 className="text-4xl uppercase tracking-widest text-white bg-neo-blue inline-block px-2 border-[3px] border-neo-black shadow-neo">
            Root Cause Analysis
          </h2>
          <p className="text-neo-black font-mono font-bold text-sm mt-2 bg-neo-silver inline-block px-1 border-2 border-neo-black">
            AI-POWERED DIAGNOSTICS
          </p>
        </div>

        {mode === "STANDALONE" && (
          <button
            onClick={simulateRandomAnomaly}
            className="neo-btn !bg-status-critical !text-white !border-neo-black hover:scale-[1.05] flex items-center shadow-neo-sm"
          >
            <Bug size={18} className="mr-2" />
            SIMULATE ANOMALY
          </button>
        )}
      </div>

      {issues.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {issues.map((issue) => (
            <div
              key={issue.machine.id}
              className={`neo-card p-0 ${issue.machine.status === "CRITICAL" ? "bg-status-critical" : "bg-status-warning"} border-4 border-neo-black flex flex-col`}
            >
              <div className="p-4 border-b-4 border-neo-black bg-white flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <h3 className="text-2xl font-black font-mono bg-neo-black text-white px-2 py-1 border-2 border-black">
                    {issue.machine.id}
                  </h3>
                  <div className="font-mono font-bold text-neo-black">
                    {issue.machine.name}
                  </div>
                </div>
                <div
                  className={`px-2 py-1 font-black text-sm border-2 border-neo-black ${issue.machine.status === "CRITICAL" ? "bg-status-critical text-white" : "bg-status-warning text-neo-black"}`}
                >
                  {issue.machine.status}
                </div>
              </div>

              <div className="p-6 bg-neo-bg flex-1">
                {issue.rca ? (
                  <div className="space-y-6">
                    <div className="flex items-start space-x-4">
                      <div className="bg-neo-black p-3 border-2 border-neo-black shadow-neo-sm">
                        <Microscope className="text-white" size={32} />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-mono font-bold text-neo-muted mb-1">
                          PROBABLE CAUSE
                        </div>
                        <div className="text-2xl font-black text-neo-black bg-white inline-block px-2 border-2 border-neo-black shadow-neo-sm">
                          {issue.rca.probable_cause}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-neo-muted mb-1">
                          AI CONFIDENCE
                        </div>
                        <div className="text-3xl font-black text-neo-blue bg-white inline-block px-2 border-2 border-neo-black shadow-neo-sm">
                          {issue.rca.confidence}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border-2 border-neo-black p-4 shadow-neo-sm">
                      <div className="text-xs font-mono font-bold text-neo-muted mb-3 flex items-center">
                        <AlertOctagon size={16} className="mr-1" /> EVIDENCE LOG
                      </div>
                      <ul className="list-disc pl-5 font-mono font-bold text-sm text-neo-black space-y-1">
                        {issue.rca.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-neo-blue border-2 border-neo-black p-4 text-white shadow-neo-sm">
                      <div className="text-xs font-mono font-bold text-neo-silver mb-2 flex items-center">
                        <Wrench size={16} className="mr-1" /> RECOMMENDED ACTION
                      </div>
                      <div className="text-lg font-black">
                        {issue.rca.recommended_action}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 font-mono font-bold text-neo-muted">
                    Analyzing telemetry data... Waiting for RCA generation.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function buildRca(machine: Machine, telemetry?: Telemetry): RCAType | null {
  if (machine.status === "NORMAL") return null;

  const temperature = telemetry?.temperature ?? 0;
  const vibration = telemetry?.vibration ?? 0;
  const current = telemetry?.current ?? 0;
  const evidence: string[] = [];
  const evaluation = telemetry ? evaluateMachineStatus(telemetry) : null;
  let probableCause = "Parameter operasi berada di luar batas aman.";
  let recommendedAction =
    "Kurangi beban mesin dan lakukan pemeriksaan operator segera.";

  if (evaluation?.status === "CRITICAL" || machine.status === "CRITICAL") {
    evidence.push(
      telemetry?.status_reason ??
        evaluation?.reason ??
        `Status mesin ${machine.status}.`,
    );
    probableCause = "Suhu atau kondisi mesin mencapai tingkat kritis.";
    recommendedAction =
      "Hentikan mesin dan periksa sistem pendingin serta beban mekanis.";
  } else if (temperature >= 36.0) {
    evidence.push(
      telemetry?.status_reason ??
        evaluation?.reason ??
        `Temperatur terukur ${temperature.toFixed(1)} °C.`,
    );
    probableCause = "Panas berlebih akibat temperatur operasi yang tinggi.";
    recommendedAction =
      "Turunkan beban arus mesin dan periksa pendingin untuk menstabilkan suhu.";
  }
  if (temperature < 36.0 && vibration >= 4.0) {
    evidence.push(
      `Getaran terukur ${vibration.toFixed(2)} pada kombinasi parameter pendukung.`,
    );
    probableCause = "Getaran mekanis tidak normal.";
    recommendedAction =
      "Hentikan mesin bila getaran meningkat dan periksa alignment serta bearing.";
  }
  if (temperature < 36.0 && current > 2.5) {
    evidence.push(
      `Arus terukur ${current.toFixed(2)} A, di atas rentang normal 0.0-2.5 A.`,
    );
    probableCause = "Beban arus motor meningkat.";
    recommendedAction = "Periksa beban motor dan sambungan kelistrikan.";
  }
  if (evidence.length === 0)
    evidence.push(`Status mesin dilaporkan ${machine.status}.`);

  return {
    machine_id: machine.id,
    timestamp: telemetry?.timestamp ?? new Date().toISOString(),
    probable_cause: probableCause,
    confidence: machine.status === "CRITICAL" ? 95 : 85,
    evidence,
    recommended_action: recommendedAction,
  };
}
