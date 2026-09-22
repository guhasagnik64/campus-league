import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; // Adjust path if firebase.js is in another directory

const DailyReport = ({
  playerName: propPlayerName,
  position: propPosition,
  drillFormat: propDrillFormat,
  coachLog: propCoachLog,
  metrics: propMetrics,
  sessionDate: propSessionDate,
  user
}) => {
  // 1. STATE DECLARATIONS
  const [intelData, setIntelData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [reportAccessPrice] = useState(0);
  const [timeLeft, setTimeLeft] = useState('');

  // 2. TIMER EFFECT
  useEffect(() => {
    const reportTimestamp = intelData?.generated_at 
      ? new Date(intelData.generated_at).getTime() 
      : Date.now();
    
    const expirationTime = reportTimestamp + 24 * 60 * 60 * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const distance = expirationTime - now;

      if (distance <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
      } else {
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [intelData]);

  // 3. FIRESTORE REAL-TIME LISTENER + CACHE FALLBACK
  useEffect(() => {
    const targetPlayerId = user?.id || propPlayerName || 'PLR-101';
    
    // Listen to live updates from Firestore
    const unsub = onSnapshot(
      doc(db, 'daily_reports', targetPlayerId),
      (docSnap) => {
        if (docSnap.exists()) {
          setReportData(docSnap.data());
        }
      },
      (err) => {
        console.error("Firestore listener error:", err);
      }
    );

    // Cache Fallback
    fetch('/coach_intel_cache.json?t=' + Date.now(), {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error("File not found");
        return res.json();
      })
      .then((data) => {
        if (data && (data.individualPortals || data.generalSquadScore)) {
          setIntelData(data);
        }
      })
      .catch(() => {});

    return () => unsub();
  }, [user, propPlayerName]);

  const handlePrint = () => {
    window.print();
  };

  const activeSession = intelData;
  const premiumPlayerName = reportData?.player_name || propPlayerName || user?.name || "Sagnik Guha";
  const premiumPosition = reportData?.position || propPosition || "Midfielder";
  const drillFormat = reportData?.drill_name || propDrillFormat || "dribbling";
  const premiumCoachSummary = propCoachLog 
    || reportData?.written_breakdown
    || activeSession?.summary 
    || activeSession?.individualPortals?.[premiumPlayerName]?.content 
    || "Analysis pending... Upload a training video and launch auto-analysis to generate real-time coaching feedback.";
  
  const matchedPlayer = intelData?.rankings?.find(r => 
    r.name.toLowerCase() === (premiumPlayerName || "").toLowerCase()
  ) || intelData?.rankings?.[0];

  // 🎯 DYNAMIC COMPUTER VISION METRICS EXTRACTION
  const rawPass = reportData?.pass_accuracy 
    ?? propMetrics?.passingAccuracy 
    ?? matchedPlayer?.pass_accuracy 
    ?? intelData?.pass_accuracy;

  const rawReception = propMetrics?.receptionPrecision 
    ?? matchedPlayer?.control_precision 
    ?? matchedPlayer?.reception_precision 
    ?? intelData?.control_precision;

  const rawSprint = reportData?.sprint_speed 
    ?? propMetrics?.sprintAcceleration 
    ?? matchedPlayer?.sprint_accel 
    ?? intelData?.sprint_accel;

  const premiumPassing = rawPass !== undefined && rawPass !== null ? (typeof rawPass === 'number' ? `${rawPass}%` : rawPass) : 'Pending...';
  const premiumReception = rawReception !== undefined && rawReception !== null ? (typeof rawReception === 'number' ? `${rawReception}%` : rawReception) : 'Pending...';
  const premiumSprint = rawSprint !== undefined && rawSprint !== null ? (typeof rawSprint === 'number' ? `${rawSprint}%` : rawSprint) : 'Pending...';

  const currentDate = propSessionDate || new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div style={{ padding: '20px', background: '#ffffff', fontFamily: 'sans-serif' }} className="print:m-0 print:p-0">
      
      {/* 📢 AD SPOT 1: TOP LARGE BANNER (Futsal Pitch Booking Promotion) */}
      <div className="print:hidden" style={styles.topBannerAd}>
        <div>
          <span style={styles.adTag}>FEATURED ARENA</span>
          <h4 style={{ margin: '4px 0 2px 0', fontSize: '15px' }}>⚽ Night Turf Booking Available at J-Futsal Arena!</h4>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>Reserve floodlit 5v5 & 7v7 pitches directly through the app tab.</p>
        </div>
        <button style={styles.adActionButton}>Book Turf Now</button>
      </div>

      {/* PROMO LAUNCH ALIGNMENT BANNER */}
      <div className="print:hidden" style={styles.promoBanner}>
        🎉 <strong>Launch Promotion Active:</strong> Premium reports are currently <strong>${reportAccessPrice}</strong> for players!
      </div>

      {/* ⏱️ 24-HOUR EXPIRATION COUNTER */}
      <div className="print:hidden" style={{
        backgroundColor: '#7f1d1d',
        color: '#fef2f2',
        padding: '10px 16px',
        borderRadius: '8px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        fontWeight: 'bold',
        border: '1px solid #ef4444',
        maxWidth: '760px',
        margin: '0 auto 16px auto'
      }}>
        <span>🔴 Results are LIVE! Print or download your telemetry sheet now.</span>
        <span style={{
          backgroundColor: '#991b1b',
          padding: '4px 10px',
          borderRadius: '6px',
          fontFamily: 'monospace',
          color: '#fde047'
        }}>
          Auto-purging in: {timeLeft || '24h 00m 00s'}
        </span>
      </div>

      {/* 🏆 PREMIUM PLAYER TELEMETRY SHEET */}
      <div id="premium-report-card" style={styles.reportSheet}>
        
        {/* HEADER */}
        <div style={styles.headerBlock}>
          <div>
            <h1 style={styles.agencyTitle}>J-AGENCY</h1>
            <p style={styles.agencySub}>CAMPUS LEAGUE PERFORMANCE LABS • DAILY PLAYER TELEMETRY SYSTEM</p>
          </div>
          <div style={styles.officialBadge}>OFFICIAL REPT</div>
        </div>

        {/* METRIC PROFILE */}
        <div style={styles.profileRow}>
          <div style={styles.avatarBox}>
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img 
                src={intelData?.trackedFaceUrl ? `${intelData.trackedFaceUrl}?t=${Date.now()}` : `/tracked_player_face.jpg?t=${Date.now()}`} 
                alt="Tracked Player Face" 
                onError={(e) => { e.target.style.display = 'none'; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
              />
            </div>
            <div style={styles.avatarLabel}>DAILY STAMP</div>
          </div>

          <div style={styles.identityDetails}>
            <h2 style={styles.playerNameText}>{premiumPlayerName}</h2>
            <p style={styles.metaText}><strong>Position:</strong> {premiumPosition}</p>
            <p style={styles.metaText}><strong>Status:</strong> <span style={{ color: '#16a34a' }}>Session Verified</span></p>
          </div>

          <div style={styles.metaRight}>
            <p style={styles.metaText}><strong>SESSION DATE:</strong> {currentDate}</p>
            <p style={styles.metaText}><strong>Report ID:</strong> {reportData?.report_id || '#SR-20260709-01'}</p>
            <p style={styles.metaText}><strong>Attendance:</strong> Present</p>
          </div>
        </div>

        {/* SUB-NOTE */}
        <div style={styles.systemAlertNote}>
          <strong>Note:</strong> Kit profiles are dynamic per session. Tracking and metrics are anchored strictly via facial telemetry verification.
        </div>

        <hr style={styles.dividerLine} />

        {/* TACTICAL CONSTRAINTS */}
        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>DAILY TACTICAL OVERRIDE & CONSTRAINTS</h3>
          <div style={styles.gridTwoColumn}>
            <p style={styles.bodyText}><strong>Drill Format:</strong> {drillFormat.replace('_', ' ').toUpperCase()}</p>
            <p style={styles.bodyText}><strong>Confidence Cutoff:</strong> 75.0%</p>
          </div>
          <p style={styles.bodyText}><strong>Target Focus:</strong> Passing accuracy, reception orientation, and off-ball sprint timing.</p>
        </div>

        {/* ⚡ PLAYER DRAWBACKS & TACTICAL ANALYSIS CARD */}
        {(reportData?.drawbacks || reportData?.coach_feedback) && (
          <div style={{
            backgroundColor: '#fffbeb',
            borderLeft: '4px solid #f59e0b',
            padding: '12px 16px',
            margin: '16px 0',
            borderRadius: '0 6px 6px 0'
          }}>
            <h4 style={{ margin: '0 0 4px 0', color: '#92400e', fontSize: '13px', fontWeight: 'bold' }}>
              ⚡ PLAYER DRAWBACKS & TACTICAL ANALYSIS
            </h4>
            <p style={{ margin: 0, color: '#78350f', fontSize: '12px', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
              {reportData?.drawbacks || reportData?.coach_feedback}
            </p>
          </div>
        )}

        {/* 📢 AD SPOT 2: IN-REPORT SMALL BOX (Store Gear / Sponsor Ad) */}
        <div style={styles.inReportAdBox}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', color: '#6b7280' }}>[ OFFICIAL EQUIPMENT SPONSOR ]</span>
            <p style={{ margin: '3px 0 0 0', fontSize: '11px', fontWeight: 'bold' }}>🛒 Vega Store: Get 15% off official match kits & Grip Socks!</p>
          </div>
          <span style={{ fontSize: '10px', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}>CLAIM DISCOUNT →</span>
        </div>

        {/* COACH LOG */}
        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>COACH INTELLIGENCE LOG</h3>
          <div style={styles.quoteBox}>
            "{premiumCoachSummary}"
          </div>
        </div>

        {/* METRICS PERFORMANCE */}
        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>SESSION METRICS PERFORMANCE</h3>
          <ul style={styles.statsUnorderedList}>
            <li style={styles.statLineItem}>
              <span>• Passing Accuracy (Preferred Foot)</span>
              <strong style={styles.statValue}>{premiumPassing}</strong>
            </li>
            <li style={styles.statLineItem}>
              <span>• Reception Orientation Precision</span>
              <strong style={styles.statValue}>{premiumReception}</strong>
            </li>
            <li style={styles.statLineItem}>
              <span>• Off-Ball Sprint Acceleration Rate</span>
              <strong style={styles.statValue}>{premiumSprint}</strong>
            </li>
          </ul>
        </div>

        {/* 📢 AD SPOT 3: FOOTER PARTNER TILES */}
        <div style={styles.footerBanner}>
          <div style={styles.footerSeparator}>===================================================================================</div>
          <p style={styles.sponsorHeading}>OFFICIAL SPONSORS & PARTNERS</p>
          <div style={styles.sponsorRow}>
            <span>[ NIKE FOOTBALL ]</span>
            <span>•</span>
            <span>[ VEGA STORE ]</span>
            <span>•</span>
            <span>[ J-FUTSAL ARENA ]</span>
            <span>•</span>
            <span>[ RED BULL ]</span>
          </div>
        </div>

      </div>

      {/* 📢 AD SPOT 4: BOTTOM WIDE PROMO BANNER */}
      <div className="print:hidden" style={styles.bottomAdCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '28px' }}>🛍️</div>
          <div>
            <h5 style={{ margin: 0, fontSize: '14px', color: '#1e293b' }}>Equip Your Next Match at Vega Store</h5>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Browse performance boots, shin guards, and recovery gear in our store.</p>
          </div>
        </div>
        <button style={styles.storeButton}>Visit Vega Store</button>
      </div>

      {/* PRINT ACTION TRIGGER CTA BAR */}
      <div style={styles.actionRow} className="print:hidden">
        <button onClick={handlePrint} style={styles.printButton}>
          📥 Download Premium Telemetry Sheet (PDF)
        </button>
      </div>

    </div>
  );
};

export default DailyReport;

// STYLES
const styles = {
  topBannerAd: {
    maxWidth: '760px',
    margin: '0 auto 15px auto',
    backgroundColor: '#064e3b',
    color: '#ffffff',
    padding: '12px 20px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
  },
  adTag: {
    backgroundColor: '#10b981',
    color: '#064e3b',
    fontSize: '9px',
    fontWeight: '900',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px'
  },
  adActionButton: {
    backgroundColor: '#10b981',
    color: '#064e3b',
    border: 'none',
    padding: '8px 16px',
    fontWeight: 'bold',
    fontSize: '12px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  promoBanner: {
    maxWidth: '760px',
    margin: '0 auto 15px auto',
    backgroundColor: '#ecfdf5',
    color: '#065f46',
    border: '1px solid #a7f3d0',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    textAlign: 'center'
  },
  reportSheet: {
    backgroundColor: '#ffffff',
    border: '3px solid #000000',
    padding: '30px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
    color: '#000000',
    maxWidth: '760px',
    margin: '0 auto',
    fontFamily: '"Courier New", Courier, monospace',
    boxSizing: 'border-box'
  },
  headerBlock: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '2px solid #000000',
    paddingBottom: '12px',
    marginBottom: '20px'
  },
  agencyTitle: {
    fontSize: '24px',
    fontWeight: '900',
    margin: 0,
    letterSpacing: '1px'
  },
  agencySub: {
    fontSize: '11px',
    margin: '3px 0 0 0',
    fontWeight: '700',
    letterSpacing: '0.5px'
  },
  officialBadge: {
    border: '2px solid #000000',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '900',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap'
  },
  profileRow: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr 1fr',
    gap: '20px',
    alignItems: 'center',
    marginBottom: '15px'
  },
  avatarBox: {
    border: '2px solid #000000',
    width: '100px',
    height: '110px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa'
  },
  avatarLabel: {
    width: '100%',
    textAlign: 'center',
    background: '#000000',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 'bold',
    padding: '2px 0'
  },
  identityDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  playerNameText: {
    fontSize: '20px',
    fontWeight: '900',
    margin: '0 0 6px 0',
    textTransform: 'uppercase'
  },
  metaRight: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'flex-end',
    textAlign: 'right'
  },
  metaText: {
    fontSize: '13px',
    margin: 0,
    lineHeight: '1.4'
  },
  systemAlertNote: {
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#374151',
    backgroundColor: '#f9fafb',
    padding: '10px',
    border: '1px dashed #000000',
    marginTop: '15px',
    marginBottom: '15px'
  },
  dividerLine: {
    border: 'none',
    borderTop: '1px solid #000000',
    margin: '20px 0'
  },
  sectionBlock: {
    marginBottom: '20px'
  },
  sectionHeading: {
    fontSize: '14px',
    fontWeight: '900',
    margin: '0 0 10px 0',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    borderBottom: '1px solid #000000',
    paddingBottom: '4px'
  },
  gridTwoColumn: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px'
  },
  bodyText: {
    fontSize: '12px',
    margin: 0,
    lineHeight: '1.5'
  },
  inReportAdBox: {
    border: '1px solid #000000',
    padding: '8px 12px',
    margin: '15px 0',
    backgroundColor: '#f8fafc',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  quoteBox: {
    borderLeft: '3px solid #000000',
    paddingLeft: '12px',
    fontStyle: 'italic',
    fontSize: '12px',
    margin: '10px 0'
  },
  statsUnorderedList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  statLineItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px'
  },
  statValue: {
    fontWeight: 'bold'
  },
  footerBanner: {
    marginTop: '30px',
    textAlign: 'center',
    fontSize: '10px',
    fontFamily: 'monospace'
  },
  footerSeparator: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    marginBottom: '10px'
  },
  sponsorHeading: {
    margin: '0 0 4px 0',
    fontWeight: 'bold'
  },
  sponsorRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    textTransform: 'uppercase',
    flexWrap: 'wrap'
  },
  bottomAdCard: {
    maxWidth: '760px',
    margin: '20px auto 0 auto',
    border: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    padding: '12px 20px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  storeButton: {
    backgroundColor: '#0284c7',
    color: '#ffffff',
    border: 'none',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 'bold',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  actionRow: {
    maxWidth: '760px',
    margin: '20px auto 0 auto',
    textAlign: 'center'
  },
  printButton: {
    backgroundColor: '#000000',
    color: '#ffffff',
    border: 'none',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 'bold',
    borderRadius: '6px',
    cursor: 'pointer'
  }
};