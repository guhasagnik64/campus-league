# cloud_sync.py
import sqlite3
import json
import os
import sys
from datetime import datetime, timedelta

def sync_local_to_json(tenant_id="default_facility"):
    print(f"\n--- CONNECTING TO LOCAL PRACTICE INTEL DB (TENANT: {tenant_id}) ---")
    
    conn = sqlite3.connect('practice_intel.db')
    cursor = conn.cursor()
    
    try:
        # Fetch tracked rows filtered strictly by tenant_id
        cursor.execute("""
            SELECT timestamp, entity_id, metric_event, velocity_score, suggestion, ovr_rating, top_speed, is_published
            FROM live_analytics
            WHERE tenant_id = ?
            ORDER BY id DESC
            LIMIT 10
        """, (tenant_id,))
        rows = cursor.fetchall()
        
        if not rows:
            print(f"[ALERT] No tracking entries found for tenant '{tenant_id}'.")
            return

        print(f"[SUCCESS] Found {len(rows)} data rows. Building JSON cache...")

        # Calculate 3-hour expiration window
        created_at = datetime.utcnow()
        expires_at = (created_at + timedelta(hours=3)).isoformat() + "Z"

        individual_portals = {}
        for row in rows:
            player_id = row[1] or "Anonymous Player"
            individual_portals[player_id] = {
                "metadata": {
                    "topSpeed": f"{round(float(row[6] or row[3] or 0), 1)} km/h",
                    "finalScore": row[5] or 75,
                    "retention": "Active",
                    "position": "Futsal Player"
                },
                "content": f"Touch Quality: {row[2] or 'Standard'}. {row[4] or ''}"
            }

        # Formatted payload matching your frontend coach_intel_cache structure
        payload = {
            "generalScore": 85,
            "coachReport": "Match Telemetry Complete. Share to Campus Feed before the countdown expires!",
            "sessionPoints": 250,
            "tenant_id": tenant_id,
            "createdAt": created_at.isoformat() + "Z",
            "expiresAt": expires_at,
            "isPublished": bool(rows[0][7]) if rows else False,
            "individualPortals": individual_portals,
            "feedActivities": [
                {
                    "id": f"futsal_{tenant_id}",
                    "playerName": "Match Evaluation Engine",
                    "team": tenant_id,
                    "content": "⚡ High-intensity futsal session processed."
                }
            ]
        }
            
        # Target stream directory
        output_path = os.path.join("stream", "coach_intel_cache.json")
        os.makedirs("stream", exist_ok=True)
        
        with open(output_path, "w") as f:
            json.dump(payload, f, indent=4)
            
        print(f"📦 Successfully created ephemeral cache: {output_path}")
        print("--- SYNC COMPLETE ---")
        
    except Exception as e:
        print(f"[ERROR] Sync failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    target_tenant = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TENANT_ID", "default_facility")
    sync_local_to_json(target_tenant)