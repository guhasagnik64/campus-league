import numpy as np
import sys
import os
import json
from datetime import datetime
from drill_analytics import save_analysis_to_firestore, initialize_firestore

# ==========================================
# DYNAMIC RATING & INSTRUCTION CALCULATOR
# ==========================================

def calculate_dynamic_rating(current_rating, session_performance, alpha=0.4):
    """Calculates exponential moving average for skill progression."""
    new_rating = round((1 - alpha) * current_rating + alpha * session_performance)
    return max(10, min(99, new_rating))

def process_drill_session(player_id, drill_type, raw_metrics, current_player_profile, instructions=""):
    """
    Dynamically adjusts skills based on raw tracking metrics and tactical instructions.
    """
    base_score = raw_metrics.get('score', 75)
    top_speed = raw_metrics.get('top_speed', 22.0)

    skill_mapping = {
        "1. Dribbling Drill": "dribbling",
        "dribble_pass": "dribbling",
        "Dribbling & Pass Drill": "dribbling",
        "2. Pass and Support": "passing",
        "3. Pass and Move": "passing",
        "PASS_SUPPORT": "passing",
        "4. SAQ (Speed Agility Quickness)": "saq",
        "10. Shooting Precision Drill": "shooting"
    }
    primary_skill = skill_mapping.get(drill_type, "passing")

    instruction_modifier = 0
    instructions_lower = instructions.lower()

    if "high intensity" in instructions_lower or "sprint" in instructions_lower:
        if top_speed > 25.0:
            instruction_modifier += 5
        else:
            instruction_modifier -= 3

    if "accuracy" in instructions_lower or "precision" in instructions_lower:
        instruction_modifier += 3 if base_score >= 80 else -4

    adjusted_performance = max(10, min(99, base_score + instruction_modifier))

    skills = current_player_profile.get("skills", {"passing": 70, "dribbling": 70, "saq": 70, "shooting": 70})
    old_skill_rating = skills.get(primary_skill, 70)
    old_ovr = current_player_profile.get("ovr", 70)

    updated_skill_rating = calculate_dynamic_rating(old_skill_rating, adjusted_performance)
    skills[primary_skill] = updated_skill_rating

    if top_speed > 26.0:
        skills["saq"] = calculate_dynamic_rating(skills.get("saq", 70), 88)

    new_ovr = round(sum(skills.values()) / len(skills))
    ovr_delta = new_ovr - old_ovr
    trend = f"+{ovr_delta}" if ovr_delta > 0 else f"{ovr_delta}"

    return {
        "player_id": player_id,
        "ovr": new_ovr,
        "skills": skills,
        "trend": trend,
        "last_drill": drill_type,
        "session_score": adjusted_performance,
        "top_speed": top_speed
    }

# ==========================================
# ATTIRE PHOTO / CROP RESOLVER
# ==========================================

def get_player_avatar(player_id_str, public_dir):
    """
    Dynamic Avatar Resolver:
    1. Checks if the player uploaded a front attire photo (e.g., Spurs_1tracking.jpeg or attire check-in upload).
    2. Fallback: Uses dynamic face crop extracted from video tracking.
    """
    attire_upload_path = os.path.join(public_dir, 'uploads', f"{player_id_str}_attire.jpg")
    spurs_sample_path = os.path.join(public_dir, 'uploads', 'Spurs_1tracking.jpeg')
    video_crop_path = os.path.join(public_dir, 'crops', f"crop_{player_id_str.lower()}.jpg")

    if os.path.exists(attire_upload_path):
        return f"/uploads/{player_id_str}_attire.jpg", True
    elif os.path.exists(spurs_sample_path) and "arin" in player_id_str.lower():
        return "/uploads/Spurs_1tracking.jpeg", True
    elif os.path.exists(video_crop_path):
        return f"/crops/crop_{player_id_str.lower()}.jpg", False
    else:
        return f"/crops/crop_{player_id_str.lower()}.jpg", False

# ==========================================
# CACHE EXPORT HELPER FUNCTION
# ==========================================

