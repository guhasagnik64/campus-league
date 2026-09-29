# drill_analytics.py

import cv2
import os
import json
import numpy as np

from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from collections import defaultdict
import math

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, firestore


# =====================================================================
# FIREBASE / FIRESTORE INITIALIZATION
# =====================================================================

firebase_db = None


def initialize_firestore():
    """
    Initialize Firebase Admin SDK once.

    Credential lookup order:
    1. FIREBASE_CREDENTIALS environment variable
    2. firebase_credentials.json in the backend root
    """

    global firebase_db

    if firebase_db is not None:
        return firebase_db

    try:
        # Avoid initializing Firebase more than once.
        if firebase_admin._apps:
            firebase_db = firestore.client()
            return firebase_db

        credentials_path = os.getenv(
            "FIREBASE_CREDENTIALS",
            "firebase_credentials.json"
        )

        if not os.path.exists(credentials_path):
            print(
                f"[FIREBASE WARNING] Credentials file not found: "
                f"{credentials_path}"
            )
            print(
                "[FIREBASE WARNING] Firestore history saving is disabled."
            )
            return None

        cred = credentials.Certificate(credentials_path)

        firebase_admin.initialize_app(cred)

        firebase_db = firestore.client()

        print("[FIREBASE] Firestore initialized successfully.")

        return firebase_db

    except Exception as e:
        print(
            f"[FIREBASE WARNING] Firestore initialization failed: {e}"
        )

        firebase_db = None

        return None


# Initialize at module load.
initialize_firestore()


# =====================================================================
# FIRESTORE DATA SANITIZATION
# =====================================================================

def make_firestore_safe(value):
    """
    Convert NumPy / Python values into Firestore-compatible values.
    """

    if isinstance(value, dict):
        return {
            str(key): make_firestore_safe(val)
            for key, val in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            make_firestore_safe(item)
            for item in value
        ]

    if isinstance(value, np.integer):
        return int(value)

    if isinstance(value, np.floating):
        return float(value)

    if isinstance(value, np.bool_):
        return bool(value)

    if isinstance(value, np.ndarray):
        return value.tolist()

    if isinstance(value, datetime):
        return value

    return value

# =====================================================================
# FIRESTORE DYNAMIC CONFIGURATION
# =====================================================================

def get_drill_config(drill_name):
    """
    Fetch dynamic drill parameters and weights set by Admin in Firestore.
    Falls back to default parameters if non-existent.
    """
    db = initialize_firestore()
    if db is None:
        return {
            "pass_accuracy_weight": 0.4,
            "sprint_accel_weight": 0.3,
            "reception_weight": 0.3,
            "cone_penalty_points": 5
        }

    try:
        doc = db.collection("drill_configs").document(str(drill_name)).get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        print(f"[FIRESTORE WARNING] Failed to fetch drill config for {drill_name}: {e}")

    # Fallback default evaluation criteria
    return {
        "pass_accuracy_weight": 0.4,
        "sprint_accel_weight": 0.3,
        "reception_weight": 0.3,
        "cone_penalty_points": 5
    }


# =====================================================================
# FIRESTORE DRILL HISTORY PERSISTENCE
# =====================================================================

