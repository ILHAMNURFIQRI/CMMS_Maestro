# MAESTRO

**MAESTRO (Manufacturing Execution & Synchronization Tracker)** adalah prototipe platform CMMS dan smart manufacturing untuk memantau kondisi mesin, mengelola pekerjaan pemeliharaan dan pesanan produksi, serta menghubungkan telemetri IoT dengan analitik berbasis AI.

Platform menyediakan dua cara penggunaan:

- **Standalone Demo** — aplikasi web berjalan tanpa backend, menggunakan data simulasi dan penyimpanan browser.
- **Connected** — frontend terhubung ke API FastAPI, MongoDB, dan broker MQTT untuk integrasi telemetri mesin.

## Fitur

- Dashboard dan pemantauan armada serta detail kondisi mesin.
- Peringatan, riwayat telemetri, energi, digital twin, dan analisis akar masalah (RCA).
- Prediksi kondisi mesin menggunakan model klasifikasi Random Forest.
- Maintenance Work Orders dengan alur peninjauan dan pelaksanaan berdasarkan peran.
- Production Orders untuk permintaan pelanggan, penjadwalan, dan pencatatan produksi.
- Chatbot pemeliharaan berbasis retrieval-augmented generation (RAG) dengan endpoint LLM yang kompatibel dengan OpenAI.
- Integrasi MQTT untuk telemetri, termasuk prototipe mesin M-16/Conveyor-01.
- Laporan yang dapat diekspor dari aplikasi.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn |
| Database | MongoDB |
| IoT | MQTT dengan Paho MQTT |
| Prediksi | scikit-learn |

## Menjalankan aplikasi

### Standalone Demo

Mode ini adalah cara tercepat untuk mencoba UI tanpa MongoDB atau backend.

```powershell
cd frontend
npm install
npm run dev
```

Buka `http://localhost:5173` dan pilih **STANDALONE DEMO** pada pemilih mode aplikasi.

Prasyarat frontend: Node.js `20.19+`, `22.12+`, atau `24+`.

### Connected Mode

Mode ini memerlukan MongoDB. MQTT broker diperlukan jika ingin menghubungkan telemetri perangkat. Jalankan perintah berikut dari root repository.

1. Siapkan backend:

   ```powershell
   cd backend
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

2. Atur nilai yang sesuai untuk lingkungan lokal di `backend/.env`, setidaknya `MONGODB_URI`, `MONGODB_DATABASE`, `AUTH_BOOTSTRAP_EMAIL`, dan `AUTH_BOOTSTRAP_PASSWORD`. Jangan commit file `.env` atau kredensial.

3. Jika menggunakan fitur prediksi, latih model lokal:

   ```powershell
   python -m app.ai.training
   ```

4. Jalankan API:

   ```powershell
   uvicorn app.main:app --reload
   ```

   API berjalan di `http://localhost:8000`; dokumentasi endpoint tersedia di `http://localhost:8000/docs`.

5. Di terminal lain, atur frontend agar menggunakan API lokal, lalu jalankan:

   ```powershell
   cd frontend
   Copy-Item .env.example .env
   npm install
   npm run dev
   ```

   Ubah `VITE_API_URL` di `frontend/.env` menjadi `http://localhost:8000`, kemudian buka `http://localhost:5173` dan pilih **CONNECTED**.

## Struktur repository

```text
backend/    API FastAPI, autentikasi, AI, chatbot, dan integrasi MQTT
database/   Skema SQL lama; backend saat ini menggunakan MongoDB
frontend/   Aplikasi web React dan TypeScript
mqtt/       Contoh dan konfigurasi integrasi perangkat MQTT
HOSTING.md  Panduan deployment Vercel, Render, dan MongoDB Atlas
```

## Dokumentasi tambahan

- [HOSTING.md](./HOSTING.md) — panduan deployment.
- [TUTOR_DEK.md](./TUTOR_DEK.md) — arsitektur dan panduan penggunaan lebih lengkap.
- [TUTOR_BACKEND_DEK.md](./TUTOR_BACKEND_DEK.md) — panduan integrasi frontend dan backend.
- [Contoh ESP32](./mqtt/config/ESP32_EXAMPLE.md) — contoh integrasi perangkat.

## Catatan penggunaan

MAESTRO merupakan prototipe untuk demonstrasi dan pengembangan, bukan sistem keselamatan atau diagnosis mesin yang tervalidasi. Hasil prediksi dan chatbot bersifat bantuan, bukan pengganti prosedur operasional, manual OEM, atau penilaian teknisi yang berkualifikasi. Validasi batas mesin, perangkat keras, keamanan, dan konfigurasi deployment sebelum digunakan dengan peralatan atau data operasional.

Mode demo dan data simulasi tidak sama dengan autentikasi maupun data operasional backend. Simpan rahasia hanya di konfigurasi lingkungan server dan gunakan broker MQTT privat dengan autentikasi serta TLS untuk deployment.
