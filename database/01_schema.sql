
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS technicians CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

CREATE TABLE clients (
    client_id SERIAL PRIMARY KEY,
    client_name VARCHAR(120) NOT NULL,
    industry VARCHAR(80),
    city VARCHAR(80),
    created_at DATE DEFAULT CURRENT_DATE
);

CREATE TABLE technicians (
    technician_id SERIAL PRIMARY KEY,
    technician_name VARCHAR(120) NOT NULL,
    team VARCHAR(80) NOT NULL,
    role_name VARCHAR(80) NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES clients(client_id),
    created_at DATE NOT NULL,
    expected_date DATE NOT NULL,
    status VARCHAR(40) NOT NULL,
    order_value NUMERIC(12,2) NOT NULL,
    responsible VARCHAR(120)
);

CREATE TABLE invoices (
    invoice_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(order_id),
    issued_at DATE NOT NULL,
    invoice_value NUMERIC(12,2) NOT NULL,
    payment_status VARCHAR(40) NOT NULL
);

CREATE TABLE projects (
    project_id SERIAL PRIMARY KEY,
    client_id INT NOT NULL REFERENCES clients(client_id),
    technician_id INT NOT NULL REFERENCES technicians(technician_id),
    project_name VARCHAR(160) NOT NULL,
    status VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    expected_end_date DATE NOT NULL,
    actual_end_date DATE,
    progress_pct INT NOT NULL CHECK (progress_pct BETWEEN 0 AND 100),
    planned_hours NUMERIC(10,2) NOT NULL,
    actual_hours NUMERIC(10,2) NOT NULL,
    backlog_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
    sla_status VARCHAR(20) NOT NULL,
    delay_reason VARCHAR(80)
);

CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_technician ON projects(technician_id);
CREATE INDEX idx_projects_expected_end ON projects(expected_end_date);
