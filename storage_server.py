import os
import time
import asyncio
import sqlite3
import json
import subprocess
from datetime import datetime
from drill_analytics import run_drill_analysis

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "my_cloud_space"
TEMP_PDF_DIR = "public/pdf_cache"
PUBLIC_DIR = "public"
CACHE_DIR = "./stream"
EXPIRATION_SECONDS = 86400  # 24 Hours

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TEMP_PDF_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

app.mount("/stream", StaticFiles(directory=UPLOAD_DIR), name="stream")
app.mount("/tenants", StaticFiles(directory="public/tenants"), name="tenants")
app.mount("/public", StaticFiles(directory=PUBLIC_DIR), name="public")


# ==========================================
# 1. CLEANUP CRON & EPHEMERAL PURGE ENGINE
# ==========================================
async def auto_purge_old_reports():
    """Purges files inside ./stream directory older than 24h."""
    while True:
        try:
            now = time.time()
            if os.path.exists(CACHE_DIR):
                for filename in os.listdir(CACHE_DIR):
                    file_path = os.path.join(CACHE_DIR, filename)
                    if os.path.isfile(file_path):
                        if (now - os.path.getmtime(file_path)) > EXPIRATION_SECONDS:
                            os.remove(file_path)
                            print(f"[PURGE] Deleted expired report: {filename}")
        except Exception as e:
            print(f"[PURGE ERROR] {e}")
            
        await asyncio.sleep(3600)


async def cleanup_abandoned_files_loop():
    """
    Runs continuously in the background. 
    1. Scans UPLOAD_DIR and TEMP_PDF_DIR hourly and purges files older than 24h.
    2. Checks stream/coach_intel_cache.json for 3-hour expiration (if not published).
    """
    RETENTION_SECONDS = 24 * 3600  # 24 Hours

    while True:
        try:
            now = time.time()

            # --- A. 24-Hour File Purge ---
            for target_folder in [UPLOAD_DIR, TEMP_PDF_DIR]:
                if not os.path.exists(target_folder):
                    continue
                for filename in os.listdir(target_folder):
                    file_path = os.path.join(target_folder, filename)
                    if os.path.isfile(file_path):
                        file_age = now - os.path.getmtime(file_path)
                        if file_age > RETENTION_SECONDS:
                            os.remove(file_path)
                            print(f"🧹 [24h CRON] Purged abandoned file (>24h old): {file_path}")

            # --- B. 3-Hour Ephemeral Cache Vanish Check ---
            cache_file = os.path.join("stream", "coach_intel_cache.json")
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    try:
                        data = json.load(f)
                        expires_at_str = data.get("expiresAt")
                        is_published = data.get("isPublished", False)

                        if expires_at_str and not is_published:
                            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", ""))
                            if datetime.utcnow() > expires_at:
                                os.remove(cache_file)
                                print(f"⏳ [3h EPHEMERAL PURGE] Futsal report expired & vanished: {cache_file}")
                    except json.JSONDecodeError:
                        pass

        except Exception as e:
            print(f"[ERROR] Exception during background cleanup cron: {str(e)}")

        await asyncio.sleep(3600)


@app.on_event("startup")
async def start_background_cron():
    asyncio.create_task(cleanup_abandoned_files_loop())
    asyncio.create_task(auto_purge_old_reports())


# ==========================================
# 2. EPHEMERAL DOWNLOAD & IMMEDIATE PURGE
# ==========================================
@app.post("/api/download/pdf")
async def download_scorecard_pdf(
    background_tasks: BackgroundTasks,
    pdf_filename: str = Query(...),
    associated_video: str = Query(None),
    user_type: str = Query("casual")
):
    pdf_path = os.path.join(TEMP_PDF_DIR, pdf_filename)
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="Requested scorecard PDF not found.")

    if user_type.lower() == "casual":
        def purge_casual_assets():
            time.sleep(1)
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
                print(f"🗑️ [EPHEMERAL] Casual PDF purged: {pdf_path}")

            if associated_video:
                video_path = os.path.join(UPLOAD_DIR, os.path.basename(associated_video))
                if os.path.exists(video_path):
                    os.remove(video_path)
                    print(f"🗑️ [EPHEMERAL] Casual video asset purged: {video_path}")

        background_tasks.add_task(purge_casual_assets)

    return FileResponse(pdf_path, media_type="application/pdf", filename=pdf_filename)


