import React, { useState } from 'react';

export default function CheckInAndReports({ currentUser }) {
  // Determine role (e.g., "admin" vs "player")
  const isAdmin = currentUser?.role === 'admin' || currentUser?.title?.includes('Admin');

  return (
    <div style={{ padding: '20px' }}>
      {isAdmin ? (
        /* ================= ADMIN VIEW ================= */
        <div className="admin-telemetry-panel" style={styles.card}>
          <div style={styles.header}>
            <h3>🌐 Admin Master Telemetry & Player Tracking Grid</h3>
            <p style={{ fontSize: '12px', color: '#64748b' }}>
              Aggregated live stream tracking metrics, cropped video face stamps, and biometric detections across all players.
            </p>
          </div>

          {/* Player Stamps Grid (Admin Only) */}
          <div style={styles.playerGrid}>
            {/* Example mapped player tracking cards */}
            {[1, 2, 3].map((player) => (
              <div key={player} style={styles.playerCard}>
                <div style={styles.cropBadge}>Cropped Crop ID #{player}</div>
                <div style={styles.cropPlaceholder}>
                  {/* Insert cropped player video bounding box image here */}
                  👤 [Video Crop Frame]
                </div>
                <div style={{ textAlign: 'left', marginTop: '8px', fontSize: '12px' }}>
                  <strong>Player:</strong> Sagnik Guha <br />
                  <strong>Bib:</strong> Black / Dark Bib <br />
                  <strong>Speed Index:</strong> 24.2 km/h <br />
                  <strong>Status:</strong> <span style={{ color: '#16a34a' }}>Active Tracked</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ================= PLAYER VIEW ================= */
        <div className="player-precheck-panel" style={styles.card}>
          <h3>👤 Daily Player Tracking Pre-Check</h3>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            Players: Verify your profile identity, assigned tracking color, and biometric face references prior to kickoff.
          </p>

          <form style={{ display: 'grid', gap: '15px', marginTop: '15px' }}>
            <div>
              <label style={styles.label}>Player Registered Name</label>
              <input type="text" placeholder="e.g., Sagnik Guha" style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>Today's Kit / Training Bib Color</label>
              <select style={styles.input}>
                <option>Black Kit / Dark Bib</option>
                <option>Red Kit / Light Bib</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Upload Daily Face Capture</label>
              <input type="file" />
            </div>
            <button type="submit" style={styles.submitBtn}>
              Commit Registration to Active Stream
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' },
  header: { marginBottom: '15px' },
  playerGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' },
  playerCard: { border: '1px solid #cbd5e1', padding: '10px', borderRadius: '6px', background: '#f8fafc' },
  cropBadge: { fontSize: '10px', background: '#0f172a', color: '#fff', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' },
  cropPlaceholder: { height: '100px', background: '#e2e8f0', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' },
  input: { width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' },
  submitBtn: { background: '#047857', color: '#fff', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }
};