import cv2
import base64
import os
import argparse
import json
import numpy as np
from datetime import datetime
from ultralytics import YOLO
from drill_analytics import run_drill_analysis

# --- 1. DRILL ZONE DEFINITIONS (Polygon Screen Coordinates) ---
DRILL_ZONES = {
    "zone_1_slalom": np.array([[50, 400], [300, 400], [350, 700], [10, 700]], np.int32),   # Left Foreground
    "zone_2_passing": np.array([[400, 300], [800, 300], [850, 550], [350, 550]], np.int32),  # Center/Right Midground
    "zone_3_shooting": np.array([[500, 150], [900, 150], [900, 280], [450, 280]], np.int32)  # Far Background Goal
}

# --- 2. HOMOGRAPHY MATRIX SETUP (Pixel-to-Meter Calibration) ---
SRC_PIXEL_PTS = np.float32([[10, 700], [850, 550], [900, 150], [50, 400]])
DST_METER_PTS = np.float32([[0, 0], [15, 0], [15, 20], [0, 20]])
HOMOGRAPHY_MATRIX, _ = cv2.findHomography(SRC_PIXEL_PTS, DST_METER_PTS)

# Load YOLO model
yolo_model = YOLO("yolov8n.pt")

def get_real_world_coords(pixel_x, pixel_y):
    """Transforms video pixel coordinates into actual pitch metrics (meters)"""
    point = np.array([[[float(pixel_x), float(pixel_y)]]], dtype=np.float32)
    real_pt = cv2.perspectiveTransform(point, HOMOGRAPHY_MATRIX)
    return real_pt[0][0]  # Returns [meters_x, meters_y]

def assign_drill_zone(feet_x, feet_y):
    """Determines which active polygon drill zone the player's feet belong to"""
    feet_point = (float(feet_x), float(feet_y))
    for zone_name, polygon in DRILL_ZONES.items():
        if cv2.pointPolygonTest(polygon, feet_point, False) >= 0:
            return zone_name
    return "general_field"

def crop_player_avatar(frame, bbox):
    """Crops the player bounding box from frame and converts to Base64 image"""
    x1, y1, x2, y2 = [int(v) for v in bbox]
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    _, buffer = cv2.imencode('.jpg', crop)
    return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

# --- 3. RE-ID FEATURE EMBEDDING ENGINE ---
def extract_visual_embedding(image):
    """Extracts a normalized visual feature vector combining HSV color histogram & HOG texture."""
    if image is None or image.size == 0:
        return None
    
    resized = cv2.resize(image, (64, 128))
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    
    # Color feature vector (HSV histogram)
    hist_h = cv2.calcHist([hsv], [0], None, [16], [0, 180])
    hist_s = cv2.calcHist([hsv], [1], None, [8], [0, 256])
    hist_v = cv2.calcHist([hsv], [2], None, [8], [0, 256])
    color_vec = np.concatenate([hist_h, hist_s, hist_v]).flatten()
    color_vec /= (np.linalg.norm(color_vec) + 1e-6)
    
    # Texture feature vector (Gradients)
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag, angle = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    grad_hist, _ = np.histogram(angle, bins=16, range=(0, 360), weights=mag)
    grad_vec = grad_hist.astype(np.float32)
    grad_vec /= (np.linalg.norm(grad_vec) + 1e-6)
    
    embedding = np.concatenate([color_vec, grad_vec])
    return embedding / (np.linalg.norm(embedding) + 1e-6)

def compute_similarity(emb1, emb2):
    """Cosine similarity between two embeddings (1.0 = exact match)."""
    if emb1 is None or emb2 is None:
        return 0.0
    return float(np.dot(emb1, emb2))

def build_registered_embeddings(registered_players_db):
    """Pre-computes visual embeddings for all registered players in DB."""
    embeddings = {}
    for p_id, p_info in registered_players_db.items():
        img_path = p_info.get("image_path")
        if img_path and os.path.exists(img_path):
            img = cv2.imread(img_path)
            emb = extract_visual_embedding(img)
            if emb is not None:
                embeddings[p_id] = {
                    "player_id": p_id,
                    "name": p_info.get("player_name") or p_info.get("full_name") or p_id,
                    "group_id": p_info.get("group_id", "default_group"),
                    "embedding": emb,
                    "official_photo": img_path
                }
    return embeddings