# ==========================================
# 3. BACKGROUND CV PIPELINE EXECUTION
# ==========================================
def run_coaching_pipeline(video_filename: str, drill_type: str, tenant_id: str):
    """Worker task executing coaching_engine.py non-blockingly."""
    tenant_dir = os.path.join("public", "tenants", tenant_id)
    os.makedirs(tenant_dir, exist_ok=True)

    # 1. Flag state as PROCESSING in json caches
    processing_payload = {
        "status": "PROCESSING",
        "message": "Computer vision pipeline analyzing frames in background...",
        "lastUpdated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    for c_path in [os.path.join(tenant_dir, "coach_intel_cache.json"), os.path.join("public", "coach_intel_cache.json")]:
        with open(c_path, "w") as f:
            json.dump(processing_payload, f, indent=4)

    # 2. Spawn python CV process
    cmd = [
        "python3", "coaching_engine.py",
        "--tenant_id", tenant_id,
        "--drill", drill_type,
        "--video", video_filename
    ]
    print(f"🚀 [BACKGROUND TASK] Running pipeline command: {' '.join(cmd)}")
    subprocess.run(cmd)


@app.post("/api/process-video")
async def trigger_video_processing(
    background_tasks: BackgroundTasks,
    video_filename: str = Query("3_players_drill_1.mp4"),
    drill_type: str = Query("dribbling"),
    tenant_id: str = Query("default_facility")
):
    """Endpoint triggered by UI to launch non-blocking analysis."""
    background_tasks.add_task(run_coaching_pipeline, video_filename, drill_type, tenant_id)
    return {"status": "QUEUED", "message": f"Auto-Analysis triggered for {video_filename}."}


# ==========================================
# 4. DYNAMIC PLAYER PROFILE TELEMETRY ENDPOINT
# ==========================================
@app.get("/api/player-profile")
async def get_player_profile(tenant_id: str = "default_facility"):
    """Fetch analytics cache file or fall back to practice_intel.db live telemetry."""
    # 1. First attempt: Read the generated analytics JSON cache file
    cache_path = os.path.join("public", "coach_intel_cache.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r") as f:
                return json.load(f)
        except Exception:
            pass

    # 2. Fallback: Fetch genuine computer vision ratings from practice_intel.db
    try:
        conn = sqlite3.connect("practice_intel.db")
        cursor = conn.cursor()

        cursor.execute("""
            SELECT entity_id, ovr_rating, technical_score, velocity_score, top_speed
            FROM live_analytics
            WHERE tenant_id = ?
            ORDER BY id DESC LIMIT 1
        """, (tenant_id,))
        latest_row = cursor.fetchone()

        conn.close()

        if not latest_row:
            return {
                "status": "NO_DATA",
                "message": "Run analytics pipeline first",
                "player_id": "PLAYER_1",
                "ovr": 72,
                "skills": {"passing": 74, "dribbling": 75, "saq": 68, "shooting": 71},
                "top_speed": 12.5
            }

        ovr_val = int(latest_row[1] or 72)
        tech_val = int(latest_row[2] or 74)
        vel_val = int(latest_row[3] or 75)
        spd_val = float(latest_row[4] or 12.5)

        return {
            "status": "success",
            "player_id": latest_row[0] or "PLAYER_1",
            "ovr": ovr_val,
            "skills": {
                "passing": tech_val,
                "dribbling": vel_val,
                "saq": int(min(99, max(50, spd_val * 4.5))),
                "shooting": int((tech_val + ovr_val) / 2)
            },
            "top_speed": spd_val
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile telemetry: {str(e)}")


# ==========================================
# 5. VIDEO UPLOAD & TELEMETRY ENDPOINTS
# ==========================================
async def delete_file_after_delay(file_path: str, delay_seconds: int):
    await asyncio.sleep(delay_seconds)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"🗑️ Permanent Clean Complete: Purged local media file -> {file_path}")
    except Exception as e:
        print(f"[ERROR] Failed to purge file: {str(e)}")


@app.post("/upload")
@app.post("/api/upload")
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        safe_filename = file.filename.replace(" ", "_")
        file_path = os.path.join(UPLOAD_DIR, safe_filename)

        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        file_url = f"http://localhost:8000/stream/{safe_filename}"

        background_tasks.add_task(delete_file_after_delay, file_path, 86400)
        return {"mediaUrl": file_url, "filename": safe_filename, "message": "Upload successful!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/api/upload-video")
async def handle_video_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    drill_type: str = Form(...)
):
    """Direct analysis route called by DashboardUploader.jsx."""
    try:
        safe_filename = file.filename.replace(" ", "_")
        video_path = os.path.join(UPLOAD_DIR, safe_filename)

        with open(video_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Basic tracking payload passed into drill_analytics engine
        yolo_frame_data = {
            "drill": drill_type,
            "video_path": video_path,
            "moving_towards_target": True
        }

        # Evaluates drill telemetry via drill_analytics.py
        results = run_drill_analysis(drill_type, yolo_frame_data)

        # Schedule automatic cleanup after 24 hours
        background_tasks.add_task(delete_file_after_delay, video_path, 86400)

        return {
            "status": "success",
            "drill": drill_type,
            "video_path": video_path,
            "results": results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video upload and analysis failed: {str(e)}")


@app.get("/api/live-metrics")
async def get_live_metrics():
    try:
        conn = sqlite3.connect("practice_intel.db")
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, entity_id, metric_event, velocity_score, suggestion, video_url
            FROM live_analytics 
            WHERE metric_event LIKE '%CLEAN%'
            ORDER BY velocity_score ASC 
            LIMIT 4
        """)
        rows = cursor.fetchall()
        conn.close()

        metrics = []
        for row in rows:
            metrics.append({
                "id": row[0],
                "player": row[1],
                "event": row[2],
                "metric_val": row[3],
                "recommendation": row[4],
                "video_url": row[5] or "/videos/videoplayback.mp4"
            })
        return metrics

    except sqlite3.OperationalError as e:
        raise HTTPException(status_code=500, detail=f"Database schema error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 6. COMPETITIVE FUTSAL LEADERBOARD ENDPOINT
# ==========================================
@app.get("/api/futsal-leaderboard")
async def get_futsal_leaderboard(tenant_id: str = "default_facility"):
    try:
        conn = sqlite3.connect("practice_intel.db")
        cursor = conn.cursor()

        cursor.execute("""
            SELECT entity_id, ovr_rating, top_speed, goals, velocity_score, metric_event, is_published
            FROM live_analytics
            WHERE tenant_id = ? AND facility_type = 'CASUAL_FUTSAL'
            ORDER BY ovr_rating DESC, top_speed DESC
            LIMIT 10
        """, (tenant_id,))

        rows = cursor.fetchall()
        conn.close()

        leaderboard = []
        for index, row in enumerate(rows):
            leaderboard.append({
                "rank": index + 1,
                "player_id": row[0],
                "ovr_rating": row[1] or 75,
                "top_speed": row[2] or row[4] or 0.0,
                "goals": row[3] or 0,
                "remark": row[5] or "Active Performance",
                "is_published": bool(row[6])
            })

        return {"status": "success", "leaderboard": leaderboard}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 7. REAL-TIME SESSION AGGREGATION ENDPOINTS
# ==========================================
session_player_reports = {}

@app.post("/api/process_frame")
async def process_frame(payload: dict):
    player_id = payload.get("player_id", "Unassigned_Player")
    drill_option = payload.get("selected_drill", "relay_dribble_pass")
    
    # Process analytics using drill_analytics.py
    result = run_drill_analysis(drill_option, payload)
    
    # Store aggregated tracking data per player
    if player_id not in session_player_reports:
        session_player_reports[player_id] = []
    session_player_reports[player_id].append(result)
    
    return {"status": "success", "analysis": result}

@app.get("/api/admin/group_report")
async def get_group_report():
    return {"players": session_player_reports}


if __name__ == "__main__":
    import uvicorn
    print("🚀 Custom Cloud Space Server starting at http://localhost:8000")
    uvicorn.run("storage_server:app", host="0.0.0.0", port=8001, reload=True)