CREATE DATABASE IF NOT EXISTS mandor;
USE mandor;

CREATE TABLE IF NOT EXISTS machines (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    line VARCHAR(50),
    area VARCHAR(50),
    status VARCHAR(20) DEFAULT 'NORMAL',
    health_score INT DEFAULT 100,
    data_source VARCHAR(20) DEFAULT 'SIMULATION',
    mqtt_status VARCHAR(20) DEFAULT 'DISCONNECTED'
);

CREATE TABLE IF NOT EXISTS telemetry (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(10) NOT NULL,
    timestamp DATETIME NOT NULL,
    temperature FLOAT,
    vibration FLOAT,
    current FLOAT,
    rpm FLOAT,
    power FLOAT,
    FOREIGN KEY (machine_id) REFERENCES machines(id)
);

CREATE INDEX idx_telemetry_machine_time ON telemetry(machine_id, timestamp);

CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(50) PRIMARY KEY,
    machine_id VARCHAR(10) NOT NULL,
    timestamp DATETIME NOT NULL,
    type VARCHAR(20) NOT NULL,
    severity INT,
    message TEXT,
    root_cause VARCHAR(100),
    confidence INT,
    acknowledged BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (machine_id) REFERENCES machines(id)
);

CREATE TABLE IF NOT EXISTS interventions (
    id VARCHAR(50) PRIMARY KEY,
    machine_id VARCHAR(10) NOT NULL,
    timestamp DATETIME NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_value FLOAT,
    actual_value FLOAT,
    verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'PENDING',
    FOREIGN KEY (machine_id) REFERENCES machines(id)
);

CREATE TABLE IF NOT EXISTS rca_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    machine_id VARCHAR(10) NOT NULL,
    timestamp DATETIME NOT NULL,
    probable_cause VARCHAR(100),
    confidence INT,
    evidence TEXT,
    recommended_action TEXT,
    FOREIGN KEY (machine_id) REFERENCES machines(id)
);

-- Initial Data Seed
INSERT IGNORE INTO machines (id, name, type, line, area, data_source) VALUES
('M-01', 'CNC LATHE', 'Machining', 'Line A', 'Zone 1', 'SIMULATION'),
('M-02', 'CNC MILL', 'Machining', 'Line A', 'Zone 1', 'SIMULATION'),
('M-03', 'PRESS', 'Forming', 'Line A', 'Zone 2', 'SIMULATION'),
('M-04', 'GRINDER', 'Finishing', 'Line B', 'Zone 2', 'SIMULATION'),
('M-05', 'ASSEMBLY UNIT', 'Assembly', 'Line B', 'Zone 3', 'SIMULATION'),
('M-06', 'DRILLING UNIT', 'Machining', 'Line B', 'Zone 1', 'SIMULATION'),
('M-07', 'MILLING UNIT', 'Machining', 'Line C', 'Zone 1', 'SIMULATION'),
('M-08', 'ROBOTIC CELL', 'Assembly', 'Line C', 'Zone 3', 'SIMULATION'),
('M-09', 'CUTTING UNIT', 'Machining', 'Line C', 'Zone 2', 'SIMULATION'),
('M-10', 'POLISHING UNIT', 'Finishing', 'Line D', 'Zone 2', 'SIMULATION'),
('M-11', 'PACKAGING UNIT', 'Packaging', 'Line D', 'Zone 4', 'SIMULATION'),
('M-12', 'ASSEMBLY LINE', 'Assembly', 'Line D', 'Zone 3', 'SIMULATION'),
('M-13', 'MACHINING UNIT', 'Machining', 'Line E', 'Zone 1', 'SIMULATION'),
('M-14', 'INSPECTION UNIT', 'Inspection', 'Line E', 'Zone 4', 'SIMULATION'),
('M-15', 'PROCESS UNIT', 'Processing', 'Line E', 'Zone 2', 'SIMULATION'),
('M-16', 'CONVEYOR-01', 'Transport', 'Main', 'Logistics', 'MQTT');
