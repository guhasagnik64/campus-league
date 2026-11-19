"""
dribble_analysis.py - real dribbling analysis for cone / slalom drills.

What it measures from the video (nothing is invented):
  * players   - YOLO pose model with tracking (boxes + ankle keypoints)
  * the ball  - YOLO "sports ball" detector (COCO class 32)
  * the cones - fixed pixel positions for a steady camera (see DEFAULT_CONES);
                frames where the camera has moved are detected and skipped

Per player it works out touches, close-control share, left/right foot use,
cones cleared, cones touched, slalom time and times the ball got away. The
numbers are scored by drill_analytics.analyze_dribbling_session() and can be
published to Firestore with drill_analytics.save_analysis_to_firestore().

Example (from the project folder):
  python3 dribble_analysis.py --video clip.mp4 --drill_name ft_foot_outside_cut \
      --entity_id user_1793429157605 --player "Sagnik Guha" --out result.json

Check the cone positions first (no AI models needed). Pick a time when the camera
is steady (for the 17 Nov clip that is 10 s - 90 s):
  python3 dribble_analysis.py --video clip.mp4 --cone_preview cones.jpg --preview_at 40 --preview_only

Limits you should know about:
  * Foot used is read from the pose model's left/right ankles. From a side-on
    camera one leg hides the other, so treat left/right as indicative.
  * Ball detection is the weak point for a small ball at 720p. The report
    includes ball_detect_rate; below 40% the result is flagged low reliability.
    A larger model (--ball_model yolov8s.pt) and --ball_imgsz 1280 help.
"""
import os
import sys
import json
import math
import sqlite3
import argparse
from datetime import datetime

import numpy as np

# ---------------------------------------------------------------------
# Tunable settings (distances are multiples of the player's body height,
# so they work for near and far kids alike)
# ---------------------------------------------------------------------
ANALYSIS_FPS = 10.0            # frames analysed per second of video
PROCESS_WIDTH = 1280           # frames are resized to this width; cone coordinates use it
CLOSE_CONTROL_H = 0.30         # ball this close to an ankle = close control
TOUCH_H = 0.18                 # ball this close to an ankle = a touch
LOOSE_H = 1.00                 # ball further than this from the feet = got away
POSSESSION_H = 2.50            # ball must be within this of the feet to belong to a player
MOVING_H_PER_SEC = 0.25        # a dribbler moves at least this many body-heights per second
TOUCH_DEBOUNCE_SEC = 0.25      # minimum time between two counted touches
CONE_HIT_H = 0.12              # ball/foot within this of a cone centre = cone touched
CONE_HIT_MIN_PX, CONE_HIT_MAX_PX = 12.0, 30.0
CONE_PASS_BAND_H = 1.5         # how far from the cone line a crossing still counts
BALL_MEMORY_SEC = 0.5          # keep the last ball position this long if detection drops
MIN_DRIBBLE_FRAMES = 8         # tracks with less dribbling than this are bystanders
CAMERA_SHIFT_MAX_PX = 30.0     # skip frames where the view has moved more than this vs the reference
CAMERA_MIN_RESPONSE = 0.40     # ...or where it no longer matches the reference view at all

# Cone positions in 1280-pixel-wide frame coordinates for the STEADY camera view
# of the 17 Nov 2026 recording (about 10 s - 90 s of that clip; the camera was being
# moved at the start). 8 yellow cones on the turf. Re-measure for a new camera
# position and pass them with --cones "x,y;x,y;...".
DEFAULT_CONES = [
    (213, 521), (336, 521), (453, 521), (593, 521),
    (714, 521), (847, 521), (984, 521), (1127, 523),
]

COCO_L_ANKLE, COCO_R_ANKLE = 15, 16


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def parse_cones(text):
    """'x,y;x,y;...' -> [(x, y), ...] sorted left to right."""
    cones = []
    for chunk in text.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        x, y = chunk.split(",")
        cones.append((float(x), float(y)))
    return sorted(cones)


def infer_target_foot(drill_name):
    """Left/right-foot drills are scored on that foot only. 'ft_foot_...' is the
    existing key for the left-foot outside cut drill."""
    name = (drill_name or "").lower()
    if "right_foot" in name or "rt_foot" in name:
        return "right"
    if "left_foot" in name or "ft_foot" in name:
        return "left"
    return None