def save_analysis_to_firestore(
    analysis_result,
    player_id=None,
    group_id="Group_Alpha"
):
    """
    Save one completed CV drill analysis to Firestore.

    Creates:
        1. daily_reports/{player_id}
           -> Primary report document for real-time React subscription

        2. scorecards/{auto_id}
           -> Individual player historical report

        3. campus_leaderboard/{player_id}_{scorecard_id}
           -> Campus League leaderboard entry
    """

    db = initialize_firestore()

    if db is None:
        return False

    if not analysis_result:
        return False

    try:
        # -------------------------------------------------------------
        # Determine player ID
        # -------------------------------------------------------------
        resolved_player_id = (
            player_id
            or analysis_result.get("player_id")
            or analysis_result.get("target_player")
        )

        # Fallback to CV track ID if no registered player ID exists
        if not resolved_player_id or str(resolved_player_id).strip() in ["None", ""]:
            resolved_player_id = analysis_result.get("track_id", "Tracked_Player_Unknown")

        resolved_player_id = str(resolved_player_id)

        # Only reject unidentifiable noise
        if resolved_player_id in [
            "UNIDENTIFIED",
            "Tracked_Player_Unknown",
            ""
        ]:
            print(
                "[FIRESTORE WARNING] Invalid player_id. "
                "Analysis will not be published."
            )
            return False

        # -------------------------------------------------------------
        # Determine drill name & fetch dynamic Firebase parameters
        # -------------------------------------------------------------
        drill_name = (
            analysis_result.get("drill")
            or analysis_result.get("drill_type")
            or "General Practice Drill"
        )

        drill_config = get_drill_config(drill_name)

        # -------------------------------------------------------------
        # Determine final CV score
        # -------------------------------------------------------------
        score = analysis_result.get("score")

        if score is None:
            score = analysis_result.get("ovr_rating")

        if score is None:
            pass_acc = float(analysis_result.get("passing_accuracy", 75))
            sprint_acc = float(analysis_result.get("sprint_acceleration_rate", 75))
            reception_orient = float(analysis_result.get("reception_orientation", 75))

            w_pass = float(drill_config.get("pass_accuracy_weight", 0.4))
            w_sprint = float(drill_config.get("sprint_accel_weight", 0.3))
            w_reception = float(drill_config.get("reception_weight", 0.3))

            score = (pass_acc * w_pass) + (sprint_acc * w_sprint) + (reception_orient * w_reception)

        try:
            score = int(float(score))
        except (TypeError, ValueError):
            score = 0

        score = max(0, min(100, score))

        # -------------------------------------------------------------
        # Build coach feedback / shortcomings
        # -------------------------------------------------------------
        shortcomings = []

        coach_feedback = analysis_result.get(
            "coach_feedback",
            []
        )

        if isinstance(coach_feedback, list):
            shortcomings.extend(
                str(item)
                for item in coach_feedback
                if item
            )
        elif coach_feedback:
            shortcomings.append(str(coach_feedback))

        explicit_shortcomings = analysis_result.get(
            "shortcomings",
            []
        )

        if isinstance(explicit_shortcomings, list):
            shortcomings.extend(
                str(item)
                for item in explicit_shortcomings
                if item
            )
        elif explicit_shortcomings:
            shortcomings.append(
                str(explicit_shortcomings)
            )

        # -------------------------------------------------------------
        # Remove duplicate feedback
        # -------------------------------------------------------------
        unique_shortcomings = []

        for item in shortcomings:
            if item not in unique_shortcomings:
                unique_shortcomings.append(item)

        # -------------------------------------------------------------
        # 24-HOUR EXPIRATION
        # -------------------------------------------------------------
        now = datetime.now(timezone.utc)
        expire_at = now + timedelta(hours=24)

        # -------------------------------------------------------------
        # Build individual player scorecard
        # -------------------------------------------------------------
        firestore_data = {
            # Identity
            "playerId": resolved_player_id,
            "player_id": resolved_player_id,
            "player_name": analysis_result.get("player_name", "Player"),
            "groupId": str(group_id),

            # Drill
            "drillName": str(drill_name),
            "drill_name": str(drill_name),

            # Final CV score
            "score": score,

            # Coach/CV feedback
            "shortcomings": unique_shortcomings,
            "coachFeedback": unique_shortcomings,
            "coach_feedback": "\n".join(unique_shortcomings),
            "drawbacks": analysis_result.get("drawbacks", "\n".join(unique_shortcomings)),
            "written_breakdown": analysis_result.get("written_breakdown", ""),

            # Creation time
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,

            # 24-hour Firestore TTL field
            "ttl": expire_at,

            # Explicit expiry timestamp for frontend countdown
            "expireAt": expire_at,

            # CV metrics
            "passingAccuracy": analysis_result.get(
                "passing_accuracy"
            ),
            "pass_accuracy": analysis_result.get(
                "passing_accuracy"
            ),

            "receptionOrientation": analysis_result.get(
                "reception_orientation"
            ),

            "sprintAccelerationRate": analysis_result.get(
                "sprint_acceleration_rate"
            ),
            "sprint_speed": analysis_result.get(
                "sprint_acceleration_rate"
            ),

            # Complete evaluated CV telemetry
            "metrics": analysis_result.get(
                "metrics_evaluated",
                {}
            ),

            # Penalties generated by drill analysis
            "penaltiesApplied": analysis_result.get(
                "penalties_applied",
                0
            ),

            # Optional tracked face
            "trackedFaceUrl": analysis_result.get(
                "tracked_face_url"
            ),

            # Processing status
            "analysisStatus": analysis_result.get(
                "status",
                "Completed"
            )
        }

        # -------------------------------------------------------------
        # Make all NumPy values Firestore compatible
        # -------------------------------------------------------------
        firestore_data = make_firestore_safe(
            firestore_data
        )

        # -------------------------------------------------------------
        # 1. SAVE TO DAILY_REPORTS COLLECTION FOR FRONTEND LISTENER
        # -------------------------------------------------------------
        daily_report_ref = db.collection("daily_reports").document(resolved_player_id)
        daily_report_ref.set(firestore_data, merge=True)

        print(f"[FIRESTORE] Live daily report updated for player: {resolved_player_id}")

        # -------------------------------------------------------------
        # 2. SAVE INDIVIDUAL HISTORICAL SCORECARD
        # -------------------------------------------------------------
        scorecard_ref = (
            db.collection("scorecards")
            .document()
        )

        scorecard_ref.set(
            firestore_data
        )

        scorecard_id = scorecard_ref.id

        print(
            "[FIRESTORE] Saved individual scorecard: "
            f"player={resolved_player_id}, "
            f"drill={drill_name}, "
            f"score={score}, "
            f"expires={expire_at.isoformat()}"
        )

        # -------------------------------------------------------------
        # 3. SAVE CAMPUS LEAGUE LEADERBOARD ENTRY
        # -------------------------------------------------------------
        leaderboard_data = {
            "playerId": resolved_player_id,

            "groupId": str(group_id),

            "drillName": str(drill_name),

            "score": score,

            "passingAccuracy": analysis_result.get(
                "passing_accuracy"
            ),

            "receptionOrientation": analysis_result.get(
                "reception_orientation"
            ),

            "sprintAccelerationRate": analysis_result.get(
                "sprint_acceleration_rate"
            ),

            "metrics": analysis_result.get(
                "metrics_evaluated",
                {}
            ),

            "createdAt": firestore.SERVER_TIMESTAMP,

            # Same 24-hour expiry
            "ttl": expire_at,

            "expireAt": expire_at,

            # Link leaderboard entry back to report
            "scorecardId": scorecard_id,

            "analysisStatus": analysis_result.get(
                "status",
                "Completed"
            )
        }

        leaderboard_data = make_firestore_safe(
            leaderboard_data
        )

        leaderboard_ref = (
            db.collection("campus_leaderboard")
            .document(
                f"{resolved_player_id}_{scorecard_id}"
            )
        )

        leaderboard_ref.set(
            leaderboard_data
        )

        print(
            "[FIRESTORE] Published leaderboard entry: "
            f"player={resolved_player_id}, "
            f"score={score}"
        )

        return True

    except Exception as e:
        print(
            "[FIRESTORE ERROR] Failed to save/publish "
            f"drill analysis: {e}"
        )
        return False


# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def get_distance(p1, p2):

    if p1 is None or p2 is None:
        return None

    return float(
        np.sqrt(
            (p1[0] - p2[0]) ** 2
            + (p1[1] - p2[1]) ** 2
        )
    )


def apply_cone_penalties(
    base_score,
    cone_hits
):

    penalty = cone_hits * 10

    final_score = max(
        0,
        base_score - penalty
    )

    return final_score, penalty


def save_player_face_crop(
    frame,
    target_bbox,
    save_path="public/tracked_player_face.jpg"
):

    if frame is None or target_bbox is None:
        return False

    try:

        x1, y1, x2, y2 = target_bbox

        h, w, _ = frame.shape

        x1 = max(0, int(x1))
        y1 = max(0, int(y1))

        x2 = min(w, int(x2))
        y2 = min(h, int(y2))

        player_height = y2 - y1

        if player_height <= 0:
            return False

        head_y2 = int(
            y1 + (player_height * 0.30)
        )

        face_crop = frame[
            y1:head_y2,
            x1:x2
        ]

        if face_crop.size > 0:

            directory = os.path.dirname(
                save_path
            )

            if directory:
                os.makedirs(
                    directory,
                    exist_ok=True
                )

            cv2.imwrite(
                save_path,
                face_crop
            )

            return True

    except Exception as e:

        print(
            f"Error cropping player face: {e}"
        )

    return False


