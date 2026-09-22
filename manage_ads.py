import sqlite3

def run_ad_manager():
    conn = sqlite3.connect("practice_intel.db")
    cursor = conn.cursor()
    
    # 🔥 AUTOMATIC TABLE INITIALIZER
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS campus_advertisements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sponsor_name TEXT NOT NULL,
            campaign_title TEXT NOT NULL,
            banner_url TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        );
    """)
    conn.commit()
    
    print("\n--- 📣 CAMPUS LEAGUE SPONSOR AD MANAGER ---")
    print("1. View Active Ad Campaign")
    print("2. Launch a New Sponsor Ad (Deactivates current ad)")
    print("3. Clear and Remove All Ads")
    
    choice = input("\nEnter choice (1-3): ")
    
    if choice == "1":
        cursor.execute("SELECT id, sponsor_name, campaign_title, is_active FROM campus_advertisements")
        rows = cursor.fetchall()
        if not rows:
            print("\n⚪ No ad campaigns found in the database directory.")
        for r in rows:
            status = "🟢 ACTIVE" if r[3] == 1 else "⚪ INACTIVE"
            print(f"[{r[0]}] {r[1]} - '{r[2]}' ({status})")
            
    elif choice == "2":
        # Automatically deactivate old campaigns to make room for the new one
        cursor.execute("UPDATE campus_advertisements SET is_active = 0")
        
        sponsor = input("Enter Sponsor Name (e.g., Nike): ")
        title = input("Enter Campaign Headline: ")
       banner = input("Enter Image or Video Path (e.g., http://localhost:8001/stream/nike_banner.png): ")

if not banner:
    banner = "http://localhost:8001/stream/sponsor_logo.png"
            
        cursor.execute("""
            INSERT INTO campus_advertisements (sponsor_name, campaign_title, banner_url, is_active)
            VALUES (?, ?, ?, 1)
        """, (sponsor, title, banner))
        conn.commit()
        print(f"\n🚀 Success! {sponsor}'s campaign is now live on the student dashboard feed!")
        
    elif choice == "3":
        cursor.execute("DELETE FROM campus_advertisements")
        conn.commit()
        print("\n🗑️ All advertising campaigns cleared from the system database record.")
        
    conn.close()

if __name__ == "__main__":
    run_ad_manager()