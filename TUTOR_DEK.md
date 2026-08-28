# MANDOR - Machine Analytics & Network Diagnostic Operations Router

MANDOR is a full-stack Smart Manufacturing / Predictive Maintenance / IoT / Edge AI / Digital Twin platform prototype for monitoring a fleet of industrial machines.

## Architecture

MANDOR follows a dual-operating mode architecture: **LOCAL-FIRST, BACKEND-OPTIONAL, HARDWARE-READY**.

### 1. Standalone Demo Mode
Fully functional in the browser without any backend required. It uses:
- React + Vite + Tailwind CSS for UI
- `localStorage` for data persistence
- Simulated MQTT behavior for the M-16 physical machine
- Local Rule-Based AI engines (Health, Anomaly Detection, RCA, Decision)

### 2. Connected Mode
Integrates real-world infrastructure:
- **Frontend**: React + Vite
- **Backend**: Python + FastAPI
- **Database**: MySQL (native)
- **MQTT**: Mosquitto Broker (native) for communication with the physical M-16 ESP32 Conveyor

## Prerequisites
- Node.js (v18+)

**For Connected Mode Only:**
- Python (3.10+)
- MySQL Server (native)
- Mosquitto MQTT Broker (native)

## Installation & Running

### Option A: Standalone Demo Mode (No Backend Required)
Run this mode to immediately test and demonstrate the UI, simulation, and closed-loop behavior in the browser.

```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser. Ensure the Mode Switcher in the top right is set to **STANDALONE DEMO**.

### Option B: Connected Mode

#### 1. Setup Database (MySQL)
Ensure MySQL is running locally on port 3306.
```bash
mysql -u root -p < database/schema.sql
# Optional: seed data
# mysql -u root -p < database/seed.sql
```

#### 2. Setup MQTT Broker
Ensure Mosquitto is installed and running locally on port 1883.

#### 3. Start Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
# source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and toggle the Mode Switcher to **CONNECTED**.

## Environment Variables
Copy the `.env.example` file in the `backend` directory to `.env` and configure your credentials.

## ESP32 Integration (M-16)
The M-16 machine acts as the physical prototype (Conveyor-01). 
- Connects via MQTT to `localhost:1883`
- Publishes telemetry to `mandor/m16/telemetry`
- Subscribes to commands on `mandor/m16/command`

See `mqtt/config/ESP32_EXAMPLE.md` (to be created) for the C++ code example for the ESP32.

## How to trigger demo scenarios
In both modes, use the **SIMULATION CONTROL CENTER** in the UI to trigger specific scenarios (e.g., Overload, High Vibration, RPM Drop) on selected machines to demonstrate Anomaly Detection and Root Cause Analysis.
