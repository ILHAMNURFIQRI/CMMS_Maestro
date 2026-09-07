import type { Machine } from "../types/machine";
import { useNavigate } from "react-router-dom";
import {
  calculateHealthScore,
  evaluateMachineStatus,
} from "../services/MachineStatusRules";

export const MachineCard = ({
  machine,
  telemetry,
}: {
  machine: Machine;
  telemetry?: any;
}) => {
  const navigate = useNavigate();
  const evaluatedStatus = telemetry
    ? (telemetry.status ?? evaluateMachineStatus(telemetry).status)
    : machine.status;
  const displayedHealth = telemetry
    ? calculateHealthScore(telemetry)
    : machine.health_score;

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "NORMAL":
        return "bg-status-success";
      case "WARNING":
        return "bg-status-warning";
      case "CRITICAL":
        return "bg-status-critical text-white";
      case "INTERVENTION":
        return "bg-status-info";
      default:
        return "bg-gray-300";
    }
  };

  const getCardBg = (status: string) => {
    switch (status) {
      case "WARNING":
        return "bg-yellow-50";
      case "CRITICAL":
        return "bg-red-50";
      case "INTERVENTION":
        return "bg-blue-50";
      default:
        return "bg-white";
    }
  };

  return (
    <div
      className={`neo-card p-0 overflow-hidden cursor-pointer flex flex-col h-full ${getCardBg(evaluatedStatus)}`}
      onClick={() => navigate(`/machine/${machine.id}`)}
    >
      <div
        className={`px-4 py-2 border-b-[3px] border-neo-black flex justify-between items-center ${getStatusColorClass(evaluatedStatus)}`}
      >
        <div className="font-black font-mono text-lg text-black">
          {machine.id}
        </div>
        <div className="text-xs font-black px-1 border-2 border-black bg-white text-black">
          {evaluatedStatus}
        </div>
      </div>

      <div className="p-4 flex-1">
        <div className="font-bold text-xl mb-1 text-neo-black">
          {machine.name}
        </div>
        <div className="font-mono text-sm text-neo-muted mb-4">
          {machine.type} • {machine.line}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border-2 border-neo-black p-2 bg-neo-bg">
            <div className="text-[10px] text-neo-muted font-bold font-mono">
              HEALTH SCORE
            </div>
            <div
              className={`text-2xl font-black ${displayedHealth < 40 ? "text-status-critical" : displayedHealth < 80 ? "text-status-warning" : "text-neo-black"}`}
            >
              {displayedHealth}%
            </div>
          </div>
          <div className="border-2 border-neo-black p-2 bg-neo-bg">
            <div className="text-[10px] text-neo-muted font-bold font-mono">
              TEMP
            </div>
            <div className="text-2xl font-black text-neo-black">
              {telemetry ? telemetry.temperature.toFixed(1) : "--"}°C
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 bg-neo-bg border-t-[3px] border-neo-black flex justify-between items-center">
        <span
          className={`text-[10px] font-black font-mono px-1 border-2 border-black ${machine.data_source === "MQTT" ? "bg-neo-blue text-white" : "bg-neo-silver text-black"}`}
        >
          {machine.data_source}
        </span>
      </div>
    </div>
  );
};
