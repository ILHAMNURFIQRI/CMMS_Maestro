import { useState, useEffect } from "react";
import {
  Outlet,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  Server,
  LayoutDashboard,
  MonitorSpeaker,
  Map,
  FileWarning,
  Zap,
  Microscope,
  BarChart3,
  BrainCircuit,
  MessageSquareText,
  ClipboardCheck,
  PackageOpen,
  Wrench,
} from "lucide-react";
import { simulationEngine } from "../services/SimulationEngine";
import { currentOrderRole, isDemoSession } from "../services/ProductionOrders";

export const MainLayout = () => {
  const [mode, setMode] = useState<"STANDALONE" | "CONNECTED">("STANDALONE");
  const [demoRole] = useState(() => sessionStorage.getItem("maestro_demo_role"));
  const role = currentOrderRole();
  const demo = isDemoSession();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === "STANDALONE") {
      simulationEngine.start();
    } else {
      simulationEngine.stop();
    }
    return () => simulationEngine.stop();
  }, [mode]);

  if (!role) {
    return <Navigate to="/" replace />;
  }
  if (role === "customer") {
    return <Navigate to="/customer" replace />;
  }
  const managerPaths = new Set([
    "/app",
    "/app/orders",
    "/app/maintenance-work-orders",
    "/app/products",
    "/app/production-data",
    "/app/production",
    "/app/chatbot",
  ]);
  const operatorPaths = new Set([
    "/app",
    "/app/fleet",
    "/app/alerts",
    "/app/predictions",
    "/app/chatbot",
    "/app/rca",
    "/app/production",
    "/app/production-data",
    "/app/energy",
    "/app/digital-twin",
    "/app/diagnostics",
    "/app/orders",
    "/app/maintenance-work-orders",
  ]);
  const pathAllowed =
    role === "manager"
      ? managerPaths.has(location.pathname)
      : operatorPaths.has(location.pathname) ||
        location.pathname.startsWith("/app/machine/");
  if (!pathAllowed) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neo-bg text-neo-black font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r-[3px] border-neo-black bg-neo-card flex flex-col z-20">
        <div className="h-16 flex items-center px-4 border-b-[3px] border-neo-black bg-neo-white">
          <Activity className="text-neo-black w-6 h-6 mr-3 stroke-[3px]" />
          <div>
            <h1 className="text-2xl font-black tracking-widest text-neo-black m-0">
              MAESTRO
            </h1>
            <span className="text-[10px] text-neo-black font-mono font-bold tracking-widest uppercase">
              Manufacturing Tracker
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto bg-neo-card py-4">
          <p className="px-6 pb-2 font-mono text-[10px] font-black uppercase tracking-widest text-neo-muted">
            {role === "manager" ? "Area Manajerial" : "Area Operasional"}
          </p>
          <div className="space-y-1">
            <NavItem
              to="/app"
              icon={<LayoutDashboard size={20} strokeWidth={2.5} />}
              label={role === "manager" ? "Ringkasan Manager" : "Dashboard Operator"}
            />
            {role === "manager" ? (
              <>
                <NavItem
                  to="/app/orders"
                  icon={<ClipboardCheck size={20} strokeWidth={2.5} />}
                  label="Validasi & Jadwal Order"
                />
                <NavItem
                  to="/app/maintenance-work-orders"
                  icon={<Wrench size={20} strokeWidth={2.5} />}
                  label="Maintenance Work Orders"
                />
                <NavItem
                  to="/app/products"
                  icon={<PackageOpen size={20} strokeWidth={2.5} />}
                  label="Katalog Produk"
                />
                <NavItem
                  to="/app/production-data"
                  icon={<BarChart3 size={20} strokeWidth={2.5} />}
                  label="Data Produksi & MES"
                />
                <NavItem
                  to="/app/production"
                  icon={<Activity size={20} strokeWidth={2.5} />}
                  label="Laporan Produksi"
                />
                <NavItem
                  to="/app/chatbot"
                  icon={<MessageSquareText size={20} strokeWidth={2.5} />}
                  label="Asisten Manager"
                />
              </>
            ) : (
              <>
                <NavItem
                  to="/app/fleet"
                  icon={<MonitorSpeaker size={20} strokeWidth={2.5} />}
                  label="Fleet Monitoring"
                />
                <NavItem
                  to="/app/alerts"
                  icon={<FileWarning size={20} strokeWidth={2.5} />}
                  label="Alerts"
                />
                <NavItem
                  to="/app/predictions"
                  icon={<BrainCircuit size={20} strokeWidth={2.5} />}
                  label="AI Prediction"
                />
                <NavItem
                  to="/app/chatbot"
                  icon={<MessageSquareText size={20} strokeWidth={2.5} />}
                  label="Asisten Operator"
                />
                <NavItem
                  to="/app/rca"
                  icon={<Microscope size={20} strokeWidth={2.5} />}
                  label="Root Cause Analysis"
                />
                <NavItem
                  to="/app/orders"
                  icon={<ClipboardCheck size={20} strokeWidth={2.5} />}
                  label="Order Produksi"
                />
                <NavItem
                  to="/app/maintenance-work-orders"
                  icon={<Wrench size={20} strokeWidth={2.5} />}
                  label="Maintenance Work Orders"
                />
                <NavItem
                  to="/app/production"
                  icon={<Activity size={20} strokeWidth={2.5} />}
                  label="Laporan & Export"
                />
                <NavItem
                  to="/app/production-data"
                  icon={<BarChart3 size={20} strokeWidth={2.5} />}
                  label="Data Produksi"
                />
                <NavItem
                  to="/app/energy"
                  icon={<Zap size={20} strokeWidth={2.5} />}
                  label="Energy"
                />
                <NavItem
                  to="/app/digital-twin"
                  icon={<Map size={20} strokeWidth={2.5} />}
                  label="Digital Twin"
                />
              </>
            )}
          </div>
        </nav>

        {/* Connection Status Indicator */}
        <div className="p-4 border-t-[3px] border-neo-black bg-neo-cyan text-xs font-mono font-bold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-neo-black">SYSTEM:</span>
            <span className="text-neo-black bg-white border-2 border-black px-1 shadow-neo-sm">
              ONLINE
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-neo-black">MQTT M-16:</span>
            <span className="text-neo-black bg-neo-yellow border-2 border-black px-1 shadow-neo-sm">
              CONNECTED
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b-[3px] border-neo-black bg-neo-card flex items-center justify-between px-6 z-10">
          <div className="font-mono font-bold text-sm text-neo-muted">
            MAESTRO: MANUFACTURING EXECUTION & SYNCHRONIZATION TRACKER
            {demoRole && (
              <span className="ml-3 border-2 border-neo-black bg-neo-yellow px-2 py-1 text-[10px] text-neo-black">
                SIMULASI: {demoRole.toUpperCase()}
              </span>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center space-x-2 border-[3px] border-neo-black bg-white shadow-neo">
            {(demoRole || !demo) && (
              <button
                onClick={() => {
                  sessionStorage.removeItem("maestro_demo_role");
                  if (!demo) {
                    void fetch(
                      `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/auth/logout`,
                      { method: "POST", credentials: "include" },
                    ).catch((error: unknown) =>
                      console.error("Could not sign out:", error),
                    );
                  }
                  sessionStorage.removeItem("maestro_auth_role");
                  navigate("/");
                }}
                className="px-3 py-1 font-mono text-xs font-black text-neo-muted hover:bg-gray-100"
                type="button"
              >
                GANTI ROLE
              </button>
            )}
            <button
              onClick={() => setMode("STANDALONE")}
              className={`px-3 py-1 font-mono text-xs font-black transition-colors border-r-[3px] border-neo-black ${mode === "STANDALONE" ? "bg-neo-blue text-white" : "text-neo-muted hover:bg-gray-100"}`}
            >
              STANDALONE DEMO
            </button>
            {!demo && (
              <button
                onClick={() => setMode("CONNECTED")}
                className={`px-3 py-1 font-mono text-xs font-black transition-colors flex items-center ${mode === "CONNECTED" ? "bg-neo-blue text-white" : "text-neo-muted hover:bg-gray-100"}`}
              >
                <Server size={14} className="mr-2 stroke-[3px]" /> CONNECTED
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto relative flex flex-col bg-neo-bg">
          <div className="flex-1 p-6 relative">
            {mode === "STANDALONE" && (
              <div className="absolute top-2 right-6 z-10 font-mono font-bold text-[10px] text-white bg-neo-blue border-2 border-neo-black px-2 py-1 shadow-neo-sm">
                UI MODE: STANDALONE DEMO
              </div>
            )}
            <Outlet context={{ mode }} />
          </div>

          {/* Global Footer */}
          <footer className="w-full border-t-[3px] border-neo-black bg-white p-3 text-center font-mono font-bold text-sm text-neo-black shadow-neo-sm">
            Made with Restu Mamah Papah
          </footer>
        </div>
      </main>
    </div>
  );
};

const NavItem = ({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) => {
  return (
    <NavLink
      to={to}
      end={to === "/app"}
      className={({ isActive }) =>
        `flex items-center px-6 py-3 font-black text-sm transition-all border-b-[3px] border-transparent ${isActive ? "bg-neo-blue text-white border-neo-black shadow-neo translate-x-2" : "text-neo-muted hover:text-neo-black hover:translate-x-1"}`
      }
    >
      <span className="mr-3">{icon}</span>
      {label}
    </NavLink>
  );
};
