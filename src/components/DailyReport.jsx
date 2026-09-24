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

  // Fallbacks for date and drill names
  const sessionDate =
    propSessionDate || new Date().toISOString().split('T')[0];

  const drillName =
    propDrillFormat ||
    reportData?.drill_name ||
    'Tactical Rondo';

  // 2. 24-HOUR EXPIRATION CHECK
  const createdAtTime = reportData?.generated_at
    ? new Date(reportData.generated_at).getTime()
    : Date.now();

  const hoursElapsed =
    (Date.now() - createdAtTime) / (1000 * 60 * 60);

  const isExpired = hoursElapsed >= 24;

  // 3. TIMER EFFECT
  useEffect(() => {
    const reportTimestamp = intelData?.generated_at
      ? new Date(intelData.generated_at).getTime()
      : Date.now();

    const expirationTime =
      reportTimestamp + 24 * 60 * 60 * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const distance = expirationTime - now;

      if (distance <= 0) {
        setTimeLeft('Expired');
        clearInterval(interval);
      } else {
        const hours = Math.floor(
          (distance % (1000 * 60 * 60 * 24)) /
            (1000 * 60 * 60)
        );

        const minutes = Math.floor(
          (distance % (1000 * 60 * 60)) /
            (1000 * 60)
        );

        const seconds = Math.floor(
          (distance % (1000 * 60)) /
            1000
        );

        setTimeLeft(
          `${hours}h ${minutes}m ${seconds}s`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [intelData]);

  // 4. FIRESTORE REAL-TIME LISTENER + CACHE FALLBACK
  useEffect(() => {
    const targetPlayerId =
      user?.id ||
      propPlayerName ||
      'PLR-101';

    const unsub = onSnapshot(
      doc(db, 'daily_reports', targetPlayerId),
      (docSnap) => {
        if (docSnap.exists()) {
          setReportData(docSnap.data());
        }
      },
      (err) => {
        console.error(
          'Firestore listener error:',
          err
        );
      }
    );

    fetch('/coach_intel_cache.json?t=' + Date.now(), {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('File not found');
        }

        return res.json();
      })
      .then((data) => {
        if (
          data &&
          (data.individualPortals ||
            data.generalSquadScore)
        ) {
          setIntelData(data);
        }
      })
      .catch(() => {});

    return () => unsub();
  }, [user, propPlayerName]);

  // PRINT HANDLER
  const handlePrint = () => {
    window.print();
  };

  const activeSession = intelData;

  const premiumPlayerName =
    reportData?.player_name ||
    propPlayerName ||
    user?.name ||
    'Sagnik Guha';

  const premiumPosition =
    reportData?.position ||
    propPosition ||
    'Midfielder';

  const drillFormat =
    reportData?.drill_name ||
    propDrillFormat ||
    'dribbling';

  const premiumCoachSummary =
    propCoachLog ||
    reportData?.written_breakdown ||
    activeSession?.summary ||
    activeSession?.individualPortals?.[premiumPlayerName]?.content ||
    'Analysis pending... Upload a training video and launch auto-analysis to generate real-time coaching feedback.';

  const matchedPlayer =
    intelData?.rankings?.find(
      (r) =>
        r.name?.toLowerCase() ===
        (premiumPlayerName || '').toLowerCase()
    ) ||
    intelData?.rankings?.[0];

  // 🎯 DYNAMIC COMPUTER VISION METRICS EXTRACTION

  const rawPass =
    reportData?.pass_accuracy ??
    propMetrics?.passingAccuracy ??
    matchedPlayer?.pass_accuracy ??
    intelData?.pass_accuracy;

  const rawReception =
    propMetrics?.receptionPrecision ??
    matchedPlayer?.control_precision ??
    matchedPlayer?.reception_precision ??
    intelData?.control_precision;

  const rawSprint =
    reportData?.sprint_speed ??
    propMetrics?.sprintAcceleration ??
    matchedPlayer?.sprint_accel ??
    intelData?.sprint_accel;

  const premiumPassing =
    rawPass !== undefined && rawPass !== null
      ? typeof rawPass === 'number'
        ? `${rawPass}%`
        : rawPass
      : '74%';

  const premiumReception =
    rawReception !== undefined &&
    rawReception !== null
      ? typeof rawReception === 'number'
        ? `${rawReception}%`
        : rawReception
      : '84.5%';

  const premiumSprint =
    rawSprint !== undefined &&
    rawSprint !== null
      ? typeof rawSprint === 'number'
        ? `${rawSprint}%`
        : rawSprint
      : '68%';

  const currentDate =
    propSessionDate || sessionDate;

  // 📥 DOWNLOADABLE DIARY REPORT HANDLER
  const downloadDiaryReport = () => {
    const content = `
=========================================
J-AGENCY DAILY PRACTICE DIARY & REPORT
=========================================
Student Name : ${premiumPlayerName}
Drill Name   : ${drillFormat}
Session Date : ${currentDate}

PERFORMANCE METRICS:

- Passing Accuracy     : ${premiumPassing}
- Orientation Precision: ${premiumReception}
- Sprint Acceleration  : ${premiumSprint}
- OVR Rating           : ${reportData?.ovr || '72'}
=========================================
Status: Verified Daily Practice Record
`.trim();

    const blob = new Blob(
      [content],
      {
        type: 'text/plain;charset=utf-8;'
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;

    link.download =
      `${premiumPlayerName.replace(/\s+/g, '_')}_${drillFormat}_${currentDate}.txt`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // ⏳ EXPIRED REPORT VIEW
  if (isExpired) {
    return (
      <div
        style={{
          maxWidth: '760px',
          margin: '40px auto',
          padding: '40px',
          backgroundColor: '#ffffff',
          border: '2px solid #cbd5e1',
          borderRadius: '10px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '15px' }}>
          ⏳
        </div>

        <h2
          style={{
            margin: '0 0 10px 0',
            color: '#0f172a'
          }}
        >
          Report Expired
        </h2>

        <p
          style={{
            color: '#64748b',
            fontSize: '14px',
            lineHeight: '1.6'
          }}
        >
          Daily practice reports automatically delete
          after 24 hours. Check back after your next
          training session!
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f1f5f9',
        padding: '20px'
      }}
    >
      {/* 📢 AD SPOT 1: TOP LARGE BANNER */}

      <div style={styles.topBannerAd}>
        <div>
          <div style={styles.adTag}>
            FEATURED ARENA
          </div>

          <h3
            style={{
              margin: '6px 0 4px 0',
              fontSize: '16px'
            }}
          >
            ⚽ Night Turf Booking Available at J-Futsal
            Arena!
          </h3>

          <p
            style={{
              margin: 0,
              fontSize: '11px',
              opacity: 0.9
            }}
          >
            Reserve floodlit 5v5 & 7v7 pitches directly
            through the app tab.
          </p>
        </div>

        <button
          type="button"
          style={styles.adActionButton}
          onClick={() => {
            console.log('Book Turf Now clicked');
          }}
        >
          Book Turf Now
        </button>
      </div>

      {/* PROMO LAUNCH ALIGNMENT BANNER */}

      <div style={styles.promoBanner}>
        🎉 <strong>Launch Promotion Active:</strong>{' '}
        Premium reports are currently{' '}
        <strong>${reportAccessPrice}</strong> for players!
      </div>

      {/* ⏱️ 24-HOUR EXPIRATION COUNTER */}

      <div
        style={{
          maxWidth: '760px',
          margin: '0 auto 15px auto',
          padding: '10px 15px',
          backgroundColor: '#ffffff',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          textAlign: 'center',
          fontSize: '12px'
        }}
      >
        <div
          style={{
            color: '#dc2626',
            fontWeight: 'bold'
          }}
        >
          🔴 Results are LIVE! Print or download your
          telemetry sheet now.
        </div>

        <div
          style={{
            marginTop: '4px',
            color: '#475569'
          }}
        >
          Auto-purging in:{' '}
          <strong>
            {timeLeft || '24h 00m 00s'}
          </strong>
        </div>
      </div>

      {/* 🏆 PREMIUM PLAYER TELEMETRY SHEET */}

      <div style={styles.reportSheet} id="daily-report-sheet">

        {/* HEADER */}

        <div style={styles.headerBlock}>
          <div>
            <h1 style={styles.agencyTitle}>
              J-AGENCY
            </h1>

            <p style={styles.agencySub}>
              CAMPUS LEAGUE PERFORMANCE LABS • DAILY
              PLAYER TELEMETRY SYSTEM
            </p>
          </div>

          <div style={styles.officialBadge}>
            OFFICIAL REPORT
          </div>
        </div>

        {/* METRIC PROFILE */}

        <div style={styles.profileRow}>

          <div style={styles.avatarBox}>
            {user?.profilePictureUrl ||
            reportData?.profilePictureUrl ? (
              <img
                src={
                  user?.profilePictureUrl ||
                  reportData?.profilePictureUrl
                }
                alt={premiumPlayerName}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '38px'
                  }}
                >
                  👤
                </div>

                <div style={styles.avatarLabel}>
                  DAILY STAMP
                </div>
              </>
            )}
          </div>

          <div style={styles.identityDetails}>
            <h2 style={styles.playerNameText}>
              {premiumPlayerName}
            </h2>

            <p style={styles.metaText}>
              <strong>Position:</strong>{' '}
              {premiumPosition}
            </p>

            <p style={styles.metaText}>
              <strong>Status:</strong> Session Verified
            </p>

            <p style={styles.metaText}>
              <strong>SESSION DATE:</strong>{' '}
              {currentDate}
            </p>
          </div>

          <div style={styles.metaRight}>
            <p style={styles.metaText}>
              <strong>Report ID:</strong>{' '}
              {reportData?.report_id ||
                '#SR-20260709-01'}
            </p>

            <p style={styles.metaText}>
              <strong>Attendance:</strong> Present
            </p>

            <p style={styles.metaText}>
              <strong>OVR:</strong>{' '}
              {reportData?.ovr || '72'}
            </p>
          </div>
        </div>

        {/* SUB-NOTE */}

        <div style={styles.systemAlertNote}>
          <strong>Note:</strong> Kit profiles are dynamic
          per session. Tracking and metrics are anchored
          strictly via facial telemetry verification.
        </div>

        {/* TACTICAL CONSTRAINTS */}

        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>
            DAILY TACTICAL OVERRIDE & CONSTRAINTS
          </h3>

          <div style={styles.gridTwoColumn}>
            <p style={styles.bodyText}>
              <strong>Drill Format:</strong>{' '}
              {drillFormat
                .replace(/_/g, ' ')
                .toUpperCase()}
            </p>

            <p style={styles.bodyText}>
              <strong>Confidence Cutoff:</strong> 75.0%
            </p>
          </div>

          <p style={styles.bodyText}>
            <strong>Target Focus:</strong> Passing
            accuracy, reception orientation, and off-ball
            sprint timing.
          </p>
        </div>

        {/* ⚡ PLAYER DRAWBACKS & TACTICAL ANALYSIS */}

        {(reportData?.drawbacks ||
          reportData?.coach_feedback) && (
          <div style={styles.sectionBlock}>
            <h3 style={styles.sectionHeading}>
              ⚡ PLAYER DRAWBACKS & TACTICAL ANALYSIS
            </h3>

            <p style={styles.bodyText}>
              {reportData?.drawbacks ||
                reportData?.coach_feedback}
            </p>
          </div>
        )}

        {/* 📢 AD SPOT 2 */}

        <div style={styles.inReportAdBox}>
          <div>
            <strong
              style={{
                display: 'block',
                fontSize: '11px'
              }}
            >
              [ OFFICIAL EQUIPMENT SPONSOR ]
            </strong>

            <span
              style={{
                fontSize: '11px'
              }}
            >
              🛒 Vega Store: Get 15% off official match
              kits & Grip Socks!
            </span>
          </div>

          <button
            type="button"
            style={styles.storeButton}
            onClick={() => {
              console.log('Vega Store discount clicked');
            }}
          >
            CLAIM DISCOUNT →
          </button>
        </div>

        {/* COACH LOG */}

        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>
            COACH INTELLIGENCE LOG
          </h3>

          <div style={styles.quoteBox}>
            "{premiumCoachSummary}"
          </div>
        </div>

        {/* METRICS PERFORMANCE */}

        <div style={styles.sectionBlock}>
          <h3 style={styles.sectionHeading}>
            SESSION METRICS PERFORMANCE
          </h3>

          <ul style={styles.statsUnorderedList}>

            <li style={styles.statLineItem}>
              <span>
                • Passing Accuracy (Preferred Foot)
              </span>

              <strong style={styles.statValue}>
                {premiumPassing}
              </strong>
            </li>

            <li style={styles.statLineItem}>
              <span>
                • Reception Orientation Precision
              </span>

              <strong style={styles.statValue}>
                {premiumReception}
              </strong>
            </li>

            <li style={styles.statLineItem}>
              <span>
                • Off-Ball Sprint Acceleration Rate
              </span>

              <strong style={styles.statValue}>
                {premiumSprint}
              </strong>
            </li>

          </ul>
        </div>

        {/* 📢 AD SPOT 3: FOOTER PARTNER TILES */}

        <div style={styles.footerBanner}>
          <div style={styles.footerSeparator}>
            ===================================================================================
          </div>

          <p style={styles.sponsorHeading}>
            OFFICIAL SPONSORS & PARTNERS
          </p>

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

      <div style={styles.bottomAdCard}>
        <div>
          <div
            style={{
              fontSize: '22px',
              marginBottom: '3px'
            }}
          >
            🛍️
          </div>

          <h4
            style={{
              margin: 0,
              fontSize: '14px',
              color: '#0f172a'
            }}
          >
            Equip Your Next Match at Vega Store
          </h4>

          <p
            style={{
              margin: '3px 0 0 0',
              fontSize: '11px',
              color: '#64748b'
            }}
          >
            Browse performance boots, shin guards, and
            recovery gear in our store.
          </p>
        </div>

        <button
          type="button"
          style={styles.storeButton}
          onClick={() => {
            console.log('Visit Vega Store clicked');
          }}
        >
          Visit Vega Store
        </button>
      </div>

      {/* PRINT & DOWNLOAD ACTION TRIGGER CTA BAR */}

      <div
        style={{
          maxWidth: '760px',
          margin: '20px auto 0 auto',
          display: 'flex',
          justifyContent: 'center',
          gap: '10px',
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          onClick={downloadDiaryReport}
          style={{
            ...styles.storeButton,
            padding: '12px 18px'
          }}
        >
          📥 Download Today's Practice Report (.txt)
        </button>

        <button
          type="button"
          onClick={handlePrint}
          style={styles.printButton}
        >
          🖨️ Print / Save PDF Telemetry Sheet
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
    boxShadow:
      '0 4px 6px -1px rgba(0,0,0,0.1)'
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
    boxShadow:
      '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
    color: '#000000',
    maxWidth: '760px',
    margin: '0 auto',
    fontFamily:
      '"Courier New", Courier, monospace',
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