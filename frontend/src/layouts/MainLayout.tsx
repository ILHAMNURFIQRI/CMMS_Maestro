import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Activity, Server, LayoutDashboard, MonitorSpeaker, Settings, Map, FileWarning, Zap, Microscope } from 'lucide-react';
import { simulationEngine } from '../services/SimulationEngine';

export const MainLayout = () => {
  const [mode, setMode] = useState<'STANDALONE' | 'CONNECTED'>('STANDALONE');

  useEffect(() => {
    if (mode === 'STANDALONE') {
      simulationEngine.start();
    } else {
      simulationEngine.stop();
    }
    return () => simulationEngine.stop();
  }, [mode]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neo-bg text-neo-black font-sans">
      
      {/* Sidebar */}
      <aside className="w-64 border-r-[3px] border-neo-black bg-neo-card flex flex-col z-20">
        <div className="h-16 flex items-center px-4 border-b-[3px] border-neo-black bg-neo-white">
          <Activity className="text-neo-black w-6 h-6 mr-3 stroke-[3px]" />
          <div>
            <h1 className="text-2xl font-black tracking-widest text-neo-black m-0">MANDOR</h1>
            <span className="text-[10px] text-neo-black font-mono font-bold tracking-widest uppercase">Analytics Router</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 bg-neo-card">
          <NavItem to="/" icon={<LayoutDashboard size={20} strokeWidth={2.5} />} label="Dashboard" />
          <NavItem to="/fleet" icon={<MonitorSpeaker size={20} strokeWidth={2.5} />} label="Fleet Monitoring" />
          <NavItem to="/alerts" icon={<FileWarning size={20} strokeWidth={2.5} />} label="Alerts" />
          <NavItem to="/rca" icon={<Microscope size={20} strokeWidth={2.5} />} label="Root Cause Analysis" />
          <NavItem to="/production" icon={<Activity size={20} strokeWidth={2.5} />} label="Reports & Export" />
          <NavItem to="/energy" icon={<Zap size={20} strokeWidth={2.5} />} label="Energy" />
          <NavItem to="/digital-twin" icon={<Map size={20} strokeWidth={2.5} />} label="Digital Twin" />
          <div className="my-4 border-t-[3px] border-neo-black" />
          <NavItem to="/diagnostics" icon={<Settings size={20} strokeWidth={2.5} />} label="System Diagnostics" />
        </nav>
        
        {/* Connection Status Indicator */}
        <div className="p-4 border-t-[3px] border-neo-black bg-neo-cyan text-xs font-mono font-bold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-neo-black">SYSTEM:</span>
            <span className="text-neo-black bg-white border-2 border-black px-1 shadow-neo-sm">ONLINE</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-neo-black">MQTT M-16:</span>
            <span className="text-neo-black bg-neo-yellow border-2 border-black px-1 shadow-neo-sm">CONNECTED</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <header className="h-16 border-b-[3px] border-neo-black bg-neo-card flex items-center justify-between px-6 z-10">
          <div className="font-mono font-bold text-sm text-neo-muted">
            MACHINE ANALYTICS & NETWORK DIAGNOSTIC OPERATIONS ROUTER
          </div>
          
          {/* Mode Switcher */}
          <div className="flex items-center space-x-2 border-[3px] border-neo-black bg-white shadow-neo">
            <button 
              onClick={() => setMode('STANDALONE')}
              className={`px-3 py-1 font-mono text-xs font-black transition-colors border-r-[3px] border-neo-black ${mode === 'STANDALONE' ? 'bg-neo-blue text-white' : 'text-neo-muted hover:bg-gray-100'}`}
            >
              STANDALONE DEMO
            </button>
            <button 
              onClick={() => setMode('CONNECTED')}
              className={`px-3 py-1 font-mono text-xs font-black transition-colors flex items-center ${mode === 'CONNECTED' ? 'bg-neo-blue text-white' : 'text-neo-muted hover:bg-gray-100'}`}
            >
              <Server size={14} className="mr-2 stroke-[3px]" /> CONNECTED
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto relative flex flex-col bg-neo-bg">
          <div className="flex-1 p-6 relative">
            {mode === 'STANDALONE' && (
              <div className="absolute top-2 right-6 z-10 font-mono font-bold text-[10px] text-white bg-neo-blue border-2 border-neo-black px-2 py-1 shadow-neo-sm">
                DATA SOURCE: LOCAL SIMULATION
              </div>
            )}
            <Outlet context={{ mode }} />
          </div>
          
          {/* Global Footer */}
          <footer className="w-full border-t-[3px] border-neo-black bg-white p-3 text-center font-mono font-bold text-sm text-neo-black shadow-neo-sm">
            Made with ❤️ Lukita Falensia Marjan di Bandung
          </footer>
        </div>
      </main>

    </div>
  );
};

const NavItem = ({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) => {
  return (
    <NavLink 
      to={to} 
      className={({isActive}) => 
        `flex items-center px-6 py-3 font-black text-sm transition-all border-b-[3px] border-transparent ${isActive ? 'bg-neo-blue text-white border-neo-black shadow-neo translate-x-2' : 'text-neo-muted hover:text-neo-black hover:translate-x-1'}`
      }
    >
      <span className="mr-3">{icon}</span>
      {label}
    </NavLink>
  );
};
