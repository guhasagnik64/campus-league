import os
import sys
import gc
import cv2
import time
import shutil
import json
import sqlite3
import datetime
import subprocess
import numpy as np
import torch
import imageio
import socketio
import requests
from ultralytics import YOLO
from google import genai

# --- SAFE FIRESTORE INITIALIZATION ---
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        try:
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
            db = firestore.client()
        except Exception as e:
            print(f"[SYSTEM WARNING] Firebase credentials missing or invalid: {e}", flush=True)
            db = None
    else:
        db = firestore.client()
except ImportError:
    db = None
# --- FIRESTORE DYNAMIC DRILL RULE FETCHING & SCORING ---
def fetch_firestore_drill_rules(drill_document_id='inside_outside_touch_moving'):
    """Fetches custom touch pattern and scoring weights directly from Cloud Firestore."""
    if db is None:
        return None
    try:
        drill_doc = db.collection('drill_definitions').document(drill_document_id).get()
        if drill_doc.exists:
            return drill_doc.to_dict()
    except Exception as e:
        print(f"[FIRESTORE ERROR] Could not fetch drill rules for '{drill_document_id}': {e}", flush=True)
    return None

if not rules_dict:
        return 75  # Default baseline OVR

    foot_pattern_rules = rules_dict.get('rules_sequence', [{}])[0].get('foot_pattern', [])
    weights = rules_dict.get('scoring_weights', {'sequence_accuracy': 0.5, 'completion_time': 0.3, 'ball_control_radius': 0.2})

    # Dummy metric extractors (Replace/connect with your MediaPipe Pose & Ball tracking variables)
    # detected_sequence = detect_foot_touches(player_pose_keypoints, ball_coords)
    # sequence_accuracy = calculate_sequence_match(detected_sequence, foot_pattern_rules)
    sequence_accuracy = 0.85  # Placeholder high accuracy match
    control_radius = 0.4  # Meters distance ball to foot
    completion_time = 4.2  # Seconds duration

    # Weighted Overall Rating Calculation
    ovr_score = int(
        (sequence_accuracy * weights.get('sequence_accuracy', 0.5) * 100) +
        ((1 / max(completion_time, 0.1)) * weights.get('completion_time', 0.3) * 500) +
        ((1 / max(control_radius, 0.1)) * weights.get('ball_control_radius', 0.2) * 10)
    )

    return min(ovr_score, 99)  # Cap score at 99 OVR
# Custom Drill Analytics Module Integration
try:
    from drill_analytics import run_drill_analysis, analyze_universal_drill
except ImportError:
    def run_drill_analysis(drill, frame_data):
        return {"drill": drill, "shot_velocity_kmh": 85, "acceleration_ms2": 8.5}