# ---------------------------------------------------------------------
# Analyzer: turns per-frame detections into per-player dribbling metrics.
# It knows nothing about YOLO, so it can be tested with simulated data.
# ---------------------------------------------------------------------
class DribbleAnalyzer:
    def __init__(self, cones):
        self.cones = [(float(x), float(y)) for x, y in cones]
        self.tracks = {}
        self.frames_total = 0
        self.frames_with_ball = 0
        self._line = None
        if len(self.cones) >= 2:
            xs = np.array([c[0] for c in self.cones])
            ys = np.array([c[1] for c in self.cones])
            slope, intercept = np.polyfit(xs, ys, 1)
            self._line = (float(slope), float(intercept))

    def _new_track(self):
        return {
            "frames": 0, "dribble_frames": 0, "close_frames": 0,
            "touches": 0, "left_touches": 0, "right_touches": 0,
            "last_touch_t": -1e9, "loose_events": 0, "in_loose": False,
            "last_feet": None, "last_t": None,
            "last_ball": None, "last_ball_t": None,
            "cones_crossed": {}, "cone_hits": 0, "cone_in_hit": set(),
            "weave_sign": 0, "weave_crossings": 0,
            "first_t": None, "last_seen_t": None,
        }

    def update(self, t, persons, balls, balls_detected=True):
        """
        t        : time in seconds
        persons  : [{"track_id", "bbox": (x1,y1,x2,y2), "l_ankle": (x,y)|None, "r_ankle": (x,y)|None}]
        balls    : [(x, y, conf)] ball centres for this frame
        balls_detected: False when `balls` is a remembered position, not a fresh detection
        """
        self.frames_total += 1
        if balls and balls_detected:
            self.frames_with_ball += 1

        for person in persons:
            tid = person["track_id"]
            x1, y1, x2, y2 = person["bbox"]
            body_h = max(1.0, y2 - y1)
            feet = ((x1 + x2) / 2.0, y2)
            st = self.tracks.setdefault(tid, self._new_track())

            st["frames"] += 1
            if st["first_t"] is None:
                st["first_t"] = t
            st["last_seen_t"] = t

            # Is this player moving?
            moving = False
            if st["last_feet"] is not None and st["last_t"] is not None and t > st["last_t"]:
                speed = _dist(feet, st["last_feet"]) / (t - st["last_t"])
                moving = speed >= MOVING_H_PER_SEC * body_h
            st["last_feet"], st["last_t"] = feet, t

            # Foot points to measure the ball against
            foot_points = []
            if person.get("l_ankle"):
                foot_points.append(("L", person["l_ankle"]))
            if person.get("r_ankle"):
                foot_points.append(("R", person["r_ankle"]))
            if not foot_points:
                foot_points = [("?", feet)]

            # Nearest ball to this player's feet
            best = None  # (distance, ball, foot_label)
            for ball in balls:
                bxy = (ball[0], ball[1])
                for label, pt in foot_points:
                    d = _dist(pt, bxy)
                    if best is None or d < best[0]:
                        best = (d, bxy, label)

            if best is None or best[0] > POSSESSION_H * body_h or not moving:
                st["in_loose"] = False
                if best is None or best[0] > POSSESSION_H * body_h:
                    st["last_ball"] = None
                continue

            dist_to_ball, ball_xy, foot_label = best
            st["dribble_frames"] += 1

            if dist_to_ball <= CLOSE_CONTROL_H * body_h:
                st["close_frames"] += 1

            # Touches (debounced) and which foot
            if dist_to_ball <= TOUCH_H * body_h and (t - st["last_touch_t"]) >= TOUCH_DEBOUNCE_SEC:
                st["touches"] += 1
                st["last_touch_t"] = t
                if foot_label == "L":
                    st["left_touches"] += 1
                elif foot_label == "R":
                    st["right_touches"] += 1

            # Ball got away from the feet (with hysteresis so one escape counts once)
            if dist_to_ball > LOOSE_H * body_h:
                if not st["in_loose"]:
                    st["loose_events"] += 1
                    st["in_loose"] = True
            elif dist_to_ball <= 0.7 * LOOSE_H * body_h:
                st["in_loose"] = False

            # Cones: crossings, touches
            hit_r = min(CONE_HIT_MAX_PX, max(CONE_HIT_MIN_PX, CONE_HIT_H * body_h))
            prev = st["last_ball"]
            prev_t = st["last_ball_t"]
            prev_ok = prev is not None and prev_t is not None and (t - prev_t) <= 0.6
            for i, (cx, cy) in enumerate(self.cones):
                if prev_ok and (prev[0] - cx) * (ball_xy[0] - cx) < 0:
                    near_line = abs(ball_xy[1] - cy) <= CONE_PASS_BAND_H * body_h
                    continuous = _dist(prev, ball_xy) <= CONE_PASS_BAND_H * body_h
                    if near_line and continuous and i not in st["cones_crossed"]:
                        st["cones_crossed"][i] = t

                ball_to_cone = _dist(ball_xy, (cx, cy))
                foot_to_cone = min(_dist(pt, (cx, cy)) for _, pt in foot_points)
                if ball_to_cone <= hit_r or foot_to_cone <= 0.8 * hit_r:
                    if i not in st["cone_in_hit"]:
                        st["cone_in_hit"].add(i)
                        st["cone_hits"] += 1
                elif ball_to_cone > 2.0 * hit_r and foot_to_cone > 1.6 * hit_r:
                    st["cone_in_hit"].discard(i)

            # Weaving: how often the ball crosses the cone line
            if self._line is not None:
                slope, intercept = self._line
                offset = ball_xy[1] - (slope * ball_xy[0] + intercept)
                if abs(offset) >= 0.15 * body_h:
                    sign = 1 if offset > 0 else -1
                    if st["weave_sign"] and sign != st["weave_sign"]:
                        st["weave_crossings"] += 1
                    st["weave_sign"] = sign

            st["last_ball"], st["last_ball_t"] = ball_xy, t

    def finalize(self):
        """Returns {track_id: metrics} for tracks that actually dribbled."""
        detect_rate = self.frames_with_ball / self.frames_total if self.frames_total else 0.0
        out = {}
        for tid, st in self.tracks.items():
            if st["dribble_frames"] < MIN_DRIBBLE_FRAMES:
                continue
            crossed = sorted(st["cones_crossed"].values())
            slalom_time = (crossed[-1] - crossed[0]) if len(crossed) >= 2 else 0.0
            out[tid] = {
                "touches": st["touches"],
                "left_touches": st["left_touches"],
                "right_touches": st["right_touches"],
                "close_control_ratio": round(st["close_frames"] / st["dribble_frames"], 3),
                "dribble_frames": st["dribble_frames"],
                "cones_total": len(self.cones),
                "cones_passed": len(crossed),
                "cone_hits": st["cone_hits"],
                "slalom_time_sec": round(slalom_time, 2),
                "weave_crossings": st["weave_crossings"],
                "loose_ball_events": st["loose_events"],
                "ball_detect_rate": round(detect_rate, 3),
                "first_seen_sec": round(st["first_t"], 2),
                "last_seen_sec": round(st["last_seen_t"], 2),
            }
        return out


# ---------------------------------------------------------------------
# Video + YOLO front end
# ---------------------------------------------------------------------
def _load_yolo():
    try:
        from ultralytics import YOLO
        import torch
    except ImportError as err:
        print(f"[DRIBBLE ERROR] ultralytics / torch are not installed here ({err}). "
              f"Run this on a machine where the project's virtualenv is active.", flush=True)
        sys.exit(2)
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    return YOLO, device


def _wall_gray(frame):
    """Small grayscale crop of the wall/net area (no players walk there) used to
    detect camera movement."""
    import cv2
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)[60:330, :]
    return np.float32(cv2.resize(gray, None, fx=0.25, fy=0.25))


def _camera_shift(ref_gray, window, frame):
    """(shift in pixels, match response) of this frame's view against the reference view."""
    import cv2
    (dx, dy), response = cv2.phaseCorrelate(ref_gray, _wall_gray(frame), window)
    return math.hypot(dx, dy) / 0.25, float(response)


def _read_frame_at(cap, seconds, fps):
    import cv2
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(max(0.0, seconds) * fps))
    ok, frame = cap.read()
    return frame if ok else None


def _normalise_width(frame):
    import cv2
    h, w = frame.shape[:2]
    if w != PROCESS_WIDTH:
        frame = cv2.resize(frame, (PROCESS_WIDTH, int(round(h * PROCESS_WIDTH / w))))
    return frame


def draw_cone_preview(video_path, cones, out_path, at_seconds=1.0):
    """Draws the configured cones on one frame so you can check them by eye."""
    import cv2
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(at_seconds * fps))
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print("[DRIBBLE ERROR] could not read a frame for the cone preview", flush=True)
        return False
    h, w = frame.shape[:2]
    scale = PROCESS_WIDTH / w
    frame = cv2.resize(frame, (PROCESS_WIDTH, int(round(h * scale))))
    for i, (x, y) in enumerate(cones, start=1):
        cv2.circle(frame, (int(x), int(y)), 18, (0, 0, 255), 2)
        cv2.putText(frame, str(i), (int(x) - 8, int(y) - 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    cv2.imwrite(out_path, frame)
    print(f"[DRIBBLE] cone preview written to {out_path}", flush=True)
    return True


def run_video(video_path, analyzer, args):
    import cv2
    YOLO, device = _load_yolo()
    pose_model = YOLO(args.pose_model)
    ball_model = YOLO(args.ball_model)
    tracker_cfg = "custom_bytetrack.yaml" if os.path.exists("custom_bytetrack.yaml") else "bytetrack.yaml"

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[DRIBBLE ERROR] cannot open video: {video_path}", flush=True)
        sys.exit(3)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if fps != fps or fps <= 0:
        fps = 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if total_frames else float(args.max_seconds)

    start_sec = max(0.0, args.start_sec)
    end_sec = min(args.end_sec if args.end_sec else duration, start_sec + args.max_seconds, duration)
    stride = max(1, int(round(fps / ANALYSIS_FPS)))

    # Reference view for the camera-movement guard: the middle of the window
    # (cameras are usually being handled at the start and end of a recording).
    ref_sec = args.ref_sec if args.ref_sec is not None else (start_sec + end_sec) / 2.0
    ref_frame = _read_frame_at(cap, ref_sec, fps)
    ref_gray = window = None
    if ref_frame is not None:
        ref_gray = _wall_gray(_normalise_width(ref_frame))
        window = cv2.createHanningWindow((ref_gray.shape[1], ref_gray.shape[0]), cv2.CV_32F)

    print(f"[DRIBBLE] {video_path}: {fps:.1f} fps, analysing {start_sec:.0f}s-{end_sec:.0f}s every {stride} frame(s), "
          f"camera reference at {ref_sec:.0f}s, device {device}", flush=True)

    cap.set(cv2.CAP_PROP_POS_FRAMES, int(start_sec * fps))
    frame_idx = int(start_sec * fps)
    end_frame = int(end_sec * fps)
    memory_balls, memory_t = [], -1e9
    analysed = skipped_camera = 0
    while True:
        if not cap.grab():
            break
        frame_idx += 1
        if frame_idx > end_frame:
            break
        if frame_idx % stride != 0:
            continue
        ok, frame = cap.retrieve()
        if not ok or frame is None:
            continue
        frame = _normalise_width(frame)
        t = frame_idx / fps

        if ref_gray is not None:
            shift_px, response = _camera_shift(ref_gray, window, frame)
            if shift_px > CAMERA_SHIFT_MAX_PX or response < CAMERA_MIN_RESPONSE:
                skipped_camera += 1
                memory_balls = []
                continue

        pose = pose_model.track(frame, persist=True, conf=0.35, tracker=tracker_cfg,
                                device=device, verbose=False)[0]
        persons = []
        if pose.boxes is not None and pose.boxes.id is not None:
            boxes = pose.boxes.xyxy.cpu().numpy()
            ids = pose.boxes.id.int().cpu().numpy()
            kpts = pose.keypoints.data.cpu().numpy() if pose.keypoints is not None else None
            for i, (box, tid) in enumerate(zip(boxes, ids)):
                l_ankle = r_ankle = None
                if kpts is not None and kpts.shape[1] > COCO_R_ANKLE:
                    if kpts[i][COCO_L_ANKLE][2] >= 0.3:
                        l_ankle = (float(kpts[i][COCO_L_ANKLE][0]), float(kpts[i][COCO_L_ANKLE][1]))
                    if kpts[i][COCO_R_ANKLE][2] >= 0.3:
                        r_ankle = (float(kpts[i][COCO_R_ANKLE][0]), float(kpts[i][COCO_R_ANKLE][1]))
                persons.append({"track_id": int(tid), "bbox": tuple(float(v) for v in box),
                                "l_ankle": l_ankle, "r_ankle": r_ankle})

        ball_res = ball_model.predict(frame, classes=[32], conf=args.ball_conf, imgsz=args.ball_imgsz,
                                      device=device, verbose=False)[0]
        balls = []
        if ball_res.boxes is not None and len(ball_res.boxes) > 0:
            for b in ball_res.boxes:
                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].cpu().numpy()]
                balls.append(((x1 + x2) / 2.0, (y1 + y2) / 2.0, float(b.conf[0])))

        fresh = bool(balls)
        if fresh:
            memory_balls, memory_t = balls, t
        elif (t - memory_t) <= BALL_MEMORY_SEC:
            balls = memory_balls  # short gap: reuse last position, not counted as a detection

        analyzer.update(t, persons, balls, balls_detected=fresh)
        analysed += 1
        if analysed % 100 == 0:
            print(f"[DRIBBLE] analysed {analysed} frames ({t:.0f}s of video)", flush=True)

    cap.release()
    seen = analysed + skipped_camera
    print(f"[DRIBBLE] done: {analysed} frames analysed, {skipped_camera} skipped because the camera moved", flush=True)
    if seen and skipped_camera / seen > 0.30:
        print("[DRIBBLE WARNING] more than 30% of frames were skipped for camera movement. "
              "Use --start_sec/--end_sec to choose the steady part, or re-measure --cones.", flush=True)
    if analysed == 0:
        print("[DRIBBLE ERROR] no frames could be analysed (camera never matched the reference view).", flush=True)


