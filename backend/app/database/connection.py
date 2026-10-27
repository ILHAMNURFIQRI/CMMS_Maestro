import atexit
import os
from pathlib import Path
from typing import Any, Generator

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "maestro_cmms")
MONGO_CLIENT = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    tz_aware=True,
)
atexit.register(MONGO_CLIENT.close)
DATABASE: Database[dict[str, Any]] = MONGO_CLIENT[MONGODB_DATABASE]

INITIAL_MACHINES = [
    ("M-01", "CNC LATHE", "Machining", "Line A", "Zone 1", "SIMULATION"),
    ("M-02", "CNC MILL", "Machining", "Line A", "Zone 1", "SIMULATION"),
    ("M-03", "PRESS", "Forming", "Line A", "Zone 2", "SIMULATION"),
    ("M-04", "GRINDER", "Finishing", "Line B", "Zone 2", "SIMULATION"),
    ("M-05", "ASSEMBLY UNIT", "Assembly", "Line B", "Zone 3", "SIMULATION"),
    ("M-06", "DRILLING UNIT", "Machining", "Line B", "Zone 1", "SIMULATION"),
    ("M-07", "MILLING UNIT", "Machining", "Line C", "Zone 1", "SIMULATION"),
    ("M-08", "ROBOTIC CELL", "Assembly", "Line C", "Zone 3", "SIMULATION"),
    ("M-09", "CUTTING UNIT", "Machining", "Line C", "Zone 2", "SIMULATION"),
    ("M-10", "POLISHING UNIT", "Finishing", "Line D", "Zone 2", "SIMULATION"),
    ("M-11", "PACKAGING UNIT", "Packaging", "Line D", "Zone 4", "SIMULATION"),
    ("M-12", "ASSEMBLY LINE", "Assembly", "Line D", "Zone 3", "SIMULATION"),
    ("M-13", "MACHINING UNIT", "Machining", "Line E", "Zone 1", "SIMULATION"),
    ("M-14", "INSPECTION UNIT", "Inspection", "Line E", "Zone 4", "SIMULATION"),
    ("M-15", "PROCESS UNIT", "Processing", "Line E", "Zone 2", "SIMULATION"),
    ("M-16", "CONVEYOR-01", "Transport", "Main", "Logistics", "MQTT"),
]


def get_database() -> Database[dict[str, Any]]:
    MONGO_CLIENT.admin.command("ping")
    return DATABASE


def get_db() -> Generator[Database[dict[str, Any]], None, None]:
    yield get_database()


def serialize_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if document is None:
        return None
    result = dict(document)
    if "_id" in result:
        result["_id"] = str(result["_id"])
    return result


def initialize_database() -> None:
    MONGO_CLIENT.admin.command("ping")
    DATABASE.sensor_readings.create_index(
        [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
        name="machine_sensor_timestamp",
    )
    DATABASE.predictions.create_index(
        [("machine_id", ASCENDING), ("evaluated_at", DESCENDING)],
        name="machine_prediction_timestamp",
    )
    DATABASE.alerts.create_index(
        [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
        name="machine_alert_timestamp",
    )
    DATABASE.maintenance_work_orders.create_index(
        [("machine_id", ASCENDING), ("timestamp", DESCENDING)],
        name="machine_work_order_timestamp",
    )

    for machine_id, name, machine_type, line, area, data_source in INITIAL_MACHINES:
        DATABASE.machines.update_one(
            {"_id": machine_id},
            {
                "$setOnInsert": {
                    "name": name,
                    "type": machine_type,
                    "line": line,
                    "area": area,
                    "status": "NORMAL",
                    "health_score": 100,
                    "data_source": data_source,
                    "mqtt_status": "DISCONNECTED",
                }
            },
            upsert=True,
        )
