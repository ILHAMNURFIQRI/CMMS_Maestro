# Tutorial Lengkap: Mengintegrasikan UI MAESTRO dengan Backend & MQTT

Dokumen ini menjelaskan arsitektur aplikasi MAESTRO dalam **Standalone Mode** dan **Connected Mode** yang menggunakan FastAPI, MongoDB, serta MQTT.

---

## 🏗️ 1. Memahami Arsitektur

Saat ini, aplikasi *Frontend* React mengambil data secara eksklusif dari *file* `LocalDataProvider.ts`. File ini sengaja dibuat untuk mensimulasikan semua data (Telemetri, Root Cause Analysis, Alerts) agar UI dapat didemonstrasikan tanpa perlu menyalakan server backend.

Untuk beralih ke Backend sungguhan, kita **tidak perlu** mengubah komponen UI (seperti halaman Dashboard, RCA, atau fitur Export PDF). Kita hanya perlu membuat "Jembatan Baru" bernama `ApiDataProvider.ts` dan sebuah mekanisme *React Context* untuk beralih antara jembatan simulasi dan jembatan asli.

> [!TIP]
> **Kabar Baik:** Semua fitur kompleks seperti pembuatan laporan PDF, CSV, dan algoritma UI untuk Digital Twin akan tetap berjalan 100% normal tanpa perlu diubah!

---

## 🚀 2. Menjalankan Backend (Server Asli)

Sebelum UI bisa menyambung, pastikan Backend Anda sedang berjalan.

1. **Jalankan Infrastruktur Dasar (MongoDB & MQTT)**
   Pastikan layanan MongoDB lokal berjalan (atau siapkan URI MongoDB Atlas pada `backend/.env`). MongoDB lokal pada port 27017 digunakan secara default.

   Jalankan broker Mosquitto lokal di port 1883 untuk koneksi ESP32.

2. **Jalankan API Server (FastAPI)**
   Buka terminal baru, masuk ke folder `mandor/backend`, instal dependensi, latih model jika belum ada, lalu nyalakan server:
   ```bash
   pip install -r requirements.txt
   python -m app.ai.training
   uvicorn app.main:app --reload --port 8000
   ```
   Pada startup backend membuat database `maestro_cmms`, lima koleksi MongoDB, indeks histori, dan seed mesin jika belum tersedia. Backend berjalan di `http://localhost:8000`.

---

## 💻 3. Langkah-Langkah Koding Frontend (Integrasi)

Ikuti 3 langkah sederhana di bawah ini untuk menyambungkan React Frontend ke Backend.

### Langkah 1: Buat `ApiDataProvider.ts`
Buat *file* baru di `src/services/ApiDataProvider.ts`. File ini harus mengimplementasikan antarmuka `MachineDataProvider` yang sama persis dengan simulasi.

```typescript
import type { MachineDataProvider } from './MachineDataProvider';
import type { Machine, Telemetry, Alert, RootCauseAnalysis } from '../types/machine';

const API_URL = 'http://localhost:8000/api';

export class ApiDataProvider implements MachineDataProvider {
  async getMachines(): Promise<Machine[]> {
    const res = await fetch(`${API_URL}/machines`);
    return res.json();
  }

  async getMachine(id: string): Promise<Machine> {
    const res = await fetch(`${API_URL}/machines/${id}`);
    return res.json();
  }

  async getTelemetry(id: string): Promise<Telemetry[]> {
    const res = await fetch(`${API_URL}/machines/${id}/telemetry`);
    return res.json();
  }

  async getAlerts(): Promise<Alert[]> {
    const res = await fetch(`${API_URL}/alerts`);
    return res.json();
  }

  async getRCA(id: string): Promise<RootCauseAnalysis | null> {
    const res = await fetch(`${API_URL}/machines/${id}/rca`);
    if (res.status === 404) return null;
    return res.json();
  }
  
  // (Lanjutkan untuk metode intervensi dan metrik lainnya)
}

export const apiDataProvider = new ApiDataProvider();
```

