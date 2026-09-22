import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK using your project credentials
cred = credentials.Certificate("firebase_credentials.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# Document reference
doc_ref = db.collection("drill_definitions").document("inside_outside_touch_moving")

# Seed data
doc_ref.set({
    "drill_id": "inside_outside_touch_moving",
    "name": "Inside Outside Alternating Touch",
    "rules_sequence": [
        {
            "type": "ball_touch",
            "foot_pattern": [
                "right_inside",
                "right_outside",
                "left_inside",
                "left_outside"
            ]
        },
        {
            "type": "displacement",
            "min_distance_meters": 5.0
        }
    ],
    "scoring_weights": {
        "sequence_accuracy": 0.5,
        "completion_time": 0.3,
        "ball_control_radius": 0.2
    }
})

print("Successfully written drill definition to Firestore!")