def export_telemetry_cache(tenant_id="default_facility", player_id="PLAYER_1", player_name="Arin", drill_type="PASS_SUPPORT", updated_profile=None, instructions="", raw_rows=None):
    # Target public directory directly for Vite access
    public_dir = os.path.join(os.getcwd(), 'public')
    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(os.path.join(public_dir, 'crops'), exist_ok=True)
    os.makedirs(os.path.join(public_dir, 'uploads'), exist_ok=True)

    json_cache_path = os.path.join(public_dir, 'coach_intel_cache.json')

    drill_title = drill_type.replace('_', ' ').title()
    score = updated_profile.get("session_score", 80) if updated_profile else 80
    ovr = updated_profile.get("ovr", 74) if updated_profile else 74
    top_speed = updated_profile.get("top_speed", 24.5) if updated_profile else 24.5
    skills = updated_profile.get("skills", {}) if updated_profile else {}

    # Dynamic image resolution for Rank 1 Player
    p1_avatar, p1_registered = get_player_avatar(player_name, public_dir)

    # Dynamic Leaderboard population using tracking rows or live video telemetry
    leaderboard_players = []

    if raw_rows and len(raw_rows) >= 3:
        # Dynamically build leaderboard from live telemetry metrics for all tracked players
        for idx, row in enumerate(raw_rows[:3]):
            entity_name = player_name if idx == 0 else f"Unregistered Player #{idx+1}"
            pid_str = f"player_{idx+1}" if idx > 0 else player_name
            avatar_path, is_reg = get_player_avatar(pid_str, public_dir)
            
            p_ovr = int(row[3]) if row[3] else (ovr - idx * 4)
            p_speed = float(row[4]) if row[4] else (top_speed - idx * 1.5)
            p_acc = int(row[2]) if row[2] else (skills.get('passing', 73) - idx * 5)

            leaderboard_players.append({
                "rank": idx + 1,
                "name": entity_name,
                "player_id": f"Tracked_{pid_str.replace(' ', '_')}",
                "avatar_crop": avatar_path,
                "speed": f"{p_speed:.1f} km/h",
                "pass_acc": f"{p_acc}%",
                "ovr_score": p_ovr,
                "is_registered": is_reg or (idx == 0)
            })
    else:
        # Dynamic multi-player default generation with real photo check
        p2_avatar, p2_registered = get_player_avatar("player_2", public_dir)
        p3_avatar, p3_registered = get_player_avatar("player_3", public_dir)

        leaderboard_players = [
            {
                "rank": 1,
                "name": player_name,
                "player_id": f"Tracked_{player_name.replace(' ', '_')}",
                "avatar_crop": p1_avatar,
                "speed": f"{top_speed:.1f} km/h",
                "pass_acc": f"{skills.get('passing', 73)}%",
                "ovr_score": ovr,
                "is_registered": p1_registered
            },
            {
                "rank": 2,
                "name": "Unregistered Player #2",
                "player_id": "Crop_002",
                "avatar_crop": p2_avatar,
                "speed": f"{max(15.0, top_speed - 2.8):.1f} km/h",
                "pass_acc": f"{max(50, skills.get('passing', 73) - 6)}%",
                "ovr_score": max(50, ovr - 5),
                "is_registered": p2_registered
            },
            {
                "rank": 3,
                "name": "Unregistered Player #3",
                "player_id": "Crop_003",
                "avatar_crop": p3_avatar,
                "speed": f"{max(14.0, top_speed - 4.2):.1f} km/h",
                "pass_acc": f"{max(45, skills.get('passing', 73) - 10)}%",
                "ovr_score": max(45, ovr - 9),
                "is_registered": p3_registered
            }
        ]

    leaderboard_entry = {
        "drill_id": f"{drill_type}_{datetime.now().strftime('%Y%m%d')}",
        "drill_name": drill_title,
        "date": datetime.now().strftime("%B %d, %Y"),
        "players": leaderboard_players
    }

    telemetry_payload = {
        "generalScore": score,
        "coachReport": f"Dynamic Evaluation ({drill_title}): Performance score set to {score}%.",
        "leaderboardFeed": [leaderboard_entry],
        "individualPortals": {
            player_name: {
                "metadata": {
                    "position": "Midfielder",
                    "retention": f"{skills.get('passing', ovr)}% Accuracy",
                    "topSpeed": f"{top_speed:.1f} km/h",
                    "finalScore": score
                },
                "content": f"Passing: {skills.get('passing', 70)} | OVR: {ovr}."
            }
        }
    }

    with open(json_cache_path, "w") as f:
        json.dump(telemetry_payload, f, indent=4)

    print(f"✅ Telemetry payload dynamically updated inside {json_cache_path}")