# =====================================================================
# UNIVERSAL JSON EVALUATOR ENGINE
# =====================================================================

def analyze_universal_drill(
    frame_data,
    drill_rules_json
):
    """
    Evaluates raw CV telemetry against dynamic
    JSON parameter rules.

    Supports:
        - arbitrary metrics
        - weighted scoring
        - conditional penalties
        - thresholds
        - coach feedback
    """

    if isinstance(
        drill_rules_json,
        str
    ):
        rules = json.loads(
            drill_rules_json
        )
    else:
        rules = drill_rules_json

    player_id = frame_data.get(
        "player_id",
        "Unknown"
    )

    # -------------------------------------------------------------
    # Extract required metrics
    # -------------------------------------------------------------

    metric_values = {}

    for metric_key in rules.get(
        "required_metrics",
        []
    ):

        try:

            metric_values[metric_key] = float(
                frame_data.get(
                    metric_key,
                    75.0
                )
            )

        except (
            TypeError,
            ValueError
        ):

            metric_values[metric_key] = 75.0

    # -------------------------------------------------------------
    # Weighted composite score
    # -------------------------------------------------------------

    weights = rules.get(
        "weights",
        {}
    )

    weighted_score = 0.0
    total_weight = 0.0

    for metric_key, weight in weights.items():

        val = metric_values.get(
            metric_key,
            75.0
        )

        weighted_score += (
            val * float(weight)
        )

        total_weight += float(weight)

    if total_weight > 0:

        base_score = (
            weighted_score
            / total_weight
        )

    else:

        base_score = 75.0

    # -------------------------------------------------------------
    # Conditional penalties
    # -------------------------------------------------------------

    penalties = 0

    feedback_msgs = []

    for rule in rules.get(
        "conditional_rules",
        []
    ):

        metric = rule.get(
            "metric"
        )

        operator = rule.get(
            "operator"
        )

        target_val = rule.get(
            "value"
        )

        penalty_pts = rule.get(
            "penalty",
            0
        )

        current_val = frame_data.get(
            metric,
            0
        )

        try:

            condition_met = False

            if (
                operator == "<"
                and current_val < target_val
            ):
                condition_met = True

            elif (
                operator == ">"
                and current_val > target_val
            ):
                condition_met = True

            elif (
                operator == "=="
                and current_val == target_val
            ):
                condition_met = True

            if condition_met:

                penalties += float(
                    penalty_pts
                )

                if rule.get("message"):

                    feedback_msgs.append(
                        rule.get("message")
                    )

        except Exception as e:

            print(
                "[WARN] Conditional rule "
                f"evaluation failed: {e}"
            )

    # -------------------------------------------------------------
    # Final score
    # -------------------------------------------------------------

    final_score = max(
        0,
        min(
            100,
            int(
                base_score - penalties
            )
        )
    )

    return {
        "player_id": player_id,

        "drill": rules.get(
            "drill_name",
            "Custom Drill"
        ),

        "score": final_score,

        "metrics_evaluated":
            metric_values,

        "penalties_applied":
            penalties,

        "coach_feedback":
            feedback_msgs,

        "sprint_acceleration_rate":
            metric_values.get(
                "sprint_accel",
                75.0
            ),

        "passing_accuracy":
            metric_values.get(
                "passing_accuracy",
                80.0
            ),

        "reception_orientation":
            metric_values.get(
                "reception_orientation",
                80.0
            )
    }


