import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from .api import ai
from .api import chatbot
from .api import machines
from .database.connection import initialize_database
from .mqtt.client import mqtt_client


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    mqtt_client.start()
    try:
        yield
    finally:
        mqtt_client.stop()


app = FastAPI(title="MAESTRO API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(machines.router, prefix="/api")
app.include_router(ai.router, prefix="/api/ai", tags=["AI predictions"])
app.include_router(chatbot.router, prefix="/api/chatbot", tags=["Maintenance chatbot"])


@app.exception_handler(PyMongoError)
async def mongodb_error_handler(_, error: PyMongoError):
    return JSONResponse(
        status_code=503,
        content={"detail": f"MongoDB is unavailable: {error.__class__.__name__}"},
    )

@app.get("/")
def read_root():
    return {"status": "online", "service": "MAESTRO Backend"}

@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket):
    await websocket.accept()
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    mqtt_client.add_telemetry_listener(loop, queue)
    try:
        while True:
            telemetry = await queue.get()
            await websocket.send_json(telemetry)
    except WebSocketDisconnect:
        pass
    finally:
        mqtt_client.remove_telemetry_listener(loop, queue)
