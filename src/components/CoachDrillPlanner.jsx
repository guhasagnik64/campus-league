import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// Fixed Socket Connection to Express Gateway
const socket = io('http://localhost:8000');

export default function CoachDrillPlanner({ currentUser }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live Socket Telemetry States
  const [sprintAccel, setSprintAccel] = useState(0);
  const [passAccuracy, setPassAccuracy] = useState(0);
  const [controlPrecision, setControlPrecision] = useState(0);

  // NEW: Execution Mode & Player Tagging States for Form Triggers
  const [executionMode, setExecutionMode] = useState('solo');
  const [groupPlayers, setGroupPlayers] = useState(['Arin', 'Rohan', 'Guest_03']);
  const [newTagInput, setNewTagInput] = useState('');

  const userRole = currentUser?.role || 'coach';
  const userAcademyId = currentUser?.academyId || 'academy_01';
  const coachId = currentUser?.id || 'coach_01';

  // 1. Fetch Squad Roster Data
  useEffect(() => {
    const fetchUrl = userRole === 'admin'
      ? `/api/v1/admin/students`
      : `/api/v1/academies/${userAcademyId}/coaches/${coachId}/students`;

    fetch(fetchUrl)
      .then((res) => res.json())
      .then((data) => {
        setStudents(data.students || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load squad data:', err);
        setLoading(false);
      });
  }, [userRole, userAcademyId, coachId]);

  // 2. Listen for Real-Time Telemetry Stream
  useEffect(() => {
    socket.on('ui_telemetry_broadcast', (data) => {
      if (data) {
        if (data.live_velocity !== undefined) {
          setSprintAccel(data.live_velocity);
        }
        if (data.drill_analytics) {
          setPassAccuracy(data.drill_analytics.pass_accuracy || 0);
          setControlPrecision(data.drill_analytics.control_precision || 0);
        }
      }
    });

    return () => {
      socket.off('ui_telemetry_broadcast');
    };
  }, []);

  const handleAddPlayerTag = () => {
    if (newTagInput.trim() && !groupPlayers.includes(newTagInput.trim())) {
      setGroupPlayers([...groupPlayers, newTagInput.trim()]);
      setNewTagInput('');
    }
  };

  const handleRemovePlayerTag = (indexToRemove) => {
    setGroupPlayers(groupPlayers.filter((_, idx) => idx !== indexToRemove));
  };

  if (!userRole) {
    return (
      <div className="p-6 bg-slate-900 rounded-2xl text-red-400 text-center border border-red-900/50">
        ⛔ Access Denied: You do not have permission to view squad analytics.
      </div>
    );
  }

  const avgSpeed = (
    students.reduce((acc, s) => acc + (s.top_speed || 0), 0) / (students.length || 1)
  ).toFixed(1);

  const avgTech = (
    students.reduce((acc, s) => acc + (s.technical_score || 0), 0) / (students.length || 1)
  ).toFixed(1);

  return (
    <div className="p-6 bg-slate-900 rounded-2xl text-white max-w-4xl mx-auto shadow-xl border border-slate-800">
      <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-xl font-black text-yellow-400 flex items-center gap-2">
            ⚽ Squad Analytics & Drill Planner
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Academy ID: <span className="text-slate-200 font-mono">{userAcademyId}</span> {userRole === 'admin' && <span className="text-amber-400 font-bold">(Super Admin View)</span>}
          </p>
        </div>
      </div>

      {/* Execution Mode & Player Tag Setup */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          ⚙️ Drill Dispatch Setup (Execution Mode)
        </h3>
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setExecutionMode('solo')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-colors ${
              executionMode === 'solo'
                ? 'bg-blue-600 text-white border border-blue-400'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            👤 Solo Tracking Mode
          </button>
          <button
            onClick={() => setExecutionMode('group')}
            className={`flex-1 py-2 px-4 rounded-lg font-bold text-xs transition-colors ${
              executionMode === 'group'
                ? 'bg-blue-600 text-white border border-blue-400'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            👥 Group / Squad Tracking Mode
          </button>
        </div>

        {executionMode === 'group' && (
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
            <span className="text-xs text-slate-400 font-semibold block mb-2">
              Active Squad Tags:
            </span>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Add player tag (e.g., Arin)"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPlayerTag())}
                className="flex-1 bg-slate-950 border border-slate-700 text-xs text-white px-3 py-1.5 rounded-md focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddPlayerTag}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-md"
              >
                + Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupPlayers.map((tag, idx) => (
                <span key={idx} className="bg-sky-900 text-sky-200 text-xs px-2.5 py-1 rounded-full border border-sky-700 flex items-center gap-1.5">
                  {tag}
                  <button
                    onClick={() => handleRemovePlayerTag(idx)}
                    className="hover:text-white font-bold text-sm leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live Active Drill Telemetry Stream Cards */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          🎯 Active Drill Stream Telemetry
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 p-3 rounded-lg text-center border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Sprint Accel</span>
            <p className="text-2xl font-black text-cyan-400">{sprintAccel} <span className="text-xs font-normal text-slate-400">km/h</span></p>
          </div>
          <div className="bg-slate-900 p-3 rounded-lg text-center border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Pass Accuracy</span>
            <p className="text-2xl font-black text-emerald-400">{passAccuracy}%</p>
          </div>
          <div className="bg-slate-900 p-3 rounded-lg text-center border border-slate-800">
            <span className="text-xs text-slate-400 block mb-1">Control Precision</span>
            <p className="text-2xl font-black text-amber-400">{controlPrecision}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400">Loading squad data...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400 font-bold uppercase block mb-1">
                Total Trainees
              </span>
              <p className="text-2xl font-black text-white">{students.length}</p>
            </div>

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400 font-bold uppercase block mb-1">
                Squad Avg Speed
              </span>
              <p className="text-2xl font-black text-emerald-400">{avgSpeed} <span className="text-xs text-slate-400 font-normal">km/h</span></p>
            </div>

            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <span className="text-xs text-slate-400 font-bold uppercase block mb-1">
                Squad Technical Avg
              </span>
              <p className="text-2xl font-black text-blue-400">{avgTech} <span className="text-xs text-slate-400 font-normal">/ 100</span></p>
            </div>
          </div>

          <div className="bg-indigo-950/60 border border-indigo-700/50 p-4 rounded-xl mb-6">
            <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-1">
              🎯 AI Recommended Drill Focus
            </h3>
            <p className="text-sm text-slate-200">
              {avgTech < 70 
                ? "Recommended Drill: 3-Player Passing & First-Touch Control in Tight Spaces (Squad Technical Score is below 70)."
                : "Recommended Drill: High-Intensity Transition & Sprint Recovery Drills (Squad Pace & Technique are optimal)."}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800 text-xs uppercase text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="p-3">Player Name</th>
                  <th className="p-3">OVR Rating</th>
                  <th className="p-3">Top Speed</th>
                  <th className="p-3">Tech Score</th>
                  <th className="p-3">Access Status</th>
                </tr>
              </thead>
              <tbody>
                {students.length > 0 ? (
                  students.map((student, idx) => (
                    <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-bold text-white">{student.name || `Player ${student.id}`}</td>
                      <td className="p-3 text-yellow-400 font-black">{student.ovr_rating || '-'}</td>
                      <td className="p-3">{student.top_speed ? `${student.top_speed} km/h` : '-'}</td>
                      <td className="p-3">{student.technical_score ? `${student.technical_score} / 100` : '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 text-xs rounded-full font-bold ${student.isPaid ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700' : 'bg-amber-900/80 text-amber-300 border border-amber-700'}`}>
                          {student.isPaid ? 'Paid Pro' : 'Free Trial'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-slate-500 italic">
                      No trainee data found for your academy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}