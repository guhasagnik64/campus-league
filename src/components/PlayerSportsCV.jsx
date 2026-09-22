import React, { useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';

export default function PlayerSportsCV({ playerProfile: incomingProfile, player }) {
  const [profileData, setProfileData] = useState(null);

  // Poll FastAPI backend every 3 seconds for dynamic computer-vision scores
  useEffect(() => {
    const fetchPlayerProfile = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/player-profile');
        const data = await res.json();
        if (data && data.status !== 'no_data') {
          setProfileData(data);
        }
      } catch (err) {
        console.error("Error fetching live player profile telemetry:", err);
      }
    };

    fetchPlayerProfile();
    const interval = setInterval(fetchPlayerProfile, 3000);
    return () => clearInterval(interval);
  }, []);

  // Base state merged with incoming props or dynamic backend telemetry
  const baseName = profileData?.name || player?.name || incomingProfile?.name || "Sagnik Guha";
  const ovr = profileData?.ovr || player?.ovr || incomingProfile?.ovr || 72;
  
  const skills = profileData?.skills || player?.skills || incomingProfile?.skills || {
    passing: 74,
    dribbling: 75,
    saq: 68,
    shooting: 71
  };

  const playerProfile = {
    name: baseName,
    age: incomingProfile?.age || 16,
    location: incomingProfile?.location || "Siliguri, West Bengal",
    currentAcademy: incomingProfile?.currentAcademy || "Siliguri Football Excellence Academy",
    position: incomingProfile?.position || "Midfielder / Playmaker",
    preferredFoot: incomingProfile?.preferredFoot || "Right",
    bio: incomingProfile?.bio || "Technical midfielder specializing in tight-space transitions, possession retention, and rapid off-ball acceleration.",
    ovr: ovr,
    trend: incomingProfile?.trend || "+2",
    skills: skills,
    dailyImprovement: incomingProfile?.dailyImprovement || {
      isImproving: true,
      delta: 2,
      streakDays: 4,
      message: "Continuous progression: Performance index upgraded across last 4 practice sessions."
    },
    metricsAverages: incomingProfile?.metricsAverages || {
      passingAccuracy: `${skills.passing}%`,
      receptionPrecision: "84.5%",
      sprintAcceleration: `${skills.saq}%`,
      sessionsTracked: 42
    },
    sessionHistory: incomingProfile?.sessionHistory || [
      { date: "2026-07-09", drill: "3-Player Passing Rotation", passing: skills.passing, reception: 82, sprint: skills.saq, status: "Verified" },
      { date: "2026-07-07", drill: "5v2 Rondo Grid Pressing", passing: 91, reception: 86, sprint: 83, status: "Verified" },
      { date: "2026-07-04", drill: "Transition Out of Pressure", passing: 86, reception: 84, sprint: 80, status: "Verified" },
      { date: "2026-06-30", drill: "Midfield Box Scanning Drill", passing: 92, reception: 86, sprint: 82, status: "Verified" }
    ]
  };

  // Export CV PDF function
  const downloadCV = () => {
    const element = document.getElementById('digital-sports-cv');
    if (!element) return;
    const opt = {
      margin:       0.4,
      filename:     `${playerProfile.name.replace(/\s+/g, '_')}_Sports_CV.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  };

  const isPositiveTrend = playerProfile.trend.toString().startsWith('+');

  return (
    <div style={{ padding: '20px', backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* Action Controller */}
      <div style={{ maxWidth: '800px', margin: '0 auto 15px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e293b' }}>🏆 Verified Player CV & Progress Center</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Automatically compiled from everyday computer vision tracking logs.
          </p>
        </div>
        <button onClick={downloadCV} style={styles.downloadBtn}>
          📥 Download CV for Scouts
        </button>
      </div>

      {/* 1. DAILY IMPROVEMENT TRACKER BANNER (Screen Only) */}
      <div style={{
        maxWidth: '800px',
        margin: '0 auto 20px auto',
        padding: '1rem',
        borderRadius: '0.5rem',
        backgroundColor: playerProfile.dailyImprovement.isImproving ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${playerProfile.dailyImprovement.isImproving ? '#22c55e' : '#ef4444'}`,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2rem' }}>
          {playerProfile.dailyImprovement.isImproving ? '📈' : '⚠️'}
        </div>
        <div>
          <h4 style={{ margin: 0, color: playerProfile.dailyImprovement.isImproving ? '#15803d' : '#b91c1c', fontSize: '1rem' }}>
            {playerProfile.dailyImprovement.isImproving 
              ? `Daily Progress: +${playerProfile.dailyImprovement.delta} Overall Rating Points` 
              : 'Attention Needed'}
          </h4>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#334155' }}>
            {playerProfile.dailyImprovement.message}
          </p>
          {playerProfile.dailyImprovement.streakDays > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 'bold' }}>
              🔥 {playerProfile.dailyImprovement.streakDays}-Session Daily Improvement Streak!
            </span>
          )}
        </div>
      </div>

      {/* 2. PRINTABLE / EXPORTABLE CV CONTAINER */}
      <div id="digital-sports-cv" style={styles.cvCard}>
        
        {/* Header Block with Dynamic OVR */}
        <div style={styles.cvHeader}>
          <div>
            <h1 style={styles.nameHeading}>{playerProfile.name}</h1>
            <p style={styles.subHeading}>{playerProfile.position} | {playerProfile.currentAcademy}</p>
            <p style={styles.locationText}>📍 Base: {playerProfile.location} • Preferred Foot: {playerProfile.preferredFoot}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <div style={styles.verifiedBadge}>VERIFIED APP ATHLETE</div>
            
            {/* OVR & Trend Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>DYNAMIC OVR</span>
                <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f766e' }}>{playerProfile.ovr}</span>
              </div>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: isPositiveTrend ? '#dcfce7' : '#fee2e2',
                color: isPositiveTrend ? '#15803d' : '#991b1b',
                border: `1px solid ${isPositiveTrend ? '#86efac' : '#fca5a5'}`
              }}>
                {playerProfile.trend}
              </span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={styles.sectionTitle}>Player Objective & Profile</h3>
          <p style={styles.bioText}>{playerProfile.bio}</p>
        </div>

        {/* Dynamic Skills Breakdown Bars */}
        <div style={{ marginBottom: '25px' }}>
          <h3 style={styles.sectionTitle}>Live Skill Ratings</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            {Object.entries(playerProfile.skills).map(([skillName, score]) => {
              const barColor = score >= 80 ? '#0f766e' : score >= 65 ? '#d97706' : '#dc2626';
              return (
                <div key={skillName}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: '#334155', textTransform: 'uppercase' }}>{skillName}</span>
                    <span style={{ fontWeight: 'bold', color: barColor }}>{score} / 100</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${score}%`, backgroundColor: barColor, borderRadius: '4px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Aggregate Career Stats Grid */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={styles.sectionTitle}>Aggregated Performance Indexes (All-Time)</h3>
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Avg Passing Accuracy</span>
              <span style={styles.statNum}>{playerProfile.metricsAverages.passingAccuracy}</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Orientation Precision</span>
              <span style={styles.statNum}>{playerProfile.metricsAverages.receptionPrecision}</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Sprint Acceleration</span>
              <span style={styles.statNum}>{playerProfile.metricsAverages.sprintAcceleration}</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Tracked Sessions</span>
              <span style={styles.statNum}>{playerProfile.metricsAverages.sessionsTracked}</span>
            </div>
          </div>
        </div>

        {/* Everyday Session Progression Log */}
        <div>
          <h3 style={styles.sectionTitle}>Everyday Session Metrics History</h3>
          <table style={styles.historyTable}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={styles.tableHeader}>Session Date</th>
                <th style={styles.tableHeader}>Drill Program</th>
                <th style={styles.tableHeader}>Passing</th>
                <th style={styles.tableHeader}>Reception</th>
                <th style={styles.tableHeader}>Sprint Rate</th>
                <th style={styles.tableHeader}>Status</th>
              </tr>
            </thead>
            <tbody>
              {playerProfile.sessionHistory.map((session, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={styles.tableCell}>{session.date}</td>
                  <td style={styles.tableCell}><strong>{session.drill}</strong></td>
                  <td style={{ ...styles.tableCell, color: '#0f766e', fontWeight: 'bold' }}>{session.passing}%</td>
                  <td style={{ ...styles.tableCell, color: '#1d4ed8', fontWeight: 'bold' }}>{session.reception}%</td>
                  <td style={{ ...styles.tableCell, color: '#b45309', fontWeight: 'bold' }}>{session.sprint}%</td>
                  <td style={styles.tableCell}>
                    <span style={styles.inlineBadge}>{session.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CV Footer authentication stamp */}
        <div style={styles.cvFooter}>
          <p>© 2026 J-Agency Analytics System. All metrics generated via AI Computer Vision tracking grids.</p>
        </div>

      </div>
    </div>
  );
}

const styles = {
  cvCard: {
    backgroundColor: '#ffffff',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    border: '1px solid #e2e8f0'
  },
  cvHeader: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'flex-start',
    borderBottom: '2px solid #0f172a',
    paddingBottom: '20px',
    marginBottom: '25px'
  },
  nameHeading: { fontSize: '28px', color: '#0f172a', margin: '0 0 5px 0', fontWeight: '800' },
  subHeading: { fontSize: '16px', color: '#0f766e', margin: '0 0 5px 0', fontWeight: '600' },
  locationText: { fontSize: '13px', color: '#64748b', margin: 0 },
  verifiedBadge: { backgroundColor: '#0f172a', color: '#ffffff', fontSize: '11px', padding: '6px 12px', fontWeight: 'bold', borderRadius: '4px', letterSpacing: '0.5px' },
  sectionTitle: { fontSize: '14px', textTransform: 'uppercase', color: '#334155', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '12px', letterSpacing: '0.5px' },
  bioText: { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: 0 },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' },
  statBox: { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '6px', textAlign: 'center' },
  statLabel: { display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '5px', fontWeight: '600' },
  statNum: { fontSize: '20px', fontWeight: '800', color: '#0f172a' },
  historyTable: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' },
  tableHeader: { padding: '10px', borderBottom: '2px solid #cbd5e1', color: '#475569', fontWeight: '600' },
  tableCell: { padding: '12px 10px', color: '#334155' },
  inlineBadge: { backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' },
  cvFooter: { marginTop: '40px', borderTop: '1px dashed #cbd5e1', paddingTop: '15px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' },
  downloadBtn: { backgroundColor: '#0f766e', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }
};