# =====================================================================
# CORE DRILL ANALYZERS
# =====================================================================

def analyze_dribbling(frame_data):

    player_id = frame_data.get(
        "player_id",
        "Unknown"
    )

    ball_pos = frame_data.get(
        "ball"
    )

    feet_pos = frame_data.get(
        "player_feet"
    )

    cones = frame_data.get(
        "cones",
        []
    )

    dist_to_ball = get_distance(
        feet_pos,
        ball_pos
    )

    if dist_to_ball is None:

        return {
            "player_id": player_id,
            "drill": "Dribbling",
            "status":
                "Searching for Ball/Player"
        }

    close_control = (
        dist_to_ball < 45.0
    )

    total_passes = max(
        frame_data.get(
            "total_passes",
            1
        ),
        1
    )

    acc_passes = frame_data.get(
        "accurate_passes",
        0
    )

    if "accurate_passes" in frame_data:

        passing_accuracy = round(
            (
                acc_passes
                / total_passes
            ) * 100
        )

    else:

        passing_accuracy = round(
            frame_data.get(
                "pass_acc_pct",
                85.0
            )
        )

    reception_orientation = round(
        frame_data.get(
            "body_orientation_score",
            80.0
        )
    )

    peak_accel = frame_data.get(
        "accel_m_s2",
        2.5
    )

    sprint_accel_rate = min(
        100,
        round(
            (
                peak_accel
                / 3.5
            ) * 100
        )
    )

    # Dynamic score for this drill.
    control_score = (
        100
        if close_control
        else 70
    )

    score = int(
        (
            control_score * 0.40
        )
        + (
            passing_accuracy * 0.30
        )
        + (
            reception_orientation * 0.30
        )
    )

    feedback = []

    if close_control:

        feedback.append(
            "⚡ Excellent Close Ball Control"
        )

    else:

        feedback.append(
            "⚠️ Ball Pushed Too Far Ahead"
        )

    if passing_accuracy >= 80:

        feedback.append(
            "🎯 Pass Delivered On Target"
        )

    else:

        feedback.append(
            "⚠️ Pass Inaccurate or Off-Target"
        )

    return {
        "player_id": player_id,
        "drill": "Dribbling",

        "touch_detected":
            close_control,

        "ball_proximity_px":
            round(
                dist_to_ball,
                2
            ),

        "cones_detected":
            len(cones),

        "control_rating":
            (
                "High"
                if close_control
                else "Loose Control"
            ),

        "passing_accuracy":
            passing_accuracy,

        "reception_orientation":
            reception_orientation,

        "sprint_acceleration_rate":
            sprint_accel_rate,

        "score":
            max(
                0,
                min(100, score)
            ),

        "coach_feedback":
            feedback
    }


# =====================================================================
# DRIBBLING + PASS
# =====================================================================

def analyze_dribble_and_pass(
    frame_data
):

    player_id = frame_data.get(
        "player_id",
        "Unknown"
    )

    completion_time = frame_data.get(
        "completion_time",
        0.0
    )

    return {
        "player_id": player_id,
        "drill": "Dribble and Pass",
        "completion_time": completion_time
    }


