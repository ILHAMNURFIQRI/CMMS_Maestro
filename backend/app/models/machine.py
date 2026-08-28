from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database.connection import Base
import datetime

class Machine(Base):
    __tablename__ = "machines"

    id = Column(String(10), primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    type = Column(String(50), nullable=False)
    line = Column(String(50))
    area = Column(String(50))
    status = Column(String(20), default='NORMAL')
    health_score = Column(Integer, default=100)
    data_source = Column(String(20), default='SIMULATION')
    mqtt_status = Column(String(20), default='DISCONNECTED')

    telemetry = relationship("Telemetry", back_populates="machine")

class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_id = Column(String(10), ForeignKey("machines.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    temperature = Column(Float)
    vibration = Column(Float)
    current = Column(Float)
    rpm = Column(Float)
    power = Column(Float)

    machine = relationship("Machine", back_populates="telemetry")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(String(50), primary_key=True)
    machine_id = Column(String(10), ForeignKey("machines.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    type = Column(String(20))
    severity = Column(Integer)
    message = Column(Text)
    root_cause = Column(String(100))
    confidence = Column(Integer)
    acknowledged = Column(Boolean, default=False)

class Intervention(Base):
    __tablename__ = "interventions"
    
    id = Column(String(50), primary_key=True)
    machine_id = Column(String(10), ForeignKey("machines.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    action = Column(String(100))
    target_value = Column(Float)
    actual_value = Column(Float)
    verified = Column(Boolean, default=False)
    status = Column(String(20), default='PENDING')

class RcaResult(Base):
    __tablename__ = "rca_results"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String(10), ForeignKey("machines.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    probable_cause = Column(String(100))
    confidence = Column(Integer)
    evidence = Column(Text)
    recommended_action = Column(Text)