# ==========================================
# MAIN ANALYTICS ENGINE
# ==========================================

def analyze_match(tenant_id="default_facility", facility_type="ACADEMY", player_name="Arin", drill_type="PASS_SUPPORT", instructions="High intensity precision passing"):
    print(f"\n--- SCOUTING INTEL REPORT (TENANT: {tenant_id} | MODE: {facility_type} | PLAYER: {player_name} | DRILL: {drill_type}) ---")

    rows = []
    db = initialize_firestore()
    
    if db is not None:
        try:
            docs = db.collection("live_analytics").where("tenant_id", "==", tenant_id).get()
            for doc in docs:
                data = doc.to_dict()
                rows.append((
                    data.get("entity_id", "PLAYER_1"),
                    data.get("velocity_score", 24.0),
                    data.get("technical_score", 75),
                    data.get("suggestion", "")
                ))
        except Exception as e:
            print(f"[FIRESTORE WARNING] Failed to query live_analytics: {e}")

    if not rows:
        print(f"⚠️ No tracking data found in database for Tenant ID '{tenant_id}'. Running seed calculation.")
        dynamic_seed = sum(ord(c) for c in (player_name + drill_type)) % 25
        raw_metrics = {'score': 70 + dynamic_seed, 'top_speed': 22.0 + (dynamic_seed % 8)}
        current_ovr = 70 + (dynamic_seed % 5)
    else:
        latest_row = rows[-1]
        raw_metrics = {
            'score': int(latest_row[2] or 75), 
            'top_speed': float(latest_row[1] or 24.0)
        }
        current_ovr = int(latest_row[2] or 72)

    sample_player_profile = {
        "ovr": current_ovr,
        "skills": {"passing": current_ovr - 2, "dribbling": current_ovr + 3, "saq": current_ovr - 1, "shooting": current_ovr}
    }

    updated_profile = process_drill_session(
        player_id="PLAYER_1",
        drill_type=drill_type,
        raw_metrics=raw_metrics,
        current_player_profile=sample_player_profile,
        instructions=instructions
    )

    print(f"\n--- UPDATED DYNAMIC RATING ---")
    print(f"Player ID: {updated_profile['player_id']}")
    print(f"New Overall (OVR): {updated_profile['ovr']} ({updated_profile['trend']})")
    print(f"Updated Skills: {updated_profile['skills']}")

    # Export local JSON cache
    export_telemetry_cache(
        tenant_id=tenant_id,
        player_id=updated_profile["player_id"],
        player_name=player_name,
        drill_type=drill_type,
        updated_profile=updated_profile,
        instructions=instructions,
        raw_rows=rows
    )

    # DIRECT CLOUD FIRESTORE SYNC FOR PLAYER SCORECARD
    save_analysis_to_firestore({
        "player_id": player_name,
        "drill": drill_type,
        "score": updated_profile["ovr"],
        "sprint_acceleration_rate": updated_profile["skills"].get("saq", 70),
        "passing_accuracy": updated_profile["skills"].get("passing", 70),
        "reception_orientation": updated_profile["skills"].get("dribbling", 70),
        "coach_feedback": [
            f"Tactical instruction applied: '{instructions}'",
            f"Session Performance Score: {updated_profile['session_score']}%"
        ]
    }, player_id=player_name)

if __name__ == "__main__":
    analyze_match()