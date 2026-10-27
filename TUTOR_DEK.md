# MAESTRO - Manufacturing Execution & Synchronization Tracker

MAESTRO is a full-stack Smart Manufacturing / Predictive Maintenance / IoT / Edge AI / Digital Twin platform prototype for monitoring a fleet of industrial machines.

## Architecture

MAESTRO follows a dual-operating mode architecture: **LOCAL-FIRST, BACKEND-OPTIONAL, HARDWARE-READY**.

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
- **Database**: MongoDB
- **MQTT**: Mosquitto Broker (native) for communication with the physical M-16 ESP32 Conveyor

## Prerequisites
- Node.js (v18+)

**For Connected Mode Only:**
- Python (3.10+)
- MongoDB Server (local or cloud)
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

#### 1. Setup Database (MongoDB)
Start a local MongoDB server or create a MongoDB Atlas cluster. Configure
`MONGODB_URI` and `MONGODB_DATABASE` in `backend/.env`. On startup, the backend
creates the collections and indexes and seeds the machine fleet if machines
have not been added already.

The database is `maestro_cmms` by default and uses five collections:

- `machines`: machine identity, line, area, current status, and health score.
- `sensor_readings`: manual and MQTT sensor readings, source, and timestamp.
- `predictions`: AI result, class probabilities, model, and linked reading ID.
- `alerts`: warning and critical predictions requiring follow-up.
- `maintenance_work_orders`: maintenance interventions and their status.

The backend creates timestamp indexes for sensor readings, predictions, alerts,
and work orders. Sensor and prediction history is retained; there is no TTL
deletion configured.

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
python -m app.ai.training
uvicorn app.main:app --reload
```

Training reads the three sensor datasets in `backend/app/ai/datasets` and writes a local model artifact. The training features follow the source dataset order: current, temperature, RPM, and vibration. Validation reserves the final 20% of each class file as a chronological holdout; these scores describe only the supplied recordings and are not a guarantee of performance on other machines. The model artifact is generated locally and is not committed.

The three CSV files are from [AlChakim/MANDOR_AI_Datasheet](https://github.com/AlChakim/MANDOR_AI_Datasheet), used with permission. Rows are labeled by source file (normal, warning, or critical), and the four features are read from zero-based CSV columns 2, 3, 5, and 6.

Once the backend is running, send a four-sensor reading to `POST http://localhost:8000/api/ai/predict`:

```json
{
  "current": 0.45,
  "temperature": 32.2,
  "rpm": 40.0,
  "vibration": 10.0
}
```

The same flow is available from the frontend at **AI Prediction** (`/predictions`). Choose a machine, enter current, temperature, RPM, and vibration, then select **PREDIKSI KONDISI MESIN**. The page displays the final condition, raw classifier confidence, decision factors, status-based follow-up guidance, and prediction history from MongoDB. For M-16 only, the final status is the most severe of the Random Forest class, a temperature screening derived from the supplied datasets (WARNING at 36.0 °C, CRITICAL at 38.9 °C), and current screening based on the user-provided JGY370 values (WARNING above 0.6 A, CRITICAL at 0.8 A or above). Readings below 0.4 A are flagged for verification but do not lower or directly determine status. These are prototype screening rules, not validated OEM/safety limits; the three datasets do not establish that the thresholds are safe or calibrated for this specific motor. The voltage is assumed nominally 12 V for the stored power calculation, but voltage is not a prediction input. RPM/vibration remain evaluated by the classifier and their calibration units for this motor are not confirmed. Confidence and class probabilities describe the unadjusted classifier result, not certainty or the final rule-based status. Neither method diagnoses root cause or predicts downtime; follow site SOP and qualified technicians.

#### 4. Maintenance Chatbot (RAG)