def resolve_reid_identity(crop_img, registered_embeddings, threshold=0.55):
    """Matches a bounding box crop against registered embeddings."""
    crop_emb = extract_visual_embedding(crop_img)
    if crop_emb is None or not registered_embeddings:
        return None, 0.0

    best_match = None
    best_score = -1.0

    for p_id, reg_data in registered_embeddings.items():
        sim = compute_similarity(crop_emb, reg_data["embedding"])
        if sim > best_score:
            best_score = sim
            best_match = reg_data

    if best_score >= threshold:
        return best_match, best_score
    return None, best_score

def resolve_reid_identity_dynamic(crop_img, group_embeddings_db, threshold=0.45):
    """
    Dynamically compares candidate crop against ANY size group roster (2, 3, 5+ players).
    Returns match only if similarity clears threshold.
    """
    crop_emb = extract_visual_embedding(crop_img)
    if crop_emb is None or not group_embeddings_db:
        return None, 0.0

    best_match = None
    best_score = -1.0

    for p_id, reg_data in group_embeddings_db.items():
        sim = compute_similarity(crop_emb, reg_data["embedding"])
        if sim > best_score:
            best_score = sim
            best_match = reg_data

    if best_score >= threshold:
        return best_match, best_score
        
    return None, best_score

# --- 4. MAIN COMPUTER VISION PIPELINE ---
def process_drill_and_match_leaderboard(
    video_path,
    registered_players_db,
    player_visual_ids=None,
    group_id=None,
    drill_title="Simultaneous Multi-Group Telemetry"
):
    cap = cv2.VideoCapture(video_path)
    registered_embeddings = build_registered_embeddings(registered_players_db)
    tracked_performance = {}

    frame_index = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_index += 1

        results = yolo_model.track(
            frame, 
            persist=True, 
            classes=[0], 
            tracker="custom_bytetrack.yaml",
            conf=0.35
        )

        if results[0].boxes.id is not None:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            track_ids = results[0].boxes.id.int().cpu().numpy()

            # Extract skeletal pose keypoints array (N, 17, 3) -> [x, y, confidence]
            keypoints = None
            if results[0].keypoints is not None:
                keypoints = results[0].keypoints.data.cpu().numpy()

            for idx, (box, track_id) in enumerate(zip(boxes, track_ids)):
                x1, y1, x2, y2 = map(int, box)
                w_box = max(1, x2 - x1)
                h_box = max(1, y2 - y1)

                # Extract pose keypoints for current player
                player_kpts = keypoints[idx] if keypoints is not None else None

                feet_x, feet_y = (x1 + x2) / 2.0, float(y2)
                active_zone = assign_drill_zone(feet_x, feet_y)
                meter_x, meter_y = get_real_world_coords(feet_x, feet_y)

                # Initialize or update player tracking data
                if track_id not in tracked_performance:
                    crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]
                    matched_info, reid_score = resolve_reid_identity(crop, registered_embeddings)

                    base64_crop = crop_player_avatar(frame, (x1, y1, x2, y2))
                    
                    p_name = matched_info["name"] if matched_info else f"Athlete #{track_id}"
                    p_id = matched_info["player_id"] if matched_info else f"Tracked_{track_id}"
                    p_group = matched_info["group_id"] if matched_info else (group_id or "default_group")
                    is_registered = matched_info is not None

                    tracked_performance[track_id] = {
                        "track_id": track_id,
                        "player_id": p_id,
                        "name": p_name,
                        "group_id": p_group,
                        "avatar_crop": base64_crop,
                        "video_crop": base64_crop,
                        "is_registered": is_registered,
                        "reid_confidence": round(reid_score, 2),
                        "assigned_zone": active_zone,
                        "positions": [(meter_x, meter_y)],
                        "start_frame": frame_index,
                        "last_frame": frame_index,
                        "bbox": (x1, y1, x2, y2)
                    }
                else:
                    tracked_performance[track_id]["positions"].append((meter_x, meter_y))
                    tracked_performance[track_id]["last_frame"] = frame_index
                    tracked_performance[track_id]["bbox"] = (x1, y1, x2, y2)

    cap.release()

    if not tracked_performance:
        return None

    # Calculate detailed drill stats via drill_analytics module
    leaderboard_players = []
    for track_id, pdata in tracked_performance.items():
        total_frames = max(1, pdata["last_frame"] - pdata["start_frame"])
        completion_time = round(total_frames / 30.0, 2)  # assuming standard 30fps

        # DYNAMIC CV METRIC CALCULATIONS
        positions = pdata["positions"]
        total_dist_meters = 0.0
        for i in range(len(positions) - 1):
            p1, p2 = positions[i], positions[i + 1]
            total_dist_meters += float(np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2))

        time_sec = max(0.1, completion_time)
        calc_speed_kmh = round((total_dist_meters / time_sec) * 3.6, 1)

        x_coords = [pos[0] for pos in positions]
        lateral_disp = float(np.std(x_coords)) if len(x_coords) > 1 else 0.0

        # Dynamic Frame Payload built directly from Video Telemetry
        frame_payload = {
            "player_id": pdata["player_id"],
            "team_id": pdata["group_id"],
            "completion_time_sec": completion_time,
            "target_bbox": pdata["bbox"],
            "shot_speed": calc_speed_kmh,
            "sprint_accel": calc_speed_kmh,
            "lateral_displacement_px": lateral_disp,
            "cone_hits": 0,
            "moving_towards_target": True
        }

        player_group = pdata.get("group_id", "Group_Alpha")
        analytics_result = run_drill_analysis(drill_title, frame_payload, group_id=player_group)
        
        ovr_score = analytics_result.get("score") or analytics_result.get("ovr_rating", 75)
        sprint_speed = analytics_result.get("sprint_acceleration_rate", calc_speed_kmh)
        pass_acc = analytics_result.get("passing_accuracy", 85)

        leaderboard_players.append({
            "name": pdata["name"],
            "player_id": pdata["player_id"],
            "group_id": player_group,
            "zone": pdata["assigned_zone"],
            "avatar_crop": pdata["avatar_crop"],
            "video_crop": pdata["video_crop"],
            "is_registered": pdata["is_registered"],
            "reid_confidence": pdata["reid_confidence"],
            "completion_time": f"{completion_time}s",
            "raw_speed": sprint_speed,
            "raw_pass_acc": pass_acc,
            "speed": f"{sprint_speed} km/h" if pdata["is_registered"] else "🔒 Locked",
            "pass_acc": f"{pass_acc}%" if pdata["is_registered"] else "🔒 Locked",
            "ovr_score": ovr_score,
            "coach_feedback": analytics_result.get("coach_feedback", [])
        })

    ranked_players = sorted(leaderboard_players, key=lambda x: x["ovr_score"], reverse=True)

    for idx, player in enumerate(ranked_players):
        player["rank"] = idx + 1
        player["badge"] = "TOP PERFORMER" if idx == 0 else ("VERIFIED" if player["is_registered"] else "UNVERIFIED")

    return {
        "drill_name": drill_title,
        "date": datetime.now().strftime("%B %d, %Y"),
        "active_zones": list(DRILL_ZONES.keys()),
        "players": ranked_players
    }

# --- CLI ENTRY POINT ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=str, required=True)
    parser.add_argument("--drill", type=str, default="dribble_and_pass")
    parser.add_argument("--group_id", type=str, default="Group_Alpha")
    parser.add_argument("--roster_json", type=str, required=True)
    
    args = parser.parse_args()

    active_roster_db = json.loads(args.roster_json)

    results = process_drill_and_match_leaderboard(
        video_path=args.video,
        registered_players_db=active_roster_db,
        group_id=args.group_id,
        drill_title=args.drill
    )
    print(json.dumps(results))