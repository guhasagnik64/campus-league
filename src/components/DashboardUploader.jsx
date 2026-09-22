import React, { useState } from 'react';
import axios from 'axios';
import AdminConsole from './AdminConsole';

// --- FIREBASE IMPORTS ---
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const ALL_DRILLS = [
  { id: 'dribble_scan_pass', name: '🎯 Coach Tamal: Outside Cut & Vision', coachId: 'coach_tamal', academyId: 'academy_01' },
  { id: 'clean_dribble', name: '✨ Clean Cone Dribble & Posture', coachId: 'coach_tamal', academyId: 'academy_01' },
  { id: 'left_outside_cut', name: '🦶 Left Foot Outside Cut Slalom', coachId: 'coach_tamal', academyId: 'academy_01' },
  { id: 'weak_foot', name: '💪 Weak Foot Proficiency', coachId: 'coach_tamal', academyId: 'academy_01' },
  { id: 'foot_combination', name: '🔄 Left-Right Foot Combination', coachId: 'coach_tamal', academyId: 'academy_01' },
  { id: 'pass_support', name: '📐 3-Player Pass & Support Rotation', coachId: 'coach_arin', academyId: 'academy_02' },
];

export default function DashboardUploader({ currentUser, setDrillStats }) {
  // Pre-fill session parameters using logged-in user context
  const playerName = currentUser?.name || 'Sagnik Guha';
  const assignedCoach = currentUser?.assignedCoach || 'Coach Tamal';
  const coachId = currentUser?.coachId || 'coach_tamal';
  const playerId = currentUser?.id || 'PLR-101';

  // Session-specific Kit Calibration States
  const [bibColor, setBibColor] = useState('Black Kit / Dark Bib');
  const [stockingColor, setStockingColor] = useState('White');
  const [bootColor, setBootColor] = useState('Neon / Bright');

  // Media Files & Analysis States
  const [videoFile, setVideoFile] = useState(null);
  const [playerPhotoFile, setPlayerPhotoFile] = useState(null);
  const [isFaceRegistered, setIsFaceRegistered] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [drillType, setDrillType] = useState('dribble_scan_pass');

  // NEW: Execution Mode & Player Tag States
  const [executionMode, setExecutionMode] = useState('solo'); // 'solo' | 'group'
  const [groupPlayers, setGroupPlayers] = useState(['Arin', 'Rohan', 'Guest_03']);
  const [newTagInput, setNewTagInput] = useState('');

  // Filter drills to ensure the player stays in Coach Tamal's room
  const availableDrills = ALL_DRILLS.filter(drill => {
    if (currentUser?.role === 'admin') return true;
    return drill.coachId === coachId;
  });

  const handleAddPlayerTag = () => {
    if (newTagInput.trim() && !groupPlayers.includes(newTagInput.trim())) {
      setGroupPlayers([...groupPlayers, newTagInput.trim()]);
      setNewTagInput('');
    }
  };

  const handleRemovePlayerTag = (indexToRemove) => {
    setGroupPlayers(groupPlayers.filter((_, idx) => idx !== indexToRemove));
  };

  const handleUploadFaceStamp = async () => {
    if (!playerPhotoFile) {
      setStatus('⚠️ Select a face/player photo reference first.');
      return;
    }
    setLoading(true);
    setStatus('Registering player photo reference...');

    const formData = new FormData();
    formData.append('photo', playerPhotoFile);
    formData.append('player_id', playerId);
    formData.append('name', playerName);
    formData.append('group_id', executionMode === 'group' ? 'Group A' : 'Solo');

    try {
      const response = await fetch('http://localhost:8000/api/players/register', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setStatus(`✅ Photo reference bound to ${playerName} under ${assignedCoach}!`);
        setIsFaceRegistered(true);
      } else {
        setStatus(`❌ Registration Error: ${data.message || 'Failed to upload photo'}`);
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Server connection error on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchAnalysis = async () => {
    if (!videoFile) {
      setStatus('⚠️ Please select a drill video clip first.');
      return;
    }

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("drillType", drillType);
    formData.append("playerName", playerName);
    formData.append("playerId", playerId);
    formData.append("coachId", coachId);

    // Attach Player Reference Photo alongside video if selected
    if (playerPhotoFile) {
      formData.append("photo", playerPhotoFile);
    }

    // Dynamic Player Tag Serialization
    const activeTags = executionMode === 'group' ? groupPlayers : [playerName];
    formData.append("playerTags", JSON.stringify(activeTags));

    try {
      setIsAnalyzing(true);
      setStatus(`⏳ Analyzing session video & photo reference for ${videoFile.name}...`);

      const response = await axios.post("http://localhost:8002/api/upload-analysis", formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = response.data;

      if (data.data && typeof setDrillStats === 'function') {
        setDrillStats({
          sprintAccel: data.data.metric_val || 0,
          passAccuracy: 85,
          controlPrecision: 90
        });
      }

      if (data) {
        try {
          await addDoc(collection(db, "leaderboards"), {
            ...data,
            player_name: playerName,
            player_id: playerId,
            player_tags: activeTags,
            execution_mode: executionMode,
            drill_type: drillType,
            has_photo_reference: !!playerPhotoFile,
            createdAt: serverTimestamp()
          });
          setStatus(`✅ Analysis complete! Video and photo reference processed.`);
        } catch (firebaseErr) {
          console.error("Firebase save error:", firebaseErr);
          setStatus(`🔄 Analysis finished, but failed to save to database.`);
        }
      }

      alert(`Video and player photo analysis complete for ${videoFile.name}!`);
    } catch (error) {
      console.error("Analysis Error:", error);
      setStatus('❌ Upload failed. Ensure Express/Python backend (port 8000) is running!');
      alert("Upload failed. Ensure backend (port 8000) is running!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #1e293b',
      padding: '24px',
      borderRadius: '12px',
      color: '#fff',
      maxWidth: '850px',
      margin: '0 auto 24px auto'
    }}>
      {/* HEADER ROOM SCOPE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, color: '#ffd700', fontSize: '18px' }}>
            🎯 Live Drill Evaluation & Calibration
          </h3>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>
            Active Player: <strong style={{ color: '#fff' }}>{playerName} ({playerId})</strong> | Assigned Room: <strong style={{ color: '#38bdf8' }}>{assignedCoach}</strong>
          </p>
        </div>
        <div>
          <span style={{
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: isFaceRegistered ? '#065f46' : '#854d0e',
            color: isFaceRegistered ? '#34d399' : '#fde047',
            fontWeight: 'bold'
          }}>
            {isFaceRegistered ? '✓ Photo Reference Bound' : '⚠️ Photo Pending'}
          </span>
        </div>
      </div>

      {/* STEP 1: KIT & PLAYER PHOTO REFERENCE CALIBRATION */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#10b981', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          👤 Step 1: Player Photo Reference & Kit Calibration
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Bib/Jersey Color</label>
            <select value={bibColor} onChange={(e) => setBibColor(e.target.value)} style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '8px', borderRadius: '6px', fontSize: '12px' }}>
              <option>Black Kit / Dark Bib</option>
              <option>Red Bib</option>
              <option>Yellow / Neon Bib</option>
              <option>Blue Bib</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Stockings Color</label>
            <select value={stockingColor} onChange={(e) => setStockingColor(e.target.value)} style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '8px', borderRadius: '6px', fontSize: '12px' }}>
              <option>White</option>
              <option>Black</option>
              <option>Red</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Boots Color</label>
            <select value={bootColor} onChange={(e) => setBootColor(e.target.value)} style={{ width: '100%', background: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '8px', borderRadius: '6px', fontSize: '12px' }}>
              <option>Neon / Bright</option>
              <option>Black / Dark</option>
              <option>White</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8' }}>Player Photo Reference (For Re-ID & Visual Bounding Box Matching):</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => setPlayerPhotoFile(e.target.files?.[0] || null)} 
              style={{ fontSize: '12px', color: '#94a3b8', flex: 1 }}
            />
            <button 
              onClick={handleUploadFaceStamp}
              disabled={loading || !playerPhotoFile}
              style={{
                padding: '6px 14px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: loading || !playerPhotoFile ? 'not-allowed' : 'pointer'
              }}
            >
              Upload & Bind Photo
            </button>
          </div>
        </div>
      </div>

      {/* STEP 2: EXECUTION MODE & PLAYER TAGS */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#f59e0b', fontSize: '13px', textTransform: 'uppercase' }}>
          👥 Step 2: Session Execution Mode & Player Tagging
        </h4>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <button
            onClick={() => setExecutionMode('solo')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: executionMode === 'solo' ? '2px solid #3b82f6' : '1px solid #334155',
              background: executionMode === 'solo' ? '#1e3a8a' : '#0f172a',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            👤 Solo Mode
          </button>
          <button
            onClick={() => setExecutionMode('group')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '6px',
              border: executionMode === 'group' ? '2px solid #3b82f6' : '1px solid #334155',
              background: executionMode === 'group' ? '#1e3a8a' : '#0f172a',
              color: '#fff',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            👥 Group / Squad Mode
          </button>
        </div>

        {executionMode === 'group' && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
              Multi-Player Tag Roster:
            </label>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Enter player name (e.g. Arin)"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPlayerTag())}
                style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={handleAddPlayerTag}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                + Add Tag
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {groupPlayers.map((tag, idx) => (
                <span key={idx} style={{ background: '#0284c7', color: '#fff', fontSize: '11px', padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {tag}
                  <button
                    onClick={() => handleRemovePlayerTag(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: VIDEO & PHOTO PAYLOAD UPLOAD DROPZONE */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#38bdf8', fontSize: '13px', textTransform: 'uppercase' }}>
          📹 Step 3: Upload Session Clip & Launch Combined Auto-Analysis
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Session Video File (*Required):</label>
            <input 
              type="file" 
              accept="video/*" 
              onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
              style={{ fontSize: '12px', color: '#94a3b8' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <select 
              value={drillType} 
              onChange={(e) => setDrillType(e.target.value)}
              style={{ flex: 1, background: '#0f172a', color: '#fff', border: '1px solid #334155', padding: '8px', borderRadius: '6px', fontSize: '12px' }}
            >
              {availableDrills.map((drill) => (
                <option key={drill.id} value={drill.id}>
                  {drill.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleLaunchAnalysis}
              disabled={isAnalyzing || !videoFile}
              style={{
                padding: '8px 18px',
                background: isAnalyzing ? '#d97706' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: isAnalyzing || !videoFile ? 'not-allowed' : 'pointer'
              }}
            >
              {isAnalyzing ? '🔄 Processing...' : '⚡ Launch Combined Analysis'}
            </button>
          </div>
        </div>
      </div>

      {/* FEEDBACK FEED */}
      {status && (
        <div style={{ marginTop: '14px', padding: '10px 14px', background: '#334155', borderRadius: '6px', fontSize: '12px', color: '#cbd5e1' }}>
          {status}
        </div>
      )}

      <AdminConsole />
    </div>
  );
}