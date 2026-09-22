import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import CoachPortfolioCV from './CoachPortfolioCV';

// Fixed Port: Updated to 8000 to match live_scouting_engine.py
const socket = io('http://localhost:8000');

// 1. Standalone Admin / Coach Multi-Player View Component
export const GroupReportView = () => {
  const [reports, setReports] = useState({});

  useEffect(() => {
    fetch('http://localhost:8000/api/admin/group_report')
      .then((res) => res.json())
      .then((data) => setReports(data.players || {}))
      .catch((err) => console.error('Error fetching admin group report:', err));
  }, []);

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg mt-6">
      <h2 className="text-xl font-bold mb-4">📋 Admin / Coach Multi-Player Session Overview</h2>
      {Object.keys(reports).length === 0 ? (
        <p className="text-slate-400">No session analytics recorded yet.</p>
      ) : (
        Object.keys(reports).map((playerId) => {
          const playerRuns = reports[playerId];
          const latest = playerRuns[playerRuns.length - 1] || {};

          return (
            <div key={playerId} className="mb-4 p-4 bg-slate-800 rounded border border-slate-700">
              <h3 className="font-bold text-green-400 text-lg">Player: {playerId}</h3>
              <p>Overall Score: <span className="font-semibold text-amber-300">{latest.score ?? '--'} / 100</span></p>
              <p>Passing Accuracy: {latest.passing_accuracy}%</p>
              <p>Reception Orientation: {latest.reception_orientation}%</p>
              <div className="mt-2">
                <span className="text-sm font-semibold text-slate-300">Coach Feedback Logs:</span>
                <ul className="list-disc list-inside text-sm text-yellow-300 mt-1">
                  {latest.coach_feedback?.map((fb, idx) => (
                    <li key={idx}>{fb}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// 2. Main Analytics Dashboard Export
export default function AnalyticsDashboard({ onAnalysisComplete, user, loggedInUser }) {
  const [liveData, setLiveData] = useState(null);
  const [sprintAccel, setSprintAccel] = useState(0);
  const [passAccuracy, setPassAccuracy] = useState(0);
  const [controlPrecision, setControlPrecision] = useState(0);

  // --- NEW PLAYER PROFILE & VIDEO OVERLAY STATES ---
  const [selectedPlayerId, setSelectedPlayerId] = useState('PLR-101');
  const [playerName, setPlayerName] = useState('');
  const [groupId, setGroupId] = useState('Group A');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [playerVideoCrop, setPlayerVideoCrop] = useState(null);
  const [playerScorecard, setPlayerScorecard] = useState(null);

  // --- COACH PORTFOLIO MODAL STATE ---
  const [showCoachPortfolio, setShowCoachPortfolio] = useState(false);

  useEffect(() => {
    socket.on('ui_telemetry_broadcast', (metrics) => {
      setLiveData(metrics);

      // Extract metrics sent from live_scouting_engine.py payload
      if (metrics) {
        if (metrics.live_velocity !== undefined) {
          setSprintAccel(metrics.live_velocity);
        }
        
        if (metrics.drill_analytics) {
          setPassAccuracy(metrics.drill_analytics.pass_accuracy || metrics.drill_analytics.accuracy || 0);
          setControlPrecision(metrics.drill_analytics.control_precision || metrics.drill_analytics.control || 0);
        }

        // Dynamically track bounding-box video crop & scorecard if matching selectedPlayerId
        if (metrics.player_id === selectedPlayerId || metrics.entity_id === selectedPlayerId) {
          if (metrics.video_crop || metrics.avatar_crop) {
            setPlayerVideoCrop(metrics.video_crop || metrics.avatar_crop);
          }
          setPlayerScorecard({
            score: metrics.ovr_score || metrics.score || 82,
            speed: metrics.live_velocity || sprintAccel,
            accuracy: metrics.drill_analytics?.pass_accuracy || passAccuracy,
            orientation: metrics.drill_analytics?.orientation || 85,
            confidence: metrics.reid_confidence || 0.94
          });
        }
      }
    });

    socket.on('pipeline_finished', (res) => {
      alert('Video Analysis Completed Successfully!');
      
      // Pass finalized telemetry back to App.jsx
      if (onAnalysisComplete) {
        onAnalysisComplete(res);
      }
    });

    return () => {
      socket.off('ui_telemetry_broadcast');
      socket.off('pipeline_finished');
    };
  }, [onAnalysisComplete, selectedPlayerId, sprintAccel, passAccuracy]);

  // Handle Photo Reference Upload for Re-ID Matching
  const handlePhotoUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadStatus('Please select an image file first.');
      return;
    }

    setUploadStatus('Uploading reference embedding...');
    const formData = new FormData();
    formData.append('player_id', selectedPlayerId);
    formData.append('name', playerName || selectedPlayerId);
    formData.append('group_id', groupId);
    formData.append('photo', uploadFile);

    try {
      const res = await fetch('http://localhost:8000/api/players/register', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus('✅ Reference photo uploaded & indexed for visual Re-ID!');
      } else {
        setUploadStatus(`❌ Upload failed: ${data.message || 'Server error'}`);
      }
    } catch (err) {
      console.error('Error uploading photo:', err);
      setUploadStatus('❌ Connection error uploading photo.');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>

      {/* --- DASHBOARD HEADER CONTROLS --- */}
      <div className="mb-4 flex justify-between items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
        <h2 className="text-xl font-bold text-white">⚽ Analytics & Scouting Engine</h2>
        <button 
          onClick={() => setShowCoachPortfolio(true)}
          className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-all shadow-md flex items-center gap-2"
        >
          📋 View Coach Portfolio & CV
        </button>
      </div>

      {/* --- COACH PORTFOLIO MODAL OVERLAY --- */}
      {showCoachPortfolio && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.75)', 
            zIndex: 9999, 
            overflowY: 'auto', 
            padding: '20px' 
          }}
        >
          <CoachPortfolioCV 
            user={user} 
            loggedInUser={loggedInUser} 
            onClose={() => setShowCoachPortfolio(false)} 
          />
        </div>
      )}
      
      {/* --- PLAYER REFERENCE PHOTO UPLOAD WIDGET --- */}
      <div className="mb-6 p-5 bg-slate-900 border border-slate-800 rounded-xl text-white">
        <h3 className="text-lg font-bold text-yellow-400 mb-2 flex items-center gap-2">
          📸 Player Profile & Visual Reference Registration
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Upload reference photos for players/coaches to enable dynamic YOLO bounding-box Re-ID matching.
        </p>

        <form onSubmit={handlePhotoUpload} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Player ID</label>
            <input
              type="text"
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
              placeholder="e.g. PLR-101"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Player Name</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
              placeholder="e.g. Victor Lindelof"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Squad / Group ID</label>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
              placeholder="e.g. Group A"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Reference Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files[0])}
              className="w-full text-xs text-slate-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-yellow-400 file:text-slate-950 file:font-bold hover:file:bg-yellow-300"
            />
          </div>

          <div className="md:col-span-4 flex items-center justify-between mt-2">
            <button
              type="submit"
              className="bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold px-5 py-2 rounded-lg text-xs transition-all active:scale-95"
            >
              Upload Reference Embedding
            </button>
            {uploadStatus && (
              <span className="text-xs font-semibold text-slate-300">{uploadStatus}</span>
            )}
          </div>
        </form>
      </div>

      {/* --- DYNAMIC PLAYER BOUNDING-BOX & SCORECARD DISPLAY --- */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Dynamic Bounding Box Visual Crop */}
        <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800 flex flex-col items-center justify-center min-h-[160px]">
          <p className="text-xs text-slate-400 mb-2 font-mono">
            Bounding-Box Overlay Snippet ({selectedPlayerId})
          </p>
          {playerVideoCrop ? (
            <div className="relative border-2 border-yellow-400 rounded-lg overflow-hidden">
              <img
                src={playerVideoCrop}
                alt={`Tracked ${selectedPlayerId}`}
                className="w-32 h-32 object-cover"
              />
              <span className="absolute bottom-1 right-1 bg-yellow-400 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded">
                LIVE
              </span>
            </div>
          ) : (
            <div className="w-32 h-32 bg-slate-800 border border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-500 text-xs text-center p-2">
              Waiting for player tracking bbox...
            </div>
          )}
        </div>

        {/* Dynamic Scorecard Panel */}
        <div className="md:col-span-2 p-4 bg-slate-900 text-white rounded-lg border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-yellow-400 text-base">
              🎯 Dynamic Performance Scorecard: <span className="text-white">{selectedPlayerId}</span>
            </h4>
            <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
              Re-ID Confidence: {playerScorecard ? `${(playerScorecard.confidence * 100).toFixed(0)}%` : '94%'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center my-2">
            <div className="bg-slate-800 p-2 rounded border border-slate-700">
              <p className="text-[10px] text-slate-400 uppercase">OVR Score</p>
              <p className="text-xl font-black text-yellow-400">{playerScorecard?.score ?? 82}</p>
            </div>
            <div className="bg-slate-800 p-2 rounded border border-slate-700">
              <p className="text-[10px] text-slate-400 uppercase">Live Speed</p>
              <p className="text-xl font-black text-cyan-400">{playerScorecard?.speed ?? sprintAccel} <span className="text-[10px]">km/h</span></p>
            </div>
            <div className="bg-slate-800 p-2 rounded border border-slate-700">
              <p className="text-[10px] text-slate-400 uppercase">Pass Acc</p>
              <p className="text-xl font-black text-emerald-400">{playerScorecard?.accuracy ?? passAccuracy}%</p>
            </div>
            <div className="bg-slate-800 p-2 rounded border border-slate-700">
              <p className="text-[10px] text-slate-400 uppercase">Orientation</p>
              <p className="text-xl font-black text-amber-400">{playerScorecard?.orientation ?? 85}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Display */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-slate-800 text-white rounded-lg text-center border border-slate-700">
          <p className="text-sm text-slate-400">Sprint Accel</p>
          <p className="text-3xl font-bold text-cyan-400">{sprintAccel} <span className="text-xs">km/h</span></p>
        </div>
        <div className="p-4 bg-slate-800 text-white rounded-lg text-center border border-slate-700">
          <p className="text-sm text-slate-400">Pass Accuracy</p>
          <p className="text-3xl font-bold text-emerald-400">{passAccuracy}%</p>
        </div>
        <div className="p-4 bg-slate-800 text-white rounded-lg text-center border border-slate-700">
          <p className="text-sm text-slate-400">Control Precision</p>
          <p className="text-3xl font-bold text-amber-400">{controlPrecision}</p>
        </div>
      </div>

      <h3 style={{ fontFamily: 'monospace' }}>Live CV Analytics Output</h3>
      {liveData ? (
        <pre style={{ background: '#1e1e1e', color: '#00ffcc', padding: '15px', borderRadius: '8px', fontFamily: 'monospace' }}>
          {JSON.stringify(liveData, null, 2)}
        </pre>
      ) : (
        <p className="text-slate-400 italic">Waiting for telemetry stream...</p>
      )}

      {/* Renders Admin / Coach Group Report right under live stream telemetry */}
      <GroupReportView />
    </div>
  );
}