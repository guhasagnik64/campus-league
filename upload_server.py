# upload_server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from flask import send_from_directory
import os
import subprocess
import sqlite3

app = Flask(__name__)
CORS(app)  
socketio = SocketIO(app, cors_allowed_origins="*")

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

VIDEO_DIR = os.path.join(BASE_DIR, "my_cloud_space")
STAMP_DIR = os.path.join(BASE_DIR, "public", "player_stamps")

os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(STAMP_DIR, exist_ok=True)

# ------------------------------------------------------------------
# AUTOMATED SCHEMA VERIFICATION & MIGRATION ENGINE
# ------------------------------------------------------------------
def init_server_db(db_path="practice_intel.db"):
    """
    Ensures table persistence and automatically migrates schema for 
    multi-tenant scoping (tenant_id) and casual futsal metrics.
    """
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 1. Ensure drill_templates table exists
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS drill_templates (
                drill_name TEXT PRIMARY KEY,
                custom_rules TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 2. Ensure live_analytics table exists with multi-tenant & performance columns
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS live_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id TEXT DEFAULT 'default_facility',
                facility_type TEXT DEFAULT 'ACADEMY',
                timestamp TEXT,
                entity_id TEXT,
                metric_event TEXT,
                velocity_score REAL,
                technical_score INTEGER,
                suggestion TEXT,
                video_url TEXT,
                ovr_rating INTEGER DEFAULT 0,
                goals INTEGER DEFAULT 0,
                top_speed REAL DEFAULT 0.0,
                is_published INTEGER DEFAULT 0
            )
        """)

        # 3. Dynamic migration check for existing databases
        cursor.execute("PRAGMA table_info(live_analytics)")
        existing_columns = [column[1] for column in cursor.fetchall()]

        new_columns = {
            "tenant_id": "TEXT DEFAULT 'default_facility'",
            "facility_type": "TEXT DEFAULT 'ACADEMY'",
            "ovr_rating": "INTEGER DEFAULT 0",
            "goals": "INTEGER DEFAULT 0",
            "top_speed": "REAL DEFAULT 0.0",
            "is_published": "INTEGER DEFAULT 0"
        }

        for col_name, col_type in new_columns.items():
            if col_name not in existing_columns:
                cursor.execute(f"ALTER TABLE live_analytics ADD COLUMN {col_name} {col_type}")
                print(f"[DB MIGRATION] Added missing column '{col_name}' to live_analytics.")

        conn.commit()
        conn.close()
        print("[DATABASE INITIALIZATION] All schemas & multi-tenant migrations verified.")
    except Exception as e:
        print(f"[DATABASE CRITICAL ERROR] Initialization/Migration failed: {e}")

init_server_db()


# ==========================================
# 1. UPLOADER & ANALYSIS ENDPOINTS
# ==========================================
@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file chosen'}), 400

        drill_id = request.form.get('drill_id', 'dribble_pass')
        player_name = request.form.get('player_name', 'Sagnik Guha')
        
        # Save video locally inside BASE_DIR
        save_path = os.path.join(BASE_DIR, file.filename)
        file.save(save_path)
        print(f"[SUCCESS] Intercepted video asset directly to: {save_path}")
        
        # Trigger Python analytics background process automatically
        cmd = [
            "python3", "generate_analytics.py", 
            "default_facility", "ACADEMY", 
            player_name, drill_id, "High intensity precision passing"
        ]
        subprocess.Popen(cmd)
        
        return jsonify({'status': 'processing', 'file': file.filename}), 200
    except Exception as e:
        print(f"[ERROR] Exception during video upload: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/analyze', methods=['POST'])
def admin_analyze_session():
    if 'video' not in request.files:
        return jsonify({"error": "No video file uploaded"}), 400
        
    video_file = request.files['video']
    drill_name = request.form.get('drill_name', 'Custom Drill')
    threshold = request.form.get('threshold', '75.0')
    urgency = request.form.get('urgency', 'Medium')
    tenant_id = request.form.get('tenant_id', 'default_facility')
    facility_type = request.form.get('facility_type', 'CASUAL_FUTSAL')
    custom_prompt_rules = request.form.get('custom_prompt_rules', '').strip()

    if video_file.filename == '':
        return jsonify({"error": "No file chosen."}), 400

    upload_path = os.path.join(VIDEO_DIR, video_file.filename)
    video_file.save(upload_path)

    try:
        cmd = [
            "python3", "live_scouting_engine.py",
            "--video", upload_path,
            "--threshold", str(threshold),
            "--drill_name", drill_name,
            "--urgency", urgency,
            "--tenant_id", tenant_id,
            "--facility_type", facility_type,
            "--custom_prompt_rules", custom_prompt_rules
        ]
        
        print(f"[ADMIN EXECUTION] Spinning up live_scouting_engine sub-process...")
        subprocess.run(cmd, check=True)
        
        return jsonify({"status": "success", "message": f"Telemetry metrics tracked smoothly for tenant '{tenant_id}'."})

    except subprocess.CalledProcessError as e:
        print(f"[CRITICAL ERROR] Subprocess execution failed: {str(e)}")
        return jsonify({"error": f"Computer vision engine crashed: {str(e)}"}), 500


# ==========================================
# 2. EPHEMERAL PUBLISH TO MAIN FEED
# ==========================================
@app.route('/api/publish-report', methods=['POST'])
def publish_report():
    data = request.json or {}
    tenant_id = data.get('tenant_id', 'default_facility')
    
    try:
        conn = sqlite3.connect("practice_intel.db")
        cursor = conn.cursor()
        
        # Mark all recent casual records as permanently saved/published to feed
        cursor.execute("""
            UPDATE live_analytics 
            SET is_published = 1 
            WHERE tenant_id = ? AND facility_type = 'CASUAL_FUTSAL'
        """, (tenant_id,))
        
        conn.commit()
        conn.close()
        
        print(f"🔒 [PERMANENT SAVE] Futsal report for tenant '{tenant_id}' published to Campus Feed.")
        return jsonify({"status": "success", "message": "Report locked into feed!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# 3. CAMPUS LEAGUE PUBLIC & PRIVATE ROUTES
# ==========================================
@app.route('/api/v1/league/leaderboard', methods=['GET'])
def get_public_leaderboard():
    """Fetches high-level rank data (Player ID, Overall Rating, Goals) for the Campus App general page."""
    try:
        conn = sqlite3.connect("practice_intel.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Query top published scores ordered by overall rating (ovr_rating)
        cursor.execute("""
            SELECT entity_id AS player_id, ovr_rating, goals
            FROM live_analytics
            WHERE is_published = 1
            ORDER BY ovr_rating DESC
        """)
        rows = cursor.fetchall()
        conn.close()

        # Build public leaderboard rank array
        public_data = []
        for index, row in enumerate(rows, start=1):
            public_data.append({
                "rank": index,
                "player_id": row["player_id"],
                "ovr_rating": row["ovr_rating"],
                "goals": row["goals"]
            })

        return jsonify({"rankings": public_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/v1/players/<player_id>/scorecard', methods=['GET'])
def get_private_scorecard(player_id):
    """Fetches detailed player analytical feedback only visible on the individual player's screen."""
    try:
        conn = sqlite3.connect("practice_intel.db")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Fetch in-depth telemetry metrics for a specific player
        cursor.execute("""
            SELECT entity_id, metric_event, velocity_score, technical_score, suggestion, ovr_rating, top_speed, video_url
            FROM live_analytics
            WHERE entity_id = ?
            ORDER BY id DESC
            LIMIT 1
        """, (player_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({"error": "Player scorecard not found."}), 404

        private_data = {
            "player_id": row["entity_id"],
            "ovr_rating": row["ovr_rating"],
            "metric_event": row["metric_event"],
            "velocity_score": row["velocity_score"],
            "technical_score": row["technical_score"],
            "top_speed": row["top_speed"],
            "suggestion": row["suggestion"],
            "video_url": row["video_url"]
        }

        return jsonify({"scorecard": private_data}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# 4. LIVE POLLING & STREAM ENDPOINTS
# ==========================================
@app.route('/stream/<path:filename>', methods=['GET'])
def serve_stream_file(filename):
    stream_dir = os.path.join(BASE_DIR, "stream")
    if os.path.exists(os.path.join(stream_dir, filename)):
        return send_from_directory(stream_dir, filename)
    return jsonify({}), 200

@app.route('/api/live-metrics', methods=['GET'])
def get_live_metrics():
    return jsonify([]), 200

@app.route('/api/active-ad', methods=['GET'])
def get_active_ad():
    return jsonify({"status": "no_ad"}), 200

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=8002, debug=True, use_reloader=False)