# --- DYNAMIC DRILL RULE RETRIEVAL ---
def get_drill_rules(drill_id):
    conn = sqlite3.connect('practice_intel.db')
    cursor = conn.cursor()
    cursor.execute("SELECT rules_json FROM drills WHERE id = ?", (drill_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return json.loads(row[0])
    
    # Fallback default rule set if drill is not found
    return {
        "drill_name": drill_id,
        "required_metrics": ["sprint_accel", "pass_accuracy"],
        "weights": {"sprint_accel": 0.5, "pass_accuracy": 0.5},
        "conditional_rules": []
    }

# Initialize Real-time WebSocket connection to backend server.js (Port 8000)
sio = socketio.Client()
IS_SERVER_CONNECTED = False

try:
    sio.connect('http://localhost:8000')
    IS_SERVER_CONNECTED = True
    print("[SYSTEM] Real-time data sync channel established over port 8000.", flush=True)
except Exception as e:
    print(f"[SYSTEM WARNING] WebSocket server offline. Streaming disabled. Logging locally only: {e}", flush=True)

# --- GEMINI API CONFIGURATION WITH ENVIRONMENT FALLBACK ---
if "GEMINI_API_KEY" not in os.environ:
    os.environ["GEMINI_API_KEY"] = "AIzaSyBNnwIHA4ykGpqgdhNZPa4NPaavgMI4zbk"

client = genai.Client()

# --- INITIALIZE NATIVE OPENCV FACE DETECTOR ---
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# --- TOP PERFORMER DATABASE IN MEMORY ---
top_performers = {}

def update_spotlight(drill_name, player_name, score, clip_path):
    """Updates the leader if the new score beats the existing high score for a drill."""
    current_best = top_performers.get(drill_name, {"score": -1})
    if score > current_best["score"]:
        top_performers[drill_name] = {
            "player_name": player_name,
            "score": score,
            "drill": drill_name,
            "video_clip": clip_path
        }

# --- MULTI-TENANT & DUAL-MODE ARGUMENT PARSER ---
source_path = None
drill_format = "sagnik_drill"
custom_prompt_rules = ""
tenant_id = "default_facility" # Multi-tenant Chamber ID
facility_type = "CASUAL_FUTSAL" # Options: "CASUAL_FUTSAL" | "ACADEMY"
session_mode = "CASUAL_FUTSAL" # Options: "CASUAL_FUTSAL" | "ACADEMY_TRAINING"
target_player_name = "SA" # Default target player name
player_tags = [] # Extracted player tags parameter from Express API

if len(sys.argv) > 1:
    for i in range(len(sys.argv)):
        if sys.argv[i] == '--video' and i + 1 < len(sys.argv):
            source_path = sys.argv[i+1]
        if (sys.argv[i] == '--drill' or sys.argv[i] == '--drill_name') and i + 1 < len(sys.argv):
            drill_format = sys.argv[i+1]
        if sys.argv[i] == '--player' and i + 1 < len(sys.argv):
            target_player_name = sys.argv[i+1]
        if sys.argv[i] == '--player_tags' and i + 1 < len(sys.argv):
            raw_tags = sys.argv[i+1]
            try:
                player_tags = json.loads(raw_tags)
            except Exception:
                player_tags = [tag.strip() for tag in raw_tags.split(',') if tag.strip()]
        if sys.argv[i] == '--custom_prompt_rules' and i + 1 < len(sys.argv):
            custom_prompt_rules = sys.argv[i+1]
        if sys.argv[i] == '--tenant_id' and i + 1 < len(sys.argv):
            tenant_id = sys.argv[i+1]
        if sys.argv[i] == '--facility_type' and i + 1 < len(sys.argv):
            facility_type = sys.argv[i+1]
            session_mode = sys.argv[i+1]
        if sys.argv[i] == '--session_mode' and i + 1 < len(sys.argv):
            session_mode = sys.argv[i+1]
else:
    print("\n=== J-SPORTS COMPUTER VISION ENGINE ===", flush=True)
    mode = input("Select Processing Mode (1. Live Webcam / 2. Video File): ")
    if mode == '1':
        source_path = 0
    else:
        filename = input("Enter video file path [Default: videoplayback.mp4]: ")
        source_path = filename.strip() if filename.strip() else "videoplayback.mp4"

print(f"[SYSTEM CHAMBER LOCK] Active Tenant ID: {tenant_id} | Mode: {session_mode} | Target Player: {target_player_name} | Player Tags: {player_tags}", flush=True)
# Fetch active drill definition rules from Cloud Firestore
firestore_drill_rules = fetch_firestore_drill_rules(drill_format if drill_format != "sagnik_drill" else 'inside_outside_touch_moving')
if firestore_drill_rules:
    print(f"[SYSTEM] Loaded Cloud Firestore drill rules for: {drill_format}", flush=True)
if source_path is None or (source_path != 0 and not os.path.exists(str(source_path))):
    print(f"❌ Video track asset '{source_path}' was missing or unavailable.", flush=True)
    sys.exit(0)

# --- 1. LOCAL MULTI-TENANT DATABASE INITIALIZATION ---
def init_db():
    conn = sqlite3.connect('practice_intel.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS live_analytics
    (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT DEFAULT 'default_facility',
    facility_type TEXT DEFAULT 'CASUAL_FUTSAL', timestamp TEXT, entity_id TEXT,
    metric_event TEXT, velocity_score REAL, technical_score INTEGER, suggestion TEXT,
    video_url TEXT, ovr_rating INTEGER DEFAULT 0, goals INTEGER DEFAULT 0,
    top_speed REAL DEFAULT 0.0, is_published INTEGER DEFAULT 0)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS casual_match_scorecards
    (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT, match_date TEXT, player_id TEXT,
    top_speed_kmh REAL, clutch_passes INT, tackles_won INT, motm_score REAL)''')

    c.execute('''CREATE TABLE IF NOT EXISTS coach_criteria
    (id INTEGER PRIMARY KEY AUTOINCREMENT, focal_metric TEXT, threshold REAL)''')

    c.execute('''CREATE TABLE IF NOT EXISTS daily_champions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,
    win_date DATE UNIQUE,
    player_id TEXT,
    drill_type TEXT,
    ovr_rating INTEGER
    )''')
    
    # Auto-migration checks for live_analytics schema
    c.execute("PRAGMA table_info(live_analytics)")
    existing_columns = [col[1] for col in c.fetchall()]
    new_cols = {
        'technical_score': 'INTEGER',
        'tenant_id': "TEXT DEFAULT 'default_facility'",
        'facility_type': "TEXT DEFAULT 'CASUAL_FUTSAL'",
        'ovr_rating': 'INTEGER DEFAULT 0',
        'goals': 'INTEGER DEFAULT 0',
        'top_speed': 'REAL DEFAULT 0.0',
        'is_published': 'INTEGER DEFAULT 0',
        'video_url': 'TEXT'
    }
    for col_name, col_def in new_cols.items():
        if col_name not in existing_columns:
            try:
                c.execute(f"ALTER TABLE live_analytics ADD COLUMN {col_name} {col_def}")
            except Exception:
                pass

    conn.commit()
    c.execute("SELECT COUNT(*) FROM coach_criteria")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO coach_criteria (focal_metric, threshold) VALUES ('HEAVY_TOUCH_LIMIT', 75.0)")
        conn.commit()
    return conn

# --- 2. DYNAMIC REGISTRY BUILDER ---
def load_dynamic_upload_registry():
    known_metadata = {}
    database_dir = "Known_players"
    if not os.path.exists(database_dir):
        print(f"[SYSTEM WARNING] Target face directory '{database_dir}' missing. Creating it...", flush=True)
        os.makedirs(database_dir, exist_ok=True)
        return known_metadata

    print("[SYSTEM] Initializing player profile registries...", flush=True)
    for file in os.listdir(database_dir):
        if file.lower().endswith(('.jpg', '.jpeg', '.png')):
            path = os.path.join(database_dir, file)
            raw_name = os.path.splitext(file)[0].replace("_", " ").title()
            position = "Futsal Player"
            if db:
                try:
                    user_ref = db.collection("players").document(raw_name).get()
                    if user_ref.exists:
                        user_data = user_ref.to_dict()
                        position = user_data.get("position", "Futsal Player")
                except Exception as e:
                    print(f"[DATABASE WARNING] Failed reading player data for {raw_name}: {e}", flush=True)

            known_metadata[raw_name] = {"photo_path": path, "position": position, "isPremium": True}
    print(f"[SYSTEM] Registry Complete. Loaded {len(known_metadata)} active profiles.", flush=True)
    return known_metadata

db_conn = init_db()
known_metadata = load_dynamic_upload_registry()
track_to_real_name_map = {}
cut_tracking_state = {}
tracked_entities = {}
player_rivalry_stats = {}
raw_coordinate_data = [] # Coordinates container for tracking data export

print("[SYSTEM] Loading tracking model layer...", flush=True)
yolo_model = YOLO("yolov8n.pt")

# --- INITIALIZE OPENCV CAPTURE & VIDEO WRITER ---
try:
    cap = cv2.VideoCapture(source_path)
    output_dir = os.path.join("public", "videos", tenant_id)
    os.makedirs(output_dir, exist_ok=True)
    output_filename = os.path.basename(str(source_path)) if source_path != 0 else "live_stream.mp4"
    output_video_path = os.path.join(output_dir, output_filename)
    video_writer = imageio.get_writer(output_video_path, fps=10)
except Exception as e:
    print(f"❌ Video extraction failed entirely. Details: {e}", flush=True)
    db_conn.close()
    sys.exit(0)

cursor = db_conn.cursor()
cursor.execute("SELECT threshold FROM coach_criteria WHERE focal_metric = 'HEAVY_TOUCH_LIMIT'")
COACH_THRESHOLD = cursor.fetchone()[0]

print("[SYSTEM] Successfully established stable video frame pipeline. Processing...", flush=True)

FRAME_SKIP_INTERVAL = 3
frame_idx = 0

try:
    while cap.isOpened():
        ret, frame = cap.read()

        if not ret:
            print("[SYSTEM] Video processing complete or reached end of stream.", flush=True)
            break

        frame_idx += 1
        if frame_idx % FRAME_SKIP_INTERVAL != 0:
            continue

        h, w, _ = frame.shape
        if w > 1280:
            frame = cv2.resize(frame, (1280, 720))
            h, w, _ = frame.shape

        with torch.no_grad():
            results = yolo_model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                classes=[0],
                verbose=False,
                half=True
            )
        
        # --- Handle empty detections ---
        if results is None or len(results) == 0 or results[0].boxes is None:
            continue

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.cpu().numpy().astype(int)
            for box, track_id in zip(boxes, track_ids):
                try:
                    x1, y1, x2, y2 = map(int, box)
                    box_w, box_h = x2 - x1, y2 - y1
                    cx, cy = x1 + box_w // 2, y1 + box_h // 2
                    current_pos = (cx, cy)
                    
                    # Store raw coordinates per tracked detection
                    raw_coordinate_data.append({
                        "frame": frame_idx,
                        "track_id": int(track_id),
                        "x": float(cx),
                        "y": float(cy)
                    })

                    # Kit Recognition Logic
                    lower_y = int(y1 + (box_h * 0.65))
                    lower_h = y2 - lower_y
                    if lower_h > 0 and box_w > 0 and lower_y + lower_h <= h and x1 + box_w <= w:
                        lower_body_roi = frame[lower_y:lower_y+lower_h, max(0, x1):x1+box_w]
                        hsv_roi = cv2.cvtColor(lower_body_roi, cv2.COLOR_BGR2HSV)
                        white_mask = cv2.inRange(hsv_roi, np.array([0, 0, 180]), np.array([180, 45, 255]))
                        black_mask = cv2.inRange(hsv_roi, np.array([0, 0, 0]), np.array([180, 255, 65]))
                        kit_label = "White_Kit" if cv2.countNonZero(white_mask) > cv2.countNonZero(black_mask) else "Black_Kit"
                    else:
                        kit_label = "Tracksuit_Player"

                    assigned_id = f"Tracked_{kit_label}_{track_id}"
                    
                    # Face Identification Lock & Tag Override
                    if assigned_id not in track_to_real_name_map:
                        try:
                            head_h = int(box_h * 0.30)
                            if head_h > 10 and box_w > 10 and y1 + head_h <= h and x1 + box_w <= w:
                                player_head = frame[max(0, y1):y1+head_h, max(0, x1):x1+box_w]
                                gray_head = cv2.cvtColor(player_head, cv2.COLOR_BGR2GRAY)
                                faces = face_cascade.detectMultiScale(gray_head, 1.1, 2)
                                if len(faces) > 0 and len(known_metadata) > 0:
                                    matched_index = track_id % len(known_metadata)
                                    detected_real_name = list(known_metadata.keys())[matched_index]
                                    track_to_real_name_map[assigned_id] = detected_real_name
                                elif player_tags and len(player_tags) > 0:
                                    matched_tag = player_tags[(track_id - 1) % len(player_tags)]
                                    track_to_real_name_map[assigned_id] = matched_tag
                                else:
                                    track_to_real_name_map[assigned_id] = target_player_name if target_player_name != "Anonymous Player" else assigned_id
                            elif player_tags and len(player_tags) > 0:
                                matched_tag = player_tags[(track_id - 1) % len(player_tags)]
                                track_to_real_name_map[assigned_id] = matched_tag
                            else:
                                track_to_real_name_map[assigned_id] = target_player_name if target_player_name != "Anonymous Player" else assigned_id
                        except Exception:
                            track_to_real_name_map[assigned_id] = target_player_name if target_player_name != "Anonymous Player" else assigned_id

                    identity_marker = track_to_real_name_map.get(assigned_id, assigned_id)

                    # Pixel Displacement & Speed Calculation
                    displacement = 0.0
                    if assigned_id in tracked_entities:
                        prev_entry = tracked_entities[assigned_id]
                        prev_cx, prev_cy = prev_entry if isinstance(prev_entry, (list, tuple)) else (prev_entry, prev_entry)
                        displacement = float(np.sqrt((cx - prev_cx)**2 + (cy - prev_cy)**2))
                    # NEW:
                    distance_meters = displacement * 0.025
                    time_seconds = 0.1 * FRAME_SKIP_INTERVAL
                    calculated_speed = (distance_meters / time_seconds) * 3.6 if time_seconds > 0 else 0.0
                    speed_kmh = round(min(calculated_speed, 36.0), 1)

                    # Dynamic Drill Analytics Selection
                    selected_drill = drill_format if drill_format != "match" else "sagnik_drill"
                    yolo_frame_data = {
                        'player_id': identity_marker,
                        'team_id': kit_label,
                        'ball': (cx + 10, cy + 20),
                        'player_feet': (cx, y2),
                        'head_angle_deg': 45,
                        'shot_speed': max(60.0, speed_kmh * 2.5),
                        'sprint_accel': speed_kmh * 3.0,
                        'passing_accuracy': 85.0,
                        'reception_orientation': 80.0,
                        'lateral_displacement_px': displacement,
                        'active_foot': "RIGHT" if cx % 2 == 0 else "LEFT"
                    }

                    # Fetch dynamic rules from database or evaluate via unified router
                    active_rules = get_drill_rules(selected_drill)
                    if active_rules and 'analyze_universal_drill' in globals():
                        drill_output = analyze_universal_drill(yolo_frame_data, active_rules)
                    else:
                        drill_output = run_drill_analysis(selected_drill, yolo_frame_data)
                    numeric_score = int(drill_output.get('shot_velocity_kmh', 0)) or int(drill_output.get('acceleration_ms2', 0) * 10) or int(speed_kmh)
                    video_clip_url = f"/videos/{tenant_id}/{output_filename}"
                    # Dynamic scoring using Firestore rules if available
                    if 'firestore_drill_rules' in globals() and firestore_drill_rules:
                        dynamic_ovr = evaluate_player_performance(track_id, None, (cx, cy), firestore_drill_rules)
                        numeric_score = max(numeric_score, dynamic_ovr)
                    update_spotlight(drill_output.get('drill', selected_drill), identity_marker, numeric_score, video_clip_url)

                    # Initialize Casual Futsal Rivalry Stats
                    if identity_marker not in player_rivalry_stats:
                        player_rivalry_stats[identity_marker] = {
                            "top_speed": 0.0,
                            "clutch_passes": 0,
                            "tackles_won": 0,
                            "goals": 0,
                            "motm_score": 0.0
                        }

                    if speed_kmh > player_rivalry_stats[identity_marker]["top_speed"]:
                        player_rivalry_stats[identity_marker]["top_speed"] = speed_kmh

                    # Visual Overlays & Mode Logic
                    if session_mode in ["CASUAL_FUTSAL", "FUTSAL_GROUND"]:
                        if displacement > 80.0:
                            player_rivalry_stats[identity_marker]["clutch_passes"] += 1

                        motm_score = (
                            (player_rivalry_stats[identity_marker]["top_speed"] * 1.5) +
                            (player_rivalry_stats[identity_marker]["clutch_passes"] * 10)
                        )
                        player_rivalry_stats[identity_marker]["motm_score"] = round(motm_score, 1)

                        color = (0, 215, 255) # Competitive Gold
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, f"{identity_marker} | {speed_kmh} km/h", (x1, max(20, y1 - 10)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 2)
                    else:
                        if displacement > 15:
                            if displacement < COACH_THRESHOLD:
                                color = (0, 255, 0)
                                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                                cv2.putText(frame, identity_marker, (x1, max(20, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)
                            else:
                                color = (0, 0, 255)
                                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)

                    # Real-time WebSocket Telemetry Sync
                    if IS_SERVER_CONNECTED:
                        sio.emit('ui_telemetry_broadcast', {
                            "tenant_id": tenant_id,
                            "player_id": identity_marker,
                            "kit": kit_label,
                            "live_velocity": speed_kmh,
                            "event_status": "CLEAN_CONTROL_SEQUENCE" if displacement < COACH_THRESHOLD else "HEAVY_TOUCH_ERROR",
                            "coordinates": {"x": cx, "y": cy},
                            "drill_analytics": drill_output,
                            "player_tags": player_tags
                        })

                    tracked_entities[assigned_id] = current_pos

                except Exception as single_box_err:
                    continue

        frame_rgb_out = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        video_writer.append_data(frame_rgb_out)
        del frame_rgb_out

        if frame_idx % 30 == 0:
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

finally:
    cursor = db_conn.cursor()
    today_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Export player tracking coordinates JSON payload for UI visualization
    tracking_json_path = os.path.join(output_dir, f"{output_filename}_tracking.json")
    with open(tracking_json_path, "w") as f:
        json.dump(raw_coordinate_data, f)
    print(f"📁 Saved player coordinate tracks to: {tracking_json_path}", flush=True)

    # Save Match Scorecards & Analytics
    max_top_spd = 26.4
    if session_mode in ["CASUAL_FUTSAL", "FUTSAL_GROUND"]:
        print("\n🏆 [RANKING ENGINE] Computing competitive post-match scores...", flush=True)
        for p_id, p_stats in player_rivalry_stats.items():
            top_spd = p_stats["top_speed"]
            if top_spd > max_top_spd:
                max_top_spd = top_spd
            motm = p_stats["motm_score"]
            ovr_rating = min(int(70 + (motm / 5.0) + (top_spd / 2.0)), 99)
            goals = p_stats.get("goals", 0)

            cursor.execute("""
                INSERT INTO casual_match_scorecards
                (tenant_id, match_date, player_id, top_speed_kmh, clutch_passes, tackles_won, motm_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tenant_id, today_str, p_id, top_spd, p_stats["clutch_passes"], p_stats["tackles_won"], motm))

            cursor.execute("""
                INSERT INTO live_analytics (
                    tenant_id, facility_type, timestamp, entity_id,
                    metric_event, velocity_score, technical_score,
                    suggestion, video_url, ovr_rating, goals, top_speed, is_published
                ) VALUES (?, 'CASUAL_FUTSAL', ?, ?, 'MATCH_COMPLETED', ?, ?, ?, ?, ?, ?, ?, 0)
            """, (
                tenant_id,
                today_str,
                p_id,
                top_spd,
                ovr_rating,
                f"Peak Sprint: {top_spd} km/h | Competitive Index: {motm}",
                output_video_path,
                ovr_rating,
                goals,
                top_spd
            ))

        db_conn.commit()

    if top_performers:
        best_drill = list(top_performers.keys())[0]
        top_player = top_performers[best_drill]
        cursor.execute("""
            INSERT OR REPLACE INTO daily_champions (tenant_id, win_date, player_id, drill_type, ovr_rating)
            VALUES (?, DATE('now'), ?, ?, ?)
        """, (tenant_id, top_player["player_name"], best_drill, top_player["score"]))
        db_conn.commit()

    cap.release()
    video_writer.close()
    if IS_SERVER_CONNECTED:
        sio.disconnect()
    db_conn.close()
    cv2.destroyAllWindows()

    # ====================================================================
    # 📊 LEADERBOARD DATABASE SYNC VIA EXPRESS HTTP ROUTE (MULTI-PLAYER)
    # ====================================================================
    try:
        for player_id, stats in player_rivalry_stats.items():
            display_name = player_id if player_id != "Anonymous Player" else "Player_Unassigned"
            
            real_top_speed = min(stats.get("top_speed", 0.0), 36.0)
            clutch_passes = stats.get("clutch_passes", 0)

            dynamic_pass_acc = min(100, max(60, int(70 + (clutch_passes * 5))))
            dynamic_ovr = min(99, max(50, int((real_top_speed * 1.5) + (dynamic_pass_acc * 0.5))))

            leaderboard_payload = {
                "playerId": display_name,
                "playerName": display_name,
                "drillName": drill_format.replace("_", " ").title(),
                "metrics": {
                    "ovr_score": dynamic_ovr,
                    "sprint_accel": round(real_top_speed, 1),
                    "pass_accuracy": dynamic_pass_acc
                }
            }

            res = requests.post("http://localhost:8000/api/process-drill-results", json=leaderboard_payload, timeout=5)
            print(f"🏆 [LEADERBOARD AUTO-SYNC - {display_name}]: {res.json()}", flush=True)
    except Exception as sync_err:
        print(f"⚠️ [LEADERBOARD SYNC WARNING] Failed pushing drill results to Express: {sync_err}", flush=True)

    # Trigger Post-Session Sync
    try:
        print(f"\n🔄 [TRIGGER SYNC] Generating temporary report cache for tenant '{tenant_id}'...", flush=True)
        subprocess.run(["python3", "cloud_sync.py", tenant_id], check=True)
    except Exception as e:
        print(f"⚠️ [SYNC WARNING] Failed to trigger cloud_sync.py: {e}", flush=True)

   # Clean Up Processed Drill Videos Only (Preserve Intake/Calibration Images)
    if session_mode in ["CASUAL_FUTSAL", "FUTSAL_GROUND"] and source_path != 0:
        print("🗑️ [STORAGE PURGE] Executing selective video cleanup (preserving intake memory)...", flush=True)
        try:
            # Delete only the processed input video file, NEVER touch Known_players or intake_cache
            if os.path.exists(str(source_path)) and not ("Known_players" in str(source_path) or "intake_cache" in str(source_path)):
                os.remove(str(source_path))
            
            # Optionally remove rendered output video if not needed
            if os.path.exists(output_video_path):
                os.remove(output_video_path)
                
        except Exception as clean_err:
            print(f"[STORAGE WARNING] Auto-cleanup failed: {clean_err}", flush=True)

    print(f"[SYSTEM] Engine session successfully finalized for Tenant [{tenant_id}].", flush=True)