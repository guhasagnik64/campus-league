
import cv2
import pandas as pd
import datetime

# --- CONFIGURATION ---
# This matches your Jorginho/Own Goal video file name
VIDEO_PATH = "4ed12554-c7d4-4e01-9000-820f8d2ee7a6.mp4" 
OUTPUT_FILE = f"Youth_Development_Report_{datetime.date.today()}.csv"

cap = cv2.VideoCapture(VIDEO_PATH)
intel_data = []

print("--- YOUTH COACHING INTEL TOOL ---")
print("Press: 's' Scanning | 'f' First Touch | 'p' Positioning | 'q' Save & Quit")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: 
        break

    # Visual HUD for your analysis
    cv2.putText(frame, "U13-U15 DEVELOPMENT AUDIT", (20, 50), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    
    cv2.imshow('Coaching Intel Lab', frame)
    
    key = cv2.waitKey(20) & 0xFF
    time_stamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0

    # Tagging Logic
    if key == ord('s'):
        print(f"INTEL: Proper Scan at {time_stamp:.2f}s")
        intel_data.append({"Time": time_stamp, "Attribute": "Cognitive/Scanning"})
    
    if key == ord('f'):
        print(f"INTEL: Positive First Touch at {time_stamp:.2f}s")
        intel_data.append({"Time": time_stamp, "Attribute": "Technical/First Touch"})
        
    if key == ord('p'):
        print(f"INTEL: Positional Awareness at {time_stamp:.2f}s")
        intel_data.append({"Time": time_stamp, "Attribute": "Tactical/Positioning"})

    if key == ord('q'):
        break

# Save to spreadsheet
if intel_data:
    df = pd.DataFrame(intel_data)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSUCCESS: Report generated as {OUTPUT_FILE}")
else:
    print("\nNo data recorded. Use 's', 'f', or 'p' to tag actions.")

cap.release()
cv2.destroyAllWindows()
