import os
import psycopg2
from werkzeug.security import generate_password_hash

DB_CONFIG = {
    "dbname": os.getenv("DB_NAME", "dashboard_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", "1234"),
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

def create_user(full_name: str, email: str, password: str, role: str) -> None:
    password_hash = generate_password_hash(password)

    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO users (full_name, email, password_hash, role, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                    ON CONFLICT (email) DO UPDATE
                    SET full_name = EXCLUDED.full_name,
                        password_hash = EXCLUDED.password_hash,
                        role = EXCLUDED.role,
                        is_active = TRUE;
                """, (full_name, email.lower(), password_hash, role))
    finally:
        conn.close()

if __name__ == "__main__":
    create_user("Administrador", "admin@dashboard.local", "Admin123!", "admin")
    create_user("Gestão", "gestao@dashboard.local", "Gestao123!", "gestao")
    create_user("Técnico", "tecnico@dashboard.local", "Tecnico123!", "tecnico")
    print("Utilizadores criados/atualizados com sucesso.")