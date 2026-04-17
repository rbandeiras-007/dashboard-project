import os
import io
from contextlib import contextmanager
from datetime import date

import pandas as pd
import psycopg
from psycopg.rows import dict_row

from flask import Flask, jsonify, request, send_file, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-change-this")

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        os.getenv("FRONTEND_URL", "")
    ]
)

app.config["SESSION_COOKIE_SAMESITE"] = "None"
app.config["SESSION_COOKIE_SECURE"] = True

@app.get("/api/export/executive-excel")
def export_executive_excel():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    with get_conn() as conn:
        top_clients_sql = """
        SELECT c.client_name, SUM(i.invoice_value) AS total
        FROM clients c
        JOIN orders o ON c.client_id = o.client_id
        JOIN invoices i ON o.order_id = i.order_id
        GROUP BY c.client_name
        ORDER BY total DESC;
        """

        orders_status_sql = """
        SELECT status, COUNT(*) AS total_orders, SUM(order_value) AS total_value
        FROM orders
        GROUP BY status
        ORDER BY total_value DESC;
        """

        revenue_sql = """
        SELECT issued_at::date AS data, SUM(invoice_value) AS total
        FROM invoices
        GROUP BY issued_at::date
        ORDER BY data;
        """

        exceptions_sql = """
        SELECT
            o.order_id,
            c.client_name,
            o.status,
            o.order_value,
            o.expected_date,
            GREATEST(CURRENT_DATE - o.expected_date, 0) AS dias_atraso
        FROM orders o
        JOIN clients c ON c.client_id = o.client_id
        WHERE o.expected_date < CURRENT_DATE
          AND o.status <> 'Faturada'
        ORDER BY dias_atraso DESC;
        """

        top_clients = pd.read_sql(top_clients_sql, conn)
        orders_status = pd.read_sql(orders_status_sql, conn)
        revenue = pd.read_sql(revenue_sql, conn)
        exceptions = pd.read_sql(exceptions_sql, conn)

    output = io.BytesIO()

    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        top_clients.to_excel(writer, sheet_name="Top Clientes", index=False)
        orders_status.to_excel(writer, sheet_name="Faturacao Estado", index=False)
        revenue.to_excel(writer, sheet_name="Evolucao Faturacao", index=False)
        exceptions.to_excel(writer, sheet_name="Excecoes", index=False)

    output.seek(0)

    return send_file(
        output,
        as_attachment=True,
        download_name="dashboard_executivo.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

from flask_cors import CORS
import os
from contextlib import contextmanager
from datetime import date
from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg


DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "dashboard_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "1234"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

DATABASE_URL = os.getenv("DATABASE_URL")
API_PORT = int(os.getenv("API_PORT", "5000"))


@contextmanager
def get_conn():
    conn = None
    try:
        if DATABASE_URL:
            conn = psycopg.connect(DATABASE_URL, sslmode="require")
        else:
            conn = psycopg.connect(**DB_CONFIG, sslmode="require")
        yield conn
    finally:
        if conn is not None:
            conn.close()


def build_where(filters):
    clauses = []
    params = []

    if filters.get("client_id"):
        clauses.append("o.client_id = %s")
        params.append(filters["client_id"])

    if filters.get("order_status"):
        clauses.append("o.status = %s")
        params.append(filters["order_status"])

    if filters.get("project_status"):
        clauses.append("p.status = %s")
        params.append(filters["project_status"])

    if filters.get("technician_id"):
        clauses.append("p.technician_id = %s")
        params.append(filters["technician_id"])

    if filters.get("date_from"):
        clauses.append("o.created_at >= %s")
        params.append(filters["date_from"])

    if filters.get("date_to"):
        clauses.append("o.created_at <= %s")
        params.append(filters["date_to"])

    return clauses, params


def build_where_technical(filters):
    clauses = []
    params = []

    if filters.get("client_id"):
        clauses.append("p.client_id = %s")
        params.append(filters["client_id"])

    if filters.get("project_status"):
        clauses.append("p.status = %s")
        params.append(filters["project_status"])

    if filters.get("technician_id"):
        clauses.append("p.technician_id = %s")
        params.append(filters["technician_id"])

    if filters.get("date_from"):
        clauses.append("p.expected_end_date >= %s")
        params.append(filters["date_from"])

    if filters.get("date_to"):
        clauses.append("p.expected_end_date <= %s")
        params.append(filters["date_to"])

    return clauses, params


def rows_to_list(rows):
    return [dict(r) for r in rows]

@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})

def require_auth(allowed_roles=None):
    user = session.get("user")
    if not user:
        return None, (jsonify({"error": "Não autenticado."}), 401)

    if allowed_roles and user.get("role") not in allowed_roles:
        return None, (jsonify({"error": "Sem permissão."}), 403)

    return user, None

@app.post("/api/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email e palavra-passe são obrigatórios."}), 400

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""
                SELECT user_id, full_name, email, password_hash, role, is_active
                FROM users
                WHERE LOWER(email) = %s
                LIMIT 1;
            """, (email,))
            user = cur.fetchone()

    if not user:
        return jsonify({"error": "Credenciais inválidas."}), 401

    if not user["is_active"]:
        return jsonify({"error": "Utilizador inativo."}), 403

    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Credenciais inválidas."}), 401

    session["user"] = {
        "user_id": user["user_id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "role": user["role"],
    }

    return jsonify({
        "message": "Login efetuado com sucesso.",
        "user": session["user"]
    })

@app.get("/api/me")
def me():
    user = session.get("user")
    if not user:
        return jsonify({"authenticated": False}), 401

    return jsonify({
        "authenticated": True,
        "user": user
    })


@app.post("/api/logout")
def logout():
    session.pop("user", None)
    return jsonify({"message": "Logout efetuado com sucesso."})

@app.get("/api/filters")
def filters():
    user, error = require_auth(["admin", "gestao", "tecnico"])
    if error:
        return error

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT client_id, client_name FROM clients ORDER BY client_name;")
            clients = cur.fetchall()

            cur.execute("SELECT DISTINCT status FROM orders ORDER BY status;")
            order_statuses = cur.fetchall()

            cur.execute("SELECT DISTINCT status FROM projects ORDER BY status;")
            project_statuses = cur.fetchall()

            cur.execute("""
                SELECT technician_id, technician_name, team
                FROM technicians
                ORDER BY technician_name;
            """)
            technicians = cur.fetchall()

    return jsonify({
        "clients": rows_to_list(clients),
        "order_statuses": [r["status"] for r in order_statuses],
        "project_statuses": [r["status"] for r in project_statuses],
        "technicians": rows_to_list(technicians),
    })

@app.get("/api/executive/summary")
def executive_summary():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    order_status = request.args.get("order_status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "order_status": order_status,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            COALESCE(SUM(o.order_value), 0) AS total_order_value,
            COUNT(*) AS total_orders,
            COUNT(DISTINCT o.client_id) AS total_clients,
            COALESCE(SUM(CASE WHEN i.invoice_id IS NOT NULL THEN o.order_value ELSE 0 END), 0) AS billed_value,
            COUNT(*) FILTER (
                WHERE o.expected_date < CURRENT_DATE
                  AND o.status NOT IN ('Concluída', 'Faturada')
            ) AS late_orders
        FROM orders o
        LEFT JOIN invoices i ON i.order_id = o.order_id
        {where_sql};
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()

    total = float(row["total_order_value"] or 0)
    billed = float(row["billed_value"] or 0)
    rate = (billed / total * 100) if total else 0

    return jsonify({
        "total_order_value": round(total, 2),
        "total_orders": row["total_orders"],
        "total_clients": row["total_clients"],
        "billed_value": round(billed, 2),
        "billing_rate": round(rate, 1),
        "late_orders": row["late_orders"],
    })

@app.get("/api/executive/revenue-trend")
def revenue_trend():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    order_status = request.args.get("order_status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "order_status": order_status,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS day,
            SUM(o.order_value) AS value
        FROM orders o
        {where_sql}
        GROUP BY DATE_TRUNC('month', o.created_at)
        ORDER BY DATE_TRUNC('month', o.created_at);
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/executive/revenue-by-status")
def revenue_by_status():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            o.status,
            SUM(o.order_value) AS value
        FROM orders o
        {where_sql}
        GROUP BY o.status
        ORDER BY SUM(o.order_value) DESC;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/executive/top-clients")
def top_clients():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id")
    order_status = request.args.get("order_status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "order_status": order_status,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            c.client_name,
            SUM(o.order_value) AS value
        FROM orders o
        JOIN clients c ON c.client_id = o.client_id
        {where_sql}
        GROUP BY c.client_name
        ORDER BY value DESC
        LIMIT 10;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/orders/summary")
def orders_summary():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id")
    order_status = request.args.get("order_status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "order_status": order_status,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            COUNT(*) AS total_orders,
            SUM(o.order_value) AS total_value,
            COUNT(DISTINCT o.client_id) AS total_clients,
            SUM(CASE WHEN o.status = 'Atrasado' THEN 1 ELSE 0 END) AS delayed_orders
        FROM orders o
        {where_sql};
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()

    return jsonify(row)

@app.get("/api/executive/orders-by-status")
def orders_by_status():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id")
    order_status = request.args.get("order_status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "order_status": order_status,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            o.status,
            COUNT(*) AS total,
            SUM(o.order_value) AS value
        FROM orders o
        {where_sql}
        GROUP BY o.status
        ORDER BY value DESC;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/executive/funnel")
def funnel():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            status,
            COUNT(*) AS qty
        FROM orders o
        {where_sql}
        GROUP BY status
        ORDER BY CASE status
            WHEN 'Nova' THEN 1
            WHEN 'Em preparação' THEN 2
            WHEN 'Expedida' THEN 3
            WHEN 'Concluída' THEN 4
            WHEN 'Faturada' THEN 5
            ELSE 99
        END;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))


@app.get("/api/executive/exceptions")
def exceptions():
    user, error = require_auth(["admin", "gestao"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where({
        "client_id": client_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    clauses.append("o.expected_date < CURRENT_DATE")
    clauses.append("o.status NOT IN ('Concluída', 'Faturada')")

    where_sql = f"WHERE {' AND '.join(clauses)}"

    sql = f"""
        SELECT
            o.order_id,
            c.client_name,
            o.status,
            o.order_value,
            o.expected_date,
            (CURRENT_DATE - o.expected_date) AS days_late
        FROM orders o
        JOIN clients c ON c.client_id = o.client_id
        {where_sql}
        ORDER BY days_late DESC, o.order_value DESC
        LIMIT 20;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))