The **Maintenance Chatbot** page (`/chatbot`) retrieves relevant passages from Markdown or text files in `backend/app/chatbot/knowledge`, then sends those passages and the recent conversation to an OpenAI-compatible chat completion endpoint. Each response can generate up to 2,048 tokens; if the provider reports that an answer hit this limit, the backend asks it to continue up to two times. The starter guide documents MAESTRO's model limits and safe consultation workflow. Add only approved machine manuals, SOPs, alarm guides, or maintenance notes to this folder to ground answers in your own equipment documentation. Retrieved references are used internally to ground answers and are not displayed in the chat.

To improve answers to project-specific questions:

1. Put approved project guides, SOPs, and equipment documentation in
   `backend/app/chatbot/knowledge` as `.md` or `.txt` files.
2. Organize each file with clear headings and short sections. Include the
   exact terms users may ask about (for example, machine IDs, sensor names,
   alarm names, and maintenance terminology).
3. Keep facts that change, such as the number of registered machines or latest
   sensor readings, in MongoDB rather than copying them into documentation.
   The chatbot answers supported live-data questions directly from MongoDB.
4. Ask representative questions in the chatbot and improve the relevant
   documents when an answer is missing context. Knowledge files are read when
   each question is handled, so adding or editing a file does not require
   model training or a backend restart.

This is retrieval-augmented generation (RAG), not fine-tuning: the chatbot
retrieves relevant project knowledge for each question, but does not learn
permanently from chats. Fine-tuning a model is a separate process requiring
curated example conversations, training infrastructure, and a model/provider
that supports it; it is usually unnecessary for basic project questions.

By default, the chatbot uses Ollama locally, so prompts and optional machine context are not sent to a cloud service:

```powershell
ollama pull qwen2.5:3b
```

Copy `backend/.env.example` to `backend/.env` if needed. The default `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` values target Ollama at `http://localhost:11434/v1`. Ollama Desktop generally starts its local service automatically; otherwise start it with `ollama serve`. To use another OpenAI-compatible provider, explicitly set those three variables in `backend/.env`; prompts and selected machine data will then be sent to that provider, so review its privacy and retention terms first. Never place provider credentials in frontend code.

The chatbot defaults to **Semua mesin**, adding each registered machine's latest sensor reading, prediction, and work order as read-only context; this lets users ask fleet-wide questions or name a machine in their prompt. Select one machine in **CAKUPAN MESIN** to send context only for that machine. If using a cloud LLM provider, fleet or selected machine data is sent to that provider along with the prompt; review its privacy and retention terms. The current conversation is saved in this browser's local storage and remains available across page navigation and browser restarts. Select **CHAT BARU** to clear it and begin again. This history is local to the browser and is not synchronized to MongoDB or other devices; do not enter credentials or sensitive data. The chatbot is restricted to MAESTRO/CMMS and related maintenance topics; code-generation requests and unrelated general questions are refused before contacting the LLM provider. The chatbot does not create work orders, change MongoDB records, or control equipment. Its answer is advisory; follow the applicable OEM manual, site SOP, and qualified technician's assessment. The backend API has no user authentication, so keep it on a trusted development network and do not expose it publicly without adding authentication and request controls.

#### 5. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and toggle the Mode Switcher to **CONNECTED**.

## Environment Variables
Copy the `.env.example` file in the `backend` directory to `.env` and configure your credentials.
For MongoDB, set for example `MONGODB_URI=mongodb://localhost:27017` and
`MONGODB_DATABASE=maestro_cmms`. The previous MySQL settings are no longer used
by the FastAPI backend.

## ESP32 Integration (M-16)
The M-16 machine acts as the physical prototype (Conveyor-01). 
- Connects via MQTT to `localhost:1883`
- Publishes telemetry to `mandor/m16/telemetry`
- Subscribes to commands on `mandor/m16/command`

See `mqtt/config/ESP32_EXAMPLE.md` (to be created) for the C++ code example for the ESP32.

## How to trigger demo scenarios
In both modes, use the **SIMULATION CONTROL CENTER** in the UI to trigger specific scenarios (e.g., Overload, High Vibration, RPM Drop) on selected machines to demonstrate Anomaly Detection and Root Cause Analysis.
