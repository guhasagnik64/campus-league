import React, { useState, useEffect, useRef } from 'react';

export default function CoachPortfolioCV({ coachProfile, profile, coach, onClose, onPublishToCoachesTab, loggedInUser, user }) {
  const [fetchedData, setFetchedData] = useState(null);
  const [liveTelemetry, setLiveTelemetry] = useState(null);
  const [activeTab, setActiveTab] = useState('cv'); // 'cv' or 'diary'
  const [selectedDiaryIndex, setSelectedDiaryIndex] = useState(0);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

  const fileInputRef = useRef(null);

  // Identify current user and role safely
  const currentUser = user || loggedInUser || {};
  const isCoachOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'coach';

  // Photo upload with memory leak prevention
  const handlePhotoUpload = (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      if (uploadedPhoto) {
        URL.revokeObjectURL(uploadedPhoto);
      }
      const imageUrl = URL.createObjectURL(file);
      setUploadedPhoto(imageUrl);
    }
  };

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      if (uploadedPhoto) {
        URL.revokeObjectURL(uploadedPhoto);
      }
    };
  }, [uploadedPhoto]);

  const sectionHeaderStyle = {
    color: '#0f766e',
    margin: 0,
    fontSize: '15px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  useEffect(() => {
    const API_BASE = (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) 
  || (import.meta.env && import.meta.env.VITE_API_URL) 
  || 'http://localhost:8000';
    const fetchLiveTelemetry = async () => {
      try {
       const res = await fetch(`${API_BASE}/api/coach/portfolio`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.status !== 'no_data') {
          setLiveTelemetry(data);
        }
      } catch (err) {
        console.error("Error fetching live player profile telemetry:", err);
      }
    };

    fetchLiveTelemetry();
    const interval = setInterval(fetchLiveTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!coachProfile && !profile && !coach) {
      fetch('/coach_intel_cache.json')
        .then((res) => {
          if (!res.ok) throw new Error("File not found");
          return res.json();
        })
        .then((data) => setFetchedData(data))
        .catch((err) => console.error("Error loading intel cache:", err));
    }
  }, [coachProfile, profile, coach]);

  // Guard baseProfile against null/undefined to prevent crashes
  const baseProfile = coachProfile 
    || profile 
    || coach 
    || fetchedData?.individualPortals?.["Everyday Best Performer"]?.metadata 
    || fetchedData 
    || {};

  const activeProfile = {
    ...baseProfile,
    name: baseProfile?.name 
          || (currentUser?.name && currentUser.name !== "Admin Executive" ? currentUser.name : null)
          || liveTelemetry?.name 
          || 'Taml',
    ovr: liveTelemetry?.ovr || baseProfile?.ovr || 72,
    skills: liveTelemetry?.skills || baseProfile?.skills || { passing: 74, dribbling: 75, saq: 68, shooting: 71 }
  };

  const videoSrc = activeProfile?.improvementVideoUrl 
    || activeProfile?.highlightClip 
    || fetchedData?.highlightClip 
    || "/tenants/default_facility/micro_clip_3_players_drill_1.mp4";

  const rawLedger = liveTelemetry?.sessions || activeProfile?.coachingLedger || activeProfile?.sessionLogs || [
    { 
      date: "2026-08-26", 
      squad: "Under-18 Select", 
      drillFocus: "Tactical Rondo & Press Resistance", 
      duration: "90 min", 
      squadAvgScore: 84.5, 
      trackingStatus: "Verified", 
      playerName: "Sagnik Guha",
      videoProofUrl: videoSrc,
      metricHighlight: "Pass accuracy boosted to 88% under high pressure"
    },
    { 
      date: "2026-08-24", 
      squad: "Academy First Team", 
      drillFocus: "High-Speed Counter Transition", 
      duration: "75 min", 
      squadAvgScore: 78.2, 
      trackingStatus: "Verified", 
      playerName: "Rohan Das",
      videoProofUrl: videoSrc,
      metricHighlight: "Acceleration & turnaround speed reduced by 0.4s"
    }
  ];

  // FILTER LEDGER FOR PLAYERS (Safe Optional Chaining)
  const ledger = isCoachOrAdmin 
    ? rawLedger 
    : rawLedger.filter(item => item?.playerName?.toLowerCase() === currentUser?.name?.toLowerCase() || item?.playerId === currentUser?.id);

  const rawDiaryLogs = fetchedData?.diaryEntries || [
    {
      date: '2026-08-26',
      drillName: '⚽ Dribbling & Close Control Slalom',
      focusArea: 'Tight space spatial awareness & weak-foot acceleration',
      squadRankings: [
        { rank: 1, name: 'Sagnik Guha', ovr: 82, metric: '94% Control', trend: '+4%' },
        { rank: 2, name: activeProfile.name, ovr: 80, metric: '88% Control', trend: '+2%' },
        { rank: 3, name: 'Player #003', ovr: 65, metric: '64% Control', trend: '-1%' }
      ],
      videoProof: {
        player: 'Sagnik Guha',
        improvementNote: 'Pass accuracy increased from 71% to 88% after 3 sessions.',
        videoUrl: videoSrc
      }
    },
    {
      date: '2026-08-24',
      drillName: '📐 Pass & Support Angles (Give & Go)',
      focusArea: 'One-touch wall passes and third-man runs',
      squadRankings: [
        { rank: 1, name: activeProfile.name, ovr: 81, metric: '91% Pass Acc', trend: '+5%' },
        { rank: 2, name: 'Sagnik Guha', ovr: 78, metric: '84% Pass Acc', trend: '+1%' },
        { rank: 3, name: 'Player #003', ovr: 62, metric: '58% Pass Acc', trend: '0%' }
      ],
      videoProof: {
        player: activeProfile.name,
        improvementNote: 'First-touch orientation speed improved by 0.4 seconds.',
        videoUrl: videoSrc
      }
    }
  ];

  // FILTER DIARY ENTRIES FOR PLAYERS (Safe Optional Chaining)
  const diaryLogs = rawDiaryLogs.map(entry => {
    if (isCoachOrAdmin) return entry;
    return {
      ...entry,
      squadRankings: (entry?.squadRankings || []).filter(p => p?.name?.toLowerCase() === currentUser?.name?.toLowerCase()),
      videoProof: entry?.videoProof?.player?.toLowerCase() === currentUser?.name?.toLowerCase() 
        ? entry.videoProof 
        : { player: currentUser?.name || 'Player', improvementNote: 'Telemetry record assigned to player.', videoUrl: null }
    };
  });

  const totalSessions = ledger.length;
  const dynamicGrowth = totalSessions > 1
    ? ((ledger[0]?.squadAvgScore || ledger[0]?.passing || 0) - (ledger[totalSessions - 1]?.squadAvgScore || ledger[totalSessions - 1]?.passing || 0)).toFixed(1)
    : "0.0";

  const downloadCoachCV = () => {
    setActiveTab('cv');
    setTimeout(async () => {
      const element = document.getElementById('digital-coach-cv');
      if (!element) return;
      try {
        const html2pdfModule = await import('html2pdf.js');
        const html2pdf = html2pdfModule.default || html2pdfModule;
        const opt = {
          margin:       0.3,
          filename:     `${(activeProfile.name || 'Coach').replace(/\s+/g, '_')}_Official_Coaching_Resume.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, logging: false },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().from(element).set(opt).save();
      } catch (err) {
        console.error("Error generating PDF:", err);
      }
    }, 200);
  };

  // Safe indexing with fallbacks
  const activeDiaryEntry = diaryLogs[selectedDiaryIndex] || diaryLogs[0] || {};
  const activeVideoItem = ledger[selectedVideoIndex] || ledger[0] || {};

  const styles = {
    cvCard: { background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '24px', maxWidth: '850px', margin: '0 auto' },
    cvHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' },
    nameHeading: { margin: 0, fontSize: '24px', color: '#0f172a', fontWeight: '800' },
    subHeading: { margin: '4px 0 0 0', fontSize: '13px', color: '#475569', fontWeight: 'bold' },
    verifiedBadge: { backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' },
    sectionTitle: sectionHeaderStyle,
    downloadBtn: { backgroundColor: '#2563eb', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' },
    publishBtn: { backgroundColor: '#0f766e', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f1f5f9', minHeight: '100vh', fontFamily: 'sans-serif', borderRadius: '8px' }}>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handlePhotoUpload} 
        accept="image/*" 
        style={{ display: 'none' }} 
      />

      <div style={{ maxWidth: '850px', margin: '0 auto 15px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '20px', fontWeight: '800' }}>⚽ Smart Coaching Portfolio & Diary</h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
            {isCoachOrAdmin ? '🔓 Admin/Coach Full View' : '🔒 Player View (Personal Telemetry Only)'}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#cbd5e1', padding: '3px', borderRadius: '6px' }}>
            <button 
              onClick={() => setActiveTab('cv')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                backgroundColor: activeTab === 'cv' ? '#ffffff' : 'transparent',
                color: activeTab === 'cv' ? '#0f172a' : '#475569'
              }}
            >
              📄 Official Resume CV
            </button>
            <button 
              onClick={() => setActiveTab('diary')}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                backgroundColor: activeTab === 'diary' ? '#ffffff' : 'transparent',
                color: activeTab === 'diary' ? '#0f172a' : '#475569'
              }}
            >
              📖 Daily Drill Diary
            </button>
          </div>

          {onPublishToCoachesTab && (
            <button onClick={() => onPublishToCoachesTab(activeProfile)} style={styles.publishBtn}>
              📢 Publish Profile
            </button>
          )}

          {onClose && (
            <button onClick={onClose} style={{ backgroundColor: '#cbd5e1', color: '#0f172a', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
              Close
            </button>
          )}
          <button onClick={downloadCoachCV} style={styles.downloadBtn}>
            📥 Download Resume PDF
          </button>
        </div>
      </div>

      {activeTab === 'diary' && (
        <div style={{ maxWidth: '850px', margin: '0 auto', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '24px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
            {diaryLogs.map((entry, idx) => (
              <button
                key={entry?.date || idx}
                onClick={() => setSelectedDiaryIndex(idx)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: idx === selectedDiaryIndex ? '2px solid #0f766e' : '1px solid #cbd5e1',
                  backgroundColor: idx === selectedDiaryIndex ? '#f0fdf4' : '#ffffff',
                  color: idx === selectedDiaryIndex ? '#0f766e' : '#475569',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                📅 {entry?.date}
              </button>
            ))}
          </div>

          <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '6px', borderLeft: '4px solid #0f766e', marginBottom: '20px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Daily Drill Focus</span>
            <h3 style={{ margin: '4px 0 4px 0', color: '#1e293b', fontSize: '16px' }}>{activeDiaryEntry?.drillName || 'Drill Session'}</h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}><strong>Tactical Goal:</strong> {activeDiaryEntry?.focusArea || 'N/A'}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#0f172a', fontSize: '14px' }}>📊 Squad Ratings</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeDiaryEntry?.squadRankings && activeDiaryEntry.squadRankings.length > 0 ? (
                  activeDiaryEntry.squadRankings.map((player) => (
                    <div key={player?.name || Math.random()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: player?.rank === 1 ? '#fffbeb' : '#ffffff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: player?.rank === 1 ? '#f59e0b' : '#94a3b8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
                          {player?.rank}
                        </span>
                        <div>
                          <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>{player?.name}</strong>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{player?.metric}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f766e' }}>{player?.ovr} OVR</span>
                        <span style={{ display: 'block', fontSize: '10px', color: player?.trend?.startsWith('+') ? '#16a34a' : '#dc2626' }}>{player?.trend}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '12px', color: '#94a3b8' }}>No rankings listed for your account in this session.</p>
                )}
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#0f172a', fontSize: '14px' }}>📹 Telemetry Proof</h4>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', backgroundColor: '#f8fafc' }}>
                {activeDiaryEntry?.videoProof?.videoUrl ? (
                  <video controls style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '4px', backgroundColor: '#000' }}>
                    <source src={activeDiaryEntry.videoProof.videoUrl} type="video/mp4" />
                  </video>
                ) : (
                  <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#94a3b8', fontSize: '12px' }}>
                    🔒 Video proof restricted to assigned player
                  </div>
                )}
                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                    TRACKED: {activeDiaryEntry?.videoProof?.player || 'Athlete'}
                  </span>
                  <p style={{ fontSize: '11px', color: '#334155', margin: '6px 0 0 0', lineHeight: '1.4' }}>
                    💡 <strong>CV Observation:</strong> {activeDiaryEntry?.videoProof?.improvementNote || 'Telemetry updated.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: OFFICIAL RESUME CV */}
      <div id="digital-coach-cv" style={{ ...styles.cvCard, display: activeTab === 'cv' ? 'block' : 'none' }}>
        <div style={styles.cvHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div 
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                cursor: 'pointer',
                position: 'relative',
                border: '2px solid #0f172a',
                overflow: 'hidden',
                backgroundColor: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              title="Click to change profile picture"
            >
              {uploadedPhoto || activeProfile?.profilePictureUrl ? (
                <img 
                  src={uploadedPhoto || activeProfile.profilePictureUrl} 
                  alt={activeProfile?.name || 'Profile'} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '24px' }}>👤</span>
                </div>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={styles.nameHeading}>{activeProfile?.name}</h1>
                <span style={{ backgroundColor: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                  DYNAMIC OVR: {activeProfile?.ovr}
                </span>
              </div>
              <p style={styles.subHeading}>{activeProfile?.license || 'UEFA Pro Licensed'} • {activeProfile?.currentAcademy || activeProfile?.academy || 'Campus Performance Center'}</p>
            </div>
          </div>
          <div style={styles.verifiedBadge}>
            VERIFIED ATHLETE & COACH
          </div>
        </div>

        {/* SKILLS BREAKDOWN SECTION */}
        <div style={{ marginBottom: '22px' }}>
          <h3 style={styles.sectionTitle}>⚡ Technical Attribute Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginTop: '10px' }}>
            {Object.entries(activeProfile?.skills || {}).map(([skill, score]) => (
              <div key={skill} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold', display: 'block' }}>{skill}</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#0f766e' }}>{score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PROOF & PROGRESSION SECTION */}
        <div style={{ marginBottom: '22px' }}>
          <h3 style={styles.sectionTitle}>📈 Telemetry Proof & Video Proof Gallery</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', marginTop: '10px' }}>
            {/* LEFT SIDE: METRICS SUMMARY */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <strong style={{ fontSize: '13px', color: '#0f172a', display: 'block', marginBottom: '8px' }}>Tactical Progression Mapping</strong>
                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span>Baseline Score (Session 1):</span>
                  <strong style={{ color: '#dc2626' }}>78.2 PTS</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span>Current Squad Level:</span>
                  <strong style={{ color: '#16a34a' }}>84.5 PTS</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Net Growth Delta:</span>
                  <strong style={{ color: '#2563eb' }}>+{dynamicGrowth} PTS</strong>
                </div>
              </div>

              {activeVideoItem?.date && (
                <div style={{ marginTop: '12px', padding: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px' }}>
                  <span style={{ fontSize: '10px', color: '#166534', fontWeight: 'bold', textTransform: 'uppercase' }}>Selected Proof Note ({activeVideoItem.date}):</span>
                  <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#15803d' }}>
                    {activeVideoItem?.metricHighlight || `Verified drill session focus on ${activeVideoItem?.drillFocus}.`}
                  </p>
                </div>
              )}
            </div>

            {/* RIGHT SIDE: VIDEO PROOF PLAYER */}
            <div style={{ backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden', minHeight: '160px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #1e293b' }}>
              <div style={{ padding: '6px 10px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f8fafc', fontSize: '11px', fontWeight: 'bold' }}>
                  🎥 PROOF CLIP: {activeVideoItem?.playerName || activeProfile?.name}
                </span>
                <span style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px' }}>
                  VERIFIED CV
                </span>
              </div>

              <div style={{ height: '120px', backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(activeVideoItem?.videoProofUrl || videoSrc) && (isCoachOrAdmin || activeVideoItem?.playerName?.toLowerCase() === currentUser?.name?.toLowerCase()) ? (
                  <video key={activeVideoItem?.videoProofUrl || videoSrc} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
                    <source src={activeVideoItem?.videoProofUrl || videoSrc} type="video/mp4" />
                  </video>
                ) : (
                  <div style={{ color: '#64748b', fontSize: '11px', textAlign: 'center', padding: '10px' }}>
                    🔒 Video Proof Access Restricted
                  </div>
                )}
              </div>

              <div style={{ padding: '6px 10px', background: '#0f172a', color: '#94a3b8', fontSize: '10px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                📅 Date: {activeVideoItem?.date || '2026-08-26'} • Drill: {activeVideoItem?.drillFocus || 'Tactical Rondo'}
              </div>
            </div>
          </div>
        </div>

        {/* ASSIGNED ATHLETES PROGRESSION LEDGER */}
        <div>
          <h3 style={styles.sectionTitle}>ASSIGNED ATHLETES PROGRESSION LEDGER & VIDEO PROOFS</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Athlete Name</th>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Squad</th>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Drill Focus</th>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Passing %</th>
                <th style={{ padding: '8px', borderBottom: '2px solid #cbd5e1' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length > 0 ? (
                ledger.map((row, idx) => (
                  <tr 
                    key={idx} 
                    style={{ 
                      borderBottom: '1px solid #e2e8f0', 
                      backgroundColor: selectedVideoIndex === idx ? '#f0fdf4' : 'transparent',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedVideoIndex(idx)}
                  >
                    <td style={{ padding: '8px', color: '#64748b' }}>{row?.date || '2026-08-26'}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{row?.playerName || activeProfile?.name}</td>
                    <td style={{ padding: '8px' }}>{row?.squad || 'Academy Select'}</td>
                    <td style={{ padding: '8px', color: '#334155' }}>{row?.drillFocus || 'Tactical Rondo'}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold', color: '#0f766e' }}>{row?.squadAvgScore || 82}%</td>
                    <td style={{ padding: '8px' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedVideoIndex(idx); }}
                        style={{
                          backgroundColor: selectedVideoIndex === idx ? '#16a34a' : '#e2e8f0',
                          color: selectedVideoIndex === idx ? '#ffffff' : '#0f172a',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          cursor: 'pointer'
                        }}
                      >
                        {selectedVideoIndex === idx ? '▶ Playing' : '📺 Play Proof'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                    No telemetry records logged for this athlete view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}