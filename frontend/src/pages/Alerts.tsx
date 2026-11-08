import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { localDataProvider } from "../services/LocalDataProvider";
import type { Alert } from "../types/machine";
import { FileWarning, CheckCircle, Wrench } from "lucide-react";

const demoAlerts: Alert[] = [
  {
    id: "ALR-1",
    machine_id: "M-16",
    timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
    type: "WARNING",
    severity: 2,
    message: "Vibration deviation detected on main axis.",
    acknowledged: false,
  },
  {
    id: "ALR-2",
    machine_id: "M-09",
    timestamp: new Date(Date.now() - 45 * 60_000).toISOString(),
    type: "CRITICAL",
    severity: 3,
    message: "Spindle overload. Emergency stop triggered.",
    acknowledged: false,
  },
  {
    id: "ALR-3",
    machine_id: "M-03",
    timestamp: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    type: "INFO",
    severity: 1,
    message: "Scheduled maintenance reminder.",
    acknowledged: true,
  },
  {
    id: "ALR-4",
    machine_id: "M-12",
    timestamp: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
    type: "WARNING",
    severity: 2,
    message: "Temperature rising above baseline.",
    acknowledged: false,
  },
];

export const Alerts = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void localDataProvider
      .getAlerts()
      .then((dbAlerts) => setAlerts(dbAlerts.length > 0 ? dbAlerts : demoAlerts))
      .catch((error: unknown) =>
        setLoadError(
          error instanceof Error ? error.message : "Could not load alerts.",
        ),
      );
  }, []);

  const acknowledgeAlert = (id: string) => {
    setAlerts((previous) =>
      previous.map((alert) =>
        alert.id === id ? { ...alert, acknowledged: true } : alert,
      ),
    );
  };

  const getSeverityStyles = (type: Alert["type"], acknowledged: boolean) => {
    if (acknowledged) return "bg-neo-silver text-neo-muted border-neo-muted";
    if (type === "CRITICAL") return "bg-status-critical text-white border-neo-black";
    if (type === "WARNING") return "bg-status-warning text-neo-black border-neo-black";
    return "bg-neo-blue text-white border-neo-black";
  };

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="inline-block border-[3px] border-neo-black bg-neo-blue px-2 text-4xl uppercase tracking-widest text-white shadow-neo">
            Alerts
          </h2>
          <p className="mt-2 inline-block border-2 border-neo-black bg-neo-silver px-1 font-mono text-sm font-bold text-neo-black">
            CENTRAL ALARM LOG
          </p>
        </div>
        <div className="neo-card flex items-center space-x-4 bg-white p-2">
          <div className="flex items-center font-mono text-xs font-bold">
            <span className="mr-2 h-3 w-3 border border-black bg-status-critical" />
            {alerts.filter((alert) => alert.type === "CRITICAL" && !alert.acknowledged).length}{" "}
            CRIT
          </div>
          <div className="flex items-center font-mono text-xs font-bold">
            <span className="mr-2 h-3 w-3 border border-black bg-status-warning" />
            {alerts.filter((alert) => alert.type === "WARNING" && !alert.acknowledged).length}{" "}
            WARN
          </div>
        </div>
      </div>

      {loadError && (
        <p className="border-2 border-neo-black bg-red-100 p-3 font-mono text-sm text-red-800">
          {loadError}
        </p>
      )}

      <div className="neo-card bg-white p-0">
        <div className="flex items-center border-b-[3px] border-neo-black bg-neo-black p-4 text-white">
          <FileWarning className="mr-2" />
          <h3 className="text-lg font-black uppercase">Active & Recent Alerts</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead className="bg-neo-silver text-neo-black">
              <tr>
                <th className="border-b-2 border-r-2 border-neo-black p-4">ID</th>
                <th className="border-b-2 border-r-2 border-neo-black p-4">TIME</th>
                <th className="border-b-2 border-r-2 border-neo-black p-4">MACHINE</th>
                <th className="border-b-2 border-r-2 border-neo-black p-4">SEVERITY</th>
                <th className="border-b-2 border-r-2 border-neo-black p-4">MESSAGE</th>
                <th className="border-b-2 border-neo-black p-4 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, index) => (
                <tr
                  className={index % 2 === 0 ? "bg-neo-bg" : "bg-white"}
                  key={alert.id}
                >
                  <td className="border-b-2 border-r-2 border-neo-black p-4 font-bold text-neo-muted">
                    {alert.id}
                  </td>
                  <td className="border-b-2 border-r-2 border-neo-black p-4 font-bold">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="border-b-2 border-r-2 border-neo-black p-4">
                    <span className="border-2 border-neo-black bg-white px-2 py-1 font-black">
                      {alert.machine_id}
                    </span>
                  </td>
                  <td className="border-b-2 border-r-2 border-neo-black p-4">
                    <span
                      className={`border-[2px] px-2 py-1 font-black ${getSeverityStyles(alert.type, alert.acknowledged)}`}
                    >
                      {alert.acknowledged ? "ACKNOWLEDGED" : alert.type}
                    </span>
                  </td>
                  <td
                    className={`border-b-2 border-r-2 border-neo-black p-4 font-bold ${alert.acknowledged ? "text-neo-muted line-through" : ""}`}
                  >
                    {alert.message}
                  </td>
                  <td className="space-y-2 border-b-2 border-neo-black p-4 text-center">
                    {!alert.acknowledged && (
                      <button
                        className="neo-btn !px-2 !py-1 !text-xs !bg-neo-blue !text-white"
                        onClick={() =>
                          navigate("/app/maintenance-work-orders", {
                            state: {
                              alert: {
                                id: alert.id,
                                machine_id: alert.machine_id,
                                message: alert.message,
                                severity: alert.type,
                              },
                            },
                          })
                        }
                        type="button"
                      >
                        <Wrench className="mr-1 inline" size={14} />
                        BUAT USULAN WO
                      </button>
                    )}
                    {!alert.acknowledged ? (
                      <button
                        className="neo-btn !px-2 !py-1 !text-xs"
                        onClick={() => acknowledgeAlert(alert.id)}
                        type="button"
                      >
                        ACKNOWLEDGE
                      </button>
                    ) : (
                      <CheckCircle className="mx-auto text-status-success" />
                    )}
                  </td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td
                    className="bg-neo-bg p-8 text-center font-bold text-neo-muted"
                    colSpan={6}
                  >
                    No alerts found. System is stable.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
