import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { currentOrderRole } from './services/ProductionOrders';

const MainLayout = lazy(async () => ({
  default: (await import('./layouts/MainLayout')).MainLayout,
}));
const Dashboard = lazy(async () => ({
  default: (await import('./pages/Dashboard')).Dashboard,
}));
const PlaceholderPage = lazy(async () => ({
  default: (await import('./pages/Dashboard')).PlaceholderPage,
}));
const FleetMonitoring = lazy(async () => ({
  default: (await import('./pages/FleetMonitoring')).FleetMonitoring,
}));
const MachineDetail = lazy(async () => ({
  default: (await import('./pages/MachineDetail')).MachineDetail,
}));
const Reports = lazy(async () => ({
  default: (await import('./pages/Reports')).Reports,
}));
const ProductionData = lazy(async () => ({
  default: (await import('./pages/ProductionData')).ProductionData,
}));
const Alerts = lazy(async () => ({
  default: (await import('./pages/Alerts')).Alerts,
}));
const RootCauseAnalysis = lazy(async () => ({
  default: (await import('./pages/RootCauseAnalysis')).RootCauseAnalysis,
}));
const Energy = lazy(async () => ({
  default: (await import('./pages/Energy')).Energy,
}));
const DigitalTwin = lazy(async () => ({
  default: (await import('./pages/DigitalTwin')).DigitalTwin,
}));
const MachinePrediction = lazy(async () => ({
  default: (await import('./pages/MachinePrediction')).MachinePrediction,
}));
const MaintenanceChatbot = lazy(async () => ({
  default: (await import('./pages/MaintenanceChatbot')).MaintenanceChatbot,
}));
const Login = lazy(async () => ({
  default: (await import('./pages/Login')).Login,
}));
const CustomerHome = lazy(async () => ({
  default: (await import('./pages/CustomerHome')).CustomerHome,
}));
const ProductionOrders = lazy(async () => ({
  default: (await import('./pages/ProductionOrders')).ProductionOrders,
}));
const MaintenanceWorkOrders = lazy(async () => ({
  default: (await import('./pages/MaintenanceWorkOrders')).MaintenanceWorkOrders,
}));
const ManagerDashboard = lazy(async () => ({
  default: (await import('./pages/ManagerDashboard')).ManagerDashboard,
}));
const ManagerCatalog = lazy(async () => ({
  default: (await import('./pages/ManagerCatalog')).ManagerCatalog,
}));

const RoleDashboard = () =>
  currentOrderRole() === 'manager' ? <ManagerDashboard /> : <Dashboard />;

const LoadingPage = () => (
  <div className="flex min-h-screen items-center justify-center bg-neo-bg font-mono font-bold">
    Memuat MAESTRO...
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingPage />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/app" element={<MainLayout />}>
            <Route index element={<RoleDashboard />} />
            <Route path="fleet" element={<FleetMonitoring />} />
            <Route path="machine/:id" element={<MachineDetail />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="predictions" element={<MachinePrediction />} />
            <Route path="chatbot" element={<MaintenanceChatbot />} />
            <Route path="rca" element={<RootCauseAnalysis />} />
            <Route path="production" element={<Reports />} />
            <Route path="production-data" element={<ProductionData />} />
            <Route path="energy" element={<Energy />} />
            <Route path="digital-twin" element={<DigitalTwin />} />
            <Route path="diagnostics" element={<PlaceholderPage title="System Diagnostics" />} />
            <Route path="orders" element={<ProductionOrders />} />
            <Route path="maintenance-work-orders" element={<MaintenanceWorkOrders />} />
            <Route path="products" element={<ManagerCatalog />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