# ---------------------------------------------------------------------
# Scoring + publishing
# ---------------------------------------------------------------------
def save_local_scorecard(tenant_id, entity_id, player_name, drill_label, result, video_path):
    """Adds a row the REST leaderboard / player-room routes can read."""
    try:
        conn = sqlite3.connect("practice_intel.db")
        conn.execute(
            """INSERT INTO live_analytics
               (tenant_id, facility_type, timestamp, entity_id, player_name, metric_event,
                velocity_score, technical_score, suggestion, video_url, ovr_rating, goals,
                top_speed, is_published)
               VALUES (?, 'ACADEMY', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)""",
            (tenant_id, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), entity_id, player_name,
             drill_label, result.get("sprint_acceleration_rate") or 0, result["score"],
             " | ".join(result.get("coach_feedback", []))[:500], video_path, result["score"],
             result.get("sprint_acceleration_rate") or 0),
        )
        conn.commit()
        conn.close()
        print(f"[LOCAL SCORECARD SAVED] {entity_id}", flush=True)
    except sqlite3.Error as err:
        print(f"[LOCAL SCORECARD ERROR] {entity_id}: {err}", flush=True)


def score_and_publish(per_track, args):
    from drill_analytics import analyze_dribbling_session, save_analysis_to_firestore

    target_foot = args.target_foot or infer_target_foot(args.drill_name)
    drill_label = args.drill_name.replace("_", " ").title()
    scored = []
    for tid, metrics in per_track.items():
        metrics = dict(metrics, player_id=f"track_{tid}", drill=args.drill_name)
        result = analyze_dribbling_session(metrics, target_foot=target_foot)
        scored.append((tid, metrics, result))

    scored.sort(key=lambda item: item[1]["dribble_frames"], reverse=True)
    target_tid = args.target_track if args.target_track is not None else (scored[0][0] if scored else None)

    published = []
    for tid, metrics, result in scored:
        if "score" not in result:
            print(f"[DRIBBLE] track {tid}: {result.get('status')}", flush=True)
            continue
        is_target = (tid == target_tid)
        if args.publish == "none" or (args.publish == "target" and not is_target):
            continue
        entity_id = args.entity_id if (is_target and args.entity_id) else f"track_{tid}"
        name = args.player if (is_target and args.player) else f"Player {tid}"
        result = dict(result, player_name=name)
        ok = save_analysis_to_firestore(result, player_id=entity_id, group_id=args.tenant_id)
        print(f"[FIRESTORE PUBLISH] {entity_id}: {ok}", flush=True)
        save_local_scorecard(args.tenant_id, entity_id, name, drill_label, result, args.video)
        published.append(entity_id)

    return target_tid, target_foot, scored, published