@app.get("/api/technical/summary")
def technical_summary():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            COUNT(*) FILTER (WHERE p.status IN ('Em curso', 'Planeado')) AS active_projects,
            COUNT(*) FILTER (WHERE p.risk_level IN ('Alto', 'Crítico')) AS at_risk_projects,
            ROUND(
                100.0 * COUNT(*) FILTER (WHERE p.sla_status = 'Cumprido') / NULLIF(COUNT(*), 0),
                1
            ) AS sla_rate,
            COALESCE(SUM(p.backlog_hours), 0) AS total_backlog_hours
        FROM projects p
        {where_sql};
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()

    return jsonify({
        "active_projects": row["active_projects"] or 0,
        "at_risk_projects": row["at_risk_projects"] or 0,
        "sla_rate": float(row["sla_rate"] or 0),
        "total_backlog_hours": float(row["total_backlog_hours"] or 0),
    })

@app.get("/api/technical/projects-by-status")
def projects_by_status():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            p.status,
            COUNT(*) AS qty
        FROM projects p
        {where_sql}
        GROUP BY p.status
        ORDER BY CASE p.status
            WHEN 'Planeado' THEN 1
            WHEN 'Em curso' THEN 2
            WHEN 'Em risco' THEN 3
            WHEN 'Atrasado' THEN 4
            WHEN 'Concluído' THEN 5
            ELSE 99
        END;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/technical/planned-vs-actual")
def planned_vs_actual():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            p.project_name,
            p.planned_hours,
            p.actual_hours
        FROM projects p
        {where_sql}
        ORDER BY (p.actual_hours - p.planned_hours) DESC
        LIMIT 10;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/technical/workload-by-technician")
def workload_by_technician():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            t.technician_name,
            COALESCE(SUM(p.backlog_hours), 0) AS backlog_hours
        FROM projects p
        JOIN technicians t ON t.technician_id = p.technician_id
        {where_sql}
        GROUP BY t.technician_name
        ORDER BY backlog_hours DESC;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/technical/delay-reasons")
def delay_reasons():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    sql = f"""
        SELECT
            COALESCE(p.delay_reason, 'Sem motivo') AS delay_reason,
            COUNT(*) AS qty
        FROM projects p
        {where_sql}
        GROUP BY p.delay_reason
        ORDER BY qty DESC;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))

@app.get("/api/technical/at-risk-projects")
def at_risk_projects():
    user, error = require_auth(["admin", "tecnico"])
    if error:
        return error

    client_id = request.args.get("client_id", type=int)
    project_status = request.args.get("project_status")
    technician_id = request.args.get("technician_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    clauses, params = build_where_technical({
        "client_id": client_id,
        "project_status": project_status,
        "technician_id": technician_id,
        "date_from": date_from,
        "date_to": date_to,
    })

    clauses.append("(p.risk_level IN ('Alto', 'Crítico') OR p.status = 'Atrasado')")

    where_sql = f"WHERE {' AND '.join(clauses)}"

    sql = f"""
        SELECT
            p.project_id,
            p.project_name,
            c.client_name,
            t.technician_name,
            p.status,
            p.risk_level,
            p.expected_end_date,
            GREATEST(CURRENT_DATE - p.expected_end_date, 0) AS days_late,
            p.progress_pct,
            p.delay_reason
        FROM projects p
        JOIN clients c ON c.client_id = p.client_id
        JOIN technicians t ON t.technician_id = p.technician_id
        {where_sql}
        ORDER BY days_late DESC, p.progress_pct ASC
        LIMIT 20;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return jsonify(rows_to_list(rows))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=API_PORT, debug=False)