# =====================================================================
# MULTI-GROUP & MULTI-PLAYER DYNAMIC PIPELINE EXTENSION
# =====================================================================

def _distance_xy(a, b):
    if not a or not b:
        return None
    try:
        return float(
            math.sqrt(
                (float(a[0]) - float(b[0])) ** 2 +
                (float(a[1]) - float(b[1])) ** 2
            )
        )
    except (TypeError, ValueError, IndexError):
        return None


def build_player_history(frame_data):
    history = defaultdict(list)
    if not isinstance(frame_data, list):
        return history

    for frame in frame_data:
        if not isinstance(frame, dict):
            continue

        timestamp = float(frame.get("timestamp", 0.0))
        players = frame.get("players", [])
        if not isinstance(players, list):
            continue

        for player in players:
            if not isinstance(player, dict):
                continue
            track_id = player.get("track_id")
            if track_id is None:
                continue

            position = player.get("foot") or player.get("position") or [player.get("x", 0), player.get("y", 0)]
            if position is None:
                continue

            history[str(track_id)].append({
                "timestamp": timestamp,
                "position": position,
                "speed": player.get("speed"),
                "acceleration": player.get("acceleration"),
                "body_orientation": player.get("body_orientation")
            })

    return history


def calculate_player_interaction_score(player_a_history, player_b_history, max_group_distance=450.0):
    if not player_a_history or not player_b_history:
        return 0.0

    distances = []
    length = min(len(player_a_history), len(player_b_history))

    for index in range(length):
        a = player_a_history[index]["position"]
        b = player_b_history[index]["position"]
        distance = _distance_xy(a, b)
        if distance is not None:
            distances.append(distance)

    if not distances:
        return 0.0

    close_frames = sum(1 for distance in distances if distance <= max_group_distance)
    proximity_score = (close_frames / len(distances)) * 100.0
    return round(max(0.0, min(100.0, proximity_score)), 2)


def generate_candidate_groups(player_history, group_size=3, max_group_distance=450.0):
    player_ids = list(player_history.keys())
    candidates = []

    for combination in combinations(player_ids, group_size):
        a, b, c = combination
        ab = calculate_player_interaction_score(player_history[a], player_history[b], max_group_distance)
        ac = calculate_player_interaction_score(player_history[a], player_history[c], max_group_distance)
        bc = calculate_player_interaction_score(player_history[b], player_history[c], max_group_distance)
        group_score = (ab + ac + bc) / 3.0

        candidates.append({
            "players": list(combination),
            "group_score": round(group_score, 2)
        })

    candidates.sort(key=lambda item: item["group_score"], reverse=True)
    return candidates


def assign_stable_groups(player_history, group_size=3, max_group_distance=450.0, minimum_group_score=35.0):
    candidates = generate_candidate_groups(player_history, group_size=group_size, max_group_distance=max_group_distance)
    assigned_players = set()
    groups = []
    group_number = 1

    for candidate in candidates:
        players = candidate["players"]
        if candidate["group_score"] < minimum_group_score:
            continue
        if any(player_id in assigned_players for player_id in players):
            continue

        groups.append({
            "group_id": f"Group_{group_number:03d}",
            "players": players,
            "group_score": candidate["group_score"]
        })
        assigned_players.update(players)
        group_number += 1

    return groups


