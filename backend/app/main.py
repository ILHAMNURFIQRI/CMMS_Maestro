from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import machines
from .mqtt.client import mqtt_client

app = FastAPI(title="MANDOR API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(machines.router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    # Start MQTT Client
    mqtt_client.start()

@app.on_event("shutdown")
async def shutdown_event():
    mqtt_client.stop()

@app.get("/")
def read_root():
    return {"status": "online", "service": "MANDOR Backend"}
