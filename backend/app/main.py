import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from .api import auth
from .api import ai
from .api import chatbot
from .api import machines
from .api import maintenance_work_orders
from .api import production_orders
from .auth import SESSION_COOKIE_NAME, initialize_auth, session_digest
from .database.connection import DATABASE, initialize_database
from .mqtt.client import mqtt_client
from .api.production_orders import seed_products


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    initialize_auth(DATABASE)
    seed_products(DATABASE)
    mqtt_client.start()
    try:
        yield
    finally:
        mqtt_client.stop()


app = FastAPI(title="MAESTRO API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.auth_router, prefix="/api")
app.include_router(auth.users_router, prefix="/api")
app.include_router(machines.router, prefix="/api")
app.include_router(maintenance_work_orders.router, prefix="/api")
app.include_router(production_orders.router, prefix="/api")
app.include_router(ai.router, prefix="/api/ai", tags=["AI predictions"])
app.include_router(chatbot.router, prefix="/api/chatbot", tags=["Maintenance chatbot"])
app.include_router(
    chatbot.customer_router,
    prefix="/api/chatbot",
    tags=["Customer Production Order assistant"],
)


@app.exception_handler(PyMongoError)
async def mongodb_error_handler(_, error: PyMongoError):
    return JSONResponse(
        status_code=503,
        content={"detail": f"MongoDB is unavailable: {error.__class__.__name__}"},
    )

@app.get("/")
def read_root():
    return {"status": "online", "service": "MAESTRO Backend"}


@app.get("/health", include_in_schema=False)
def health_check():
    DATABASE.command("ping")
    return {"status": "healthy"}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket):
    token = websocket.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        await websocket.close(code=4401)
        return
    session = DATABASE.auth_sessions.find_one(
        {
            "token_hash": session_digest(token),
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    if session is None:
        await websocket.close(code=4401)
        return
    user = DATABASE.users.find_one({"email": session["email"]})
    if user is None or not user.get("active", True):
        await websocket.close(code=4401)
        return
    if user.get("role") not in {"manager", "operator"}:
        await websocket.close(code=4403)
        return

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