### Langkah 2: Buat React Context untuk Provider
Saat ini, komponen-komponen React langsung mengimpor `localDataProvider`. Agar kita bisa beralih (Switch) secara dinamis, buat *file* baru `src/contexts/DataProviderContext.tsx`:

```tsx
import { createContext, useContext, ReactNode } from 'react';
import { localDataProvider } from '../services/LocalDataProvider';
import { apiDataProvider } from '../services/ApiDataProvider';
import type { MachineDataProvider } from '../services/MachineDataProvider';
import { useOutletContext } from 'react-router-dom';

const DataProviderContext = createContext<MachineDataProvider>(localDataProvider);

export const DataProviderWrapper = ({ children, mode }: { children: ReactNode, mode: string }) => {
  // Jika mode = CONNECTED, gunakan apiDataProvider. Jika tidak, simulasi.
  const provider = mode === 'CONNECTED' ? apiDataProvider : localDataProvider;
  
  return (
    <DataProviderContext.Provider value={provider}>
      {children}
    </DataProviderContext.Provider>
  );
};

// Hook kustom untuk digunakan di semua halaman
export const useDataProvider = () => useContext(DataProviderContext);
```

### Langkah 3: Modifikasi Komponen Halaman (Contoh di RCA atau Export)
Terakhir, Anda hanya perlu pergi ke setiap halaman seperti `Alerts.tsx`, `Reports.tsx`, atau `Dashboard.tsx`, dan mengganti baris *import*-nya.

**UBAH INI:**
```typescript
import { localDataProvider } from '../services/LocalDataProvider';

// di dalam komponen:
const machines = await localDataProvider.getMachines();
```

**MENJADI INI:**
```typescript
import { useDataProvider } from '../contexts/DataProviderContext';

// di dalam komponen:
const dataProvider = useDataProvider();
const machines = await dataProvider.getMachines();
```

> [!IMPORTANT]
> Lakukan penggantian ini (`useDataProvider`) di seluruh *file* `.tsx` yang berada di dalam folder `src/pages`. 

---

## 📡 4. Konfigurasi MQTT (Live Streaming Data)

Untuk Digital Twin dan grafik *real-time* yang sangat cepat, melakukan HTTP Fetch (seperti Langkah 3) kurang efisien. Anda sebaiknya menghubungkan Frontend langsung ke MQTT Broker (Mosquitto) menggunakan WebSocket.

**Instalasi MQTT.js di Frontend:**
```bash
npm install mqtt
```

**Buat File `MqttClient.ts`:**
```typescript
import mqtt from 'mqtt';

// Pastikan Mosquitto di backend dikonfigurasi untuk menerima WebSocket (port 9001)
const client = mqtt.connect('ws://localhost:9001'); 

client.on('connect', () => {
  console.log('Terhubung ke Backend MAESTRO MQTT');
  client.subscribe('mandor/telemetry/#'); // Berlangganan ke semua data mesin
});

client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());
  // Tangkap data dan dispatch event agar komponen UI ter-update!
  window.dispatchEvent(new CustomEvent('mandor-live-data', { detail: data }));
});
```

---

## 🎉 Kesimpulan

Setelah Anda melakukan 4 langkah di atas:
1. Tombol **CONNECTED** di pojok kanan atas UI akan berfungsi nyata.
2. Ketika ditekan, UI akan mengambil data dari `http://localhost:8000`.
3. Endpoint prediksi menyimpan pembacaan sensor ke `sensor_readings`, hasil AI ke `predictions`, dan kondisi `WARNING` atau `CRITICAL` ke `alerts`. Intervensi disimpan sebagai dokumen `maintenance_work_orders`.
4. Root Cause Analysis (RCA) akan mengambil analisis asli dari skrip Python di backend Anda.