def main():
    parser = argparse.ArgumentParser(description="Real dribbling analysis for cone/slalom drills")
    parser.add_argument("--video", required=True)
    parser.add_argument("--drill_name", default="dribble_slalom")
    parser.add_argument("--entity_id", default=None, help="app player id (user_...) for the target player")
    parser.add_argument("--player", default=None, help="display name for the target player")
    parser.add_argument("--tenant_id", default="default_facility")
    parser.add_argument("--cones", default=None, help='cone pixel positions "x,y;x,y;..." (1280-wide coordinates)')
    parser.add_argument("--target_foot", choices=["left", "right"], default=None)
    parser.add_argument("--target_track", type=int, default=None, help="track id to publish as the target player")
    parser.add_argument("--publish", choices=["target", "all", "none"], default="target")
    parser.add_argument("--max_seconds", type=float, default=300.0, help="longest stretch to analyse")
    parser.add_argument("--start_sec", type=float, default=0.0, help="start analysing here")
    parser.add_argument("--end_sec", type=float, default=None, help="stop analysing here")
    parser.add_argument("--ref_sec", type=float, default=None,
                        help="time of the steady camera view (default: middle of the analysed window)")
    parser.add_argument("--preview_at", type=float, default=None, help="time of the frame for --cone_preview")
    parser.add_argument("--pose_model", default="yolov8n-pose.pt")
    parser.add_argument("--ball_model", default="yolov8n.pt")
    parser.add_argument("--ball_conf", type=float, default=0.10)
    parser.add_argument("--ball_imgsz", type=int, default=1280)
    parser.add_argument("--out", default=None, help="write the full results as JSON here")
    parser.add_argument("--cone_preview", default=None, help="write a frame with the cones drawn on it")
    parser.add_argument("--preview_only", action="store_true", help="only write the cone preview, then exit")
    args, _unknown = parser.parse_known_args()   # ignores flags other launchers pass (e.g. --drill_type)

    cones = parse_cones(args.cones) if args.cones else list(DEFAULT_CONES)

    if args.cone_preview:
        preview_at = args.preview_at
        if preview_at is None:
            preview_at = args.ref_sec if args.ref_sec is not None else max(args.start_sec, 0.0) + 40.0
        draw_cone_preview(args.video, cones, args.cone_preview, at_seconds=preview_at)
    if args.preview_only:
        return

    analyzer = DribbleAnalyzer(cones)
    run_video(args.video, analyzer, args)
    per_track = analyzer.finalize()

    if not per_track:
        print("[DRIBBLE] no dribbling detected (no moving player with the ball). "
              "Check the ball model/confidence and the cone positions.", flush=True)
        return

    target_tid, target_foot, scored, published = score_and_publish(per_track, args)

    print("\n=== DRIBBLING RESULTS ===", flush=True)
    for tid, metrics, result in scored:
        tag = "  <- target" if tid == target_tid else ""
        if "score" in result:
            print(f"track {tid}{tag}: score {result['score']} | touches {metrics['touches']} | "
                  f"cones {metrics['cones_passed']}/{metrics['cones_total']} | hits {metrics['cone_hits']} | "
                  f"L/R {metrics['left_touches']}/{metrics['right_touches']} | "
                  f"control {metrics['close_control_ratio']*100:.0f}% | reliability {result['reliability']}",
                  flush=True)
        else:
            print(f"track {tid}{tag}: {result.get('status')}", flush=True)

    if args.out:
        with open(args.out, "w") as f:
            json.dump({"video": args.video, "target_foot": target_foot, "target_track": target_tid,
                       "published": published,
                       "tracks": [{"track_id": tid, "metrics": m, "result": r} for tid, m, r in scored]},
                      f, indent=2, default=str)
        print(f"[DRIBBLE] full results written to {args.out}", flush=True)


if __name__ == "__main__":
    main()
