import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard, PlaceholderPage } from './pages/Dashboard';
import { FleetMonitoring } from './pages/FleetMonitoring';
import { MachineDetail } from './pages/MachineDetail';
import { Reports } from './pages/Reports';
import { Alerts } from './pages/Alerts';
import { RootCauseAnalysis } from './pages/RootCauseAnalysis';
import { Energy } from './pages/Energy';
import { DigitalTwin } from './pages/DigitalTwin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="fleet" element={<FleetMonitoring />} />
          <Route path="machine/:id" element={<MachineDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="rca" element={<RootCauseAnalysis />} />
          <Route path="production" element={<Reports />} />
          <Route path="energy" element={<Energy />} />
          <Route path="digital-twin" element={<DigitalTwin />} />
          <Route path="diagnostics" element={<PlaceholderPage title="System Diagnostics" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