def analyze_pass_support_group(group_id, player_ids, frame_data):
    if len(player_ids) != 3:
        return {"group_id": group_id, "status": "Invalid group size", "players": []}

    player_metrics = {str(pid): {"passes_attempted": 0, "passes_completed": 0, "receptions": 0, "speed_values": [], "acceleration_values": [], "reception_orientation": []} for pid in player_ids}
    group_events = []

    for frame in frame_data:
        if not isinstance(frame, dict):
            continue
        players = frame.get("players", [])
        player_lookup = {}
        for player in players:
            track_id = player.get("track_id")
            if track_id is not None and str(track_id) in player_ids:
                player_lookup[str(track_id)] = player

        if len(player_lookup) != 3:
            continue

        for player_id, player in player_lookup.items():
            metrics = player_metrics[player_id]
            if player.get("speed") is not None:
                metrics["speed_values"].append(float(player["speed"]))
            if player.get("acceleration") is not None:
                metrics["acceleration_values"].append(float(player["acceleration"]))
            if player.get("body_orientation") is not None:
                metrics["reception_orientation"].append(float(player["body_orientation"]))

        pass_event = frame.get("pass_event")
        if pass_event:
            passer_id = str(pass_event.get("passer_id"))
            receiver_id = str(pass_event.get("receiver_id"))
            if passer_id in player_metrics and receiver_id in player_metrics:
                player_metrics[passer_id]["passes_attempted"] += 1
                if pass_event.get("completed", False):
                    player_metrics[passer_id]["passes_completed"] += 1
                    player_metrics[receiver_id]["receptions"] += 1
                group_events.append({"type": "pass", "timestamp": frame.get("timestamp"), "passer_id": passer_id, "receiver_id": receiver_id, "completed": bool(pass_event.get("completed", False))})

    individual_results = []
    for player_id in player_ids:
        metrics = player_metrics[str(player_id)]
        attempts = metrics["passes_attempted"]
        completed = metrics["passes_completed"]
        passing_accuracy = (completed / attempts * 100.0) if attempts > 0 else 75.0
        reception_orientation = sum(metrics["reception_orientation"]) / len(metrics["reception_orientation"]) if metrics["reception_orientation"] else 80.0
        peak_acceleration = max(metrics["acceleration_values"]) if metrics["acceleration_values"] else 2.5
        sprint_acceleration_rate = min(100.0, max(0.0, (peak_acceleration / 3.5) * 100.0))

        individual_score = int(round((passing_accuracy * 0.40) + (reception_orientation * 0.30) + (sprint_acceleration_rate * 0.30)))
        individual_results.append({
            "player_id": str(player_id),
            "groupId": str(group_id),
            "drill": "3-Player Pass & Support",
            "passing_accuracy": round(passing_accuracy, 2),
            "reception_orientation": round(reception_orientation, 2),
            "sprint_acceleration_rate": round(sprint_acceleration_rate, 2),
            "score": max(0, min(100, individual_score))
        })

    group_score = round(sum(p["score"] for p in individual_results) / len(individual_results)) if individual_results else 0
    return {
        "group_id": group_id,
        "group_size": 3,
        "players": individual_results,
        "group_score": group_score,
        "events": group_events,
        "total_passes": len(group_events),
        "status": "Completed"
    }


def analyze_all_pass_support_groups(frame_data, group_size=3):
    if not isinstance(frame_data, list):
        return {"status": "Invalid frame data", "groups": [], "players": []}

    player_history = build_player_history(frame_data)
    if not player_history:
        return {"status": "No tracked players detected", "groups": [], "players": []}

    groups = assign_stable_groups(player_history, group_size=group_size)
    if not groups:
        return {"status": "No valid groups detected", "groups": [], "players": []}

    group_results = []
    all_players = []

    for group in groups:
        group_result = analyze_pass_support_group(group["group_id"], group["players"], frame_data)
        group_results.append(group_result)
        all_players.extend(group_result.get("players", []))

    leaderboard = sorted(all_players, key=lambda p: p.get("score", 0), reverse=True)
    for rank, player in enumerate(leaderboard, start=1):
        player["global_rank"] = rank

    session_score = round(sum(p["score"] for p in leaderboard) / len(leaderboard)) if leaderboard else 0
    return {
        "status": "Completed",
        "drill": "3-Player Pass & Support",
        "group_size": 3,
        "number_of_groups": len(group_results),
        "session_score": session_score,
        "groups": group_results,
        "players": leaderboard
    }