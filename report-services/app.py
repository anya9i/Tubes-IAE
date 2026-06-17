import os
import time
import psycopg2
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
import requests 

app = Flask(__name__)

# Konfigurasi database PostgreSQL
DB_HOST = os.getenv("DB_HOST", "report-db")
DB_NAME = os.getenv("DB_NAME", "report_db")
DB_USER = os.getenv("DB_USER", "report_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "report_password")
DB_PORT = os.getenv("DB_PORT", "5432")

# URL service lain yang akan dipanggil
ORDER_SERVICE_URL = os.getenv("ORDER_SERVICE_URL", "http://order-service:3001")
PAYMENT_SERVICE_URL = os.getenv("PAYMENT_SERVICE_URL", "http://payment-service:3004")  # FIX: port 3002 → 3004

conn = None

def connect_with_retry(retries=20, delay=3):
    global conn
    for attempt in range(1, retries + 1):
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                port=DB_PORT
            )
            print("Report Service berhasil terhubung ke PostgreSQL")
            return
        except Exception as error:
            print(f"Menunggu PostgreSQL siap... percobaan {attempt}")
            time.sleep(delay)
    raise Exception("Report Service gagal terhubung ke PostgreSQL")

def init_database():
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_reports (
            id SERIAL PRIMARY KEY,
            report_date DATE NOT NULL,
            total_orders INT DEFAULT 0,
            total_revenue INT DEFAULT 0,
            total_payments INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(report_date)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS popular_menus (
            id SERIAL PRIMARY KEY,
            menu_name VARCHAR(100) NOT NULL,
            total_sold INT DEFAULT 0,
            total_revenue INT DEFAULT 0,
            report_date DATE NOT NULL,
            UNIQUE(menu_name, report_date)
        )
    """)
    
    conn.commit()
    cursor.close()
    print("Database report service siap")

def fetch_json(url):
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return None
        return response.json()
    except Exception as e:
        print(f"Gagal fetch {url}: {e}")
        return None

# =========================================================================
# OPERASIONAL 6 FUNCTION / METHOD REST API
# =========================================================================

# [METHOD 1] GET: Health Check Service
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "service": "report-service",
        "language": "Python",
        "framework": "Flask",
        "database": "postgresql",
        "status": "running"
    })

# [METHOD 2] GET: Sinkronisasi dan Tampil Laporan Harian
@app.route("/report/daily", methods=["GET"])
def get_daily_report():
    try:
        date = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

        order_data = fetch_json(f"{ORDER_SERVICE_URL}/orders")
        payment_data = fetch_json(f"{PAYMENT_SERVICE_URL}/payments")

        order_list = order_data if isinstance(order_data, list) else (order_data.get("data", []) if order_data else [])
        payment_list = payment_data if isinstance(payment_data, list) else (payment_data.get("data", []) if payment_data else [])

        total_orders = len(order_list)
        total_transactions = len(payment_list)
        total_revenue = sum(float(item.get("amount", 0)) for item in payment_list if isinstance(item, dict))  # FIX: float + isinstance guard

        cursor = conn.cursor()  # FIX: cursor belum didefinisikan sebelumnya
        cursor.execute("""
            INSERT INTO daily_reports (report_date, total_orders, total_revenue, total_payments)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (report_date) DO UPDATE SET
                total_orders = EXCLUDED.total_orders,
                total_revenue = EXCLUDED.total_revenue,
                total_payments = EXCLUDED.total_payments
        """, (date, total_orders, int(total_revenue), total_transactions))

        conn.commit()
        cursor.close()

        return jsonify({
            "service": "report-service",
            "date": date,
            "report": {
                "total_orders": total_orders,
                "total_revenue": int(total_revenue),
                "total_payments": total_transactions
            }
        })

    except Exception as error:
        return jsonify({
            "message": "Gagal mengambil laporan harian",
            "error": str(error)
        }), 500

# [METHOD 3] GET: Menampilkan Data Ringkasan Mingguan
@app.route("/report/weekly", methods=["GET"])
def get_weekly_report():
    try:
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=7)
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT report_date, total_orders, total_revenue, total_payments
            FROM daily_reports
            WHERE report_date BETWEEN %s AND %s
            ORDER BY report_date
        """, (start_date, end_date))
        
        rows = cursor.fetchall()
        cursor.close()
        
        daily_data = []
        total_orders = 0
        total_revenue = 0
        
        for row in rows:
            daily_data.append({
                "date": row[0].strftime("%Y-%m-%d"),
                "total_orders": row[1],
                "total_revenue": row[2],
                "total_payments": row[3]
            })
            total_orders += row[1]
            total_revenue += row[2]
        
        return jsonify({
            "service": "report-service",
            "period": {"start": start_date.strftime("%Y-%m-%d"), "end": end_date.strftime("%Y-%m-%d")},
            "summary": {
                "total_orders_weekly": total_orders,
                "total_revenue_weekly": total_revenue,
                "daily_breakdown": daily_data
            }
        })
    except Exception as error:
        return jsonify({"message": "Gagal mengambil laporan mingguan", "error": str(error)}), 500

# [METHOD 4] GET: Tampil Berdasarkan ID Laporan
@app.route("/report/detail/<int:report_id>", methods=["GET"])
def get_report_by_id(report_id):
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, report_date, total_orders, total_revenue, total_payments, created_at 
            FROM daily_reports WHERE id = %s
        """, (report_id,))
        row = cursor.fetchone()
        cursor.close()
        
        if not row:
            return jsonify({"message": f"Data laporan dengan ID {report_id} tidak ditemukan"}), 404
            
        return jsonify({
            "service": "report-service",
            "data": {
                "id": row[0],
                "report_date": row[1].strftime("%Y-%m-%d"),
                "total_orders": row[2],
                "total_revenue": row[3],
                "total_payments": row[4],
                "created_at": row[5].strftime("%Y-%m-%d %H:%M:%S")
            }
        })
    except Exception as error:
        return jsonify({"message": "Gagal mengambil detail data", "error": str(error)}), 500

# [METHOD 5] GET: Filter Berdasarkan Rentang Tanggal Custom
@app.route("/report/range", methods=["GET"])
def get_report_by_range():
    try:
        start = request.args.get("start_date")
        end = request.args.get("end_date")
        if not start or not end:
            return jsonify({"message": "Parameter start_date dan end_date wajib diisi (Format: YYYY-MM-DD)"}), 400
            
        cursor = conn.cursor()
        cursor.execute("SELECT report_date, total_revenue FROM daily_reports WHERE report_date BETWEEN %s AND %s", (start, end))
        rows = cursor.fetchall()
        cursor.close()
        
        return jsonify({
            "service": "report-service",
            "search_range": {"start": start, "end": end},
            "total_revenue_accumulated": sum(r[1] for r in rows),
            "records": [{"date": r[0].strftime("%Y-%m-%d"), "revenue": r[1]} for r in rows]
        })
    except Exception as error:
        return jsonify({"message": "Gagal memproses rentang tanggal", "error": str(error)}), 500

# [METHOD 6] POST: Fitur Pembersihan Laporan Usang Manual
@app.route("/report/cleanup", methods=["POST"])
def cleanup_old_reports():
    try:
        body = request.get_json()
        days = body.get("older_than_days", 30)
        limit_date = datetime.now() - timedelta(days=days)
        
        cursor = conn.cursor()
        cursor.execute("DELETE FROM daily_reports WHERE created_at < %s", (limit_date,))
        deleted_rows = cursor.rowcount
        conn.commit()
        cursor.close()
        
        return jsonify({
            "service": "report-service",
            "message": f"Pembersihan sukses. {deleted_rows} baris laporan lama berhasil dihapus dari database."
        }), 200
    except Exception as error:
        return jsonify({"message": "Gagal melakukan pembersihan data", "error": str(error)}), 500

# --- BLOCK RUNNER ---
if __name__ == "__main__":
    connect_with_retry()
    init_database()
    app.run(host="0.0.0.0", port=8000)