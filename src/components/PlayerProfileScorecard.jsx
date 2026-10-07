// src/components/PlayerProfileScorecard.jsx

import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useLocation, useParams } from "react-router-dom";
import { getStudentTrialStatus } from "../utils/trialManager";
import PaymentModal from "./PaymentModal";

// Firebase / Firestore
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/**
 * Convert a Firestore Timestamp or normal date value
 * into a readable date/time string.
 */
function formatFirestoreDate(timestamp) {
  if (!timestamp) {
    return "Date unavailable";
  }

  try {
    // Firestore Timestamp
    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().toLocaleString();
    }

    // JavaScript Date / ISO string
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString();
  } catch (error) {
    console.error("Failed to format Firestore date:", error);
    return "Date unavailable";
  }
}

export default function PlayerProfileScorecard({
  playerId: propPlayerId,
  studentData,
  user,
}) {
  const params = useParams();
  const location = useLocation();
  const playerId = propPlayerId || params.playerId || params.targetPlayerId;
  const { playerData: passedPlayerData, signedInPlayer, playDescription } = location.state || {};

  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);

  // Dynamic Live CV Telemetry State
  const [liveTelemetry, setLiveTelemetry] = useState(null);
  const [videoCropUrl, setVideoCropUrl] = useState(null);

  // Firestore historical drill logs
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  // ------------------------------------------------------------
  // Role Checks
  // ------------------------------------------------------------

  const isCoachOrAdmin =
    user?.role === "admin" || user?.role === "coach" || localStorage.getItem("userRole") === "admin" || (localStorage.getItem("jsports_user") || "").includes("admin");
  const isSelf =
    String(user?.id || "") === String(playerId || "") ||
    String(user?.name || "") === String(playerId || "");

  const canAccessTelemetryProof = isCoachOrAdmin || isSelf;

  // ------------------------------------------------------------
  // Active Student
  // ------------------------------------------------------------

  const activeStudent = studentData || passedPlayerData || {
    id: playerId,
    name: scorecard?.player_id || playerId,
    createdAt: scorecard?.created_at,
    sessions: scorecard?.session_history || [],
    isPaid: scorecard?.is_paid || false,
  };

  // ------------------------------------------------------------
  // Trial / Payment Status
  // ------------------------------------------------------------

  const trialStatus = getStudentTrialStatus(activeStudent);

  useEffect(() => {
    if (!trialStatus.hasAccess) {
      setShowPaywall(true);
    }
  }, [trialStatus.hasAccess]);

  // ------------------------------------------------------------
  // Fetch Main Player Scorecard From Backend
  // ------------------------------------------------------------

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch(
      `${API_BASE_URL}/api/v1/players/${encodeURIComponent(playerId)}/scorecard`
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Scorecard request failed: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setScorecard(data?.scorecard || null);
      })
      .catch((err) => {
        console.error("Failed to fetch player scorecard:", err);
        if (isMounted) {
          setScorecard(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [playerId]);

  // ------------------------------------------------------------
  // Firestore Real-Time Drill History Listener
  // ------------------------------------------------------------

  useEffect(() => {
    if (!playerId) {
      setHistoryLogs([]);
      setHistoryLoading(false);
      setHistoryError(null);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    const scorecardsRef = collection(db, "scorecards");
    const scorecardsQuery = query(
      scorecardsRef,
      where("playerId", "==", String(playerId)),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      scorecardsQuery,
      (snapshot) => {
        const logs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setHistoryLogs(logs);
        setHistoryLoading(false);
        setHistoryError(null);
      },
      (error) => {
        console.error("Firestore scorecard listener error:", error);
        setHistoryLogs([]);
        setHistoryLoading(false);

        if (error?.code === "failed-precondition") {
          setHistoryError(
            "Firestore needs a composite index for playerId and createdAt."
          );
        } else if (error?.code === "permission-denied") {
          setHistoryError(
            "You do not have permission to view drill history."
          );
        } else {
          setHistoryError(
            "Unable to load drill history right now."
          );
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [playerId]);

  // ------------------------------------------------------------
  // Socket.IO Live CV Telemetry
  // ------------------------------------------------------------

  useEffect(() => {
    if (!playerId) return;

    const socket = io(API_BASE_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    socket.connect();

    const handleTelemetry = (metrics) => {
      const matchesPlayer =
        metrics &&
        (String(metrics.player_id || "") === String(playerId) ||
          String(metrics.entity_id || "") === String(playerId) ||
          String(metrics.player || "") === String(playerId));

      if (isCoachOrAdmin || matchesPlayer) {
        setLiveTelemetry(metrics);

        if (metrics.video_crop || metrics.avatar_crop) {
          setVideoCropUrl(metrics.video_crop || metrics.avatar_crop);
        }
      }
    };

    socket.on("ui_telemetry_broadcast", handleTelemetry);

    return () => {
      socket.off("ui_telemetry_broadcast", handleTelemetry);
      socket.disconnect();
    };
  }, [playerId, isCoachOrAdmin]);

  // ------------------------------------------------------------
  // Loading State
  // ------------------------------------------------------------

  if (loading) {
    return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Loading scorecard...</div>;
  }

  // Fallback data mapping if backend scorecard is missing
  const playerName = activeStudent?.player_name || activeStudent?.name || scorecard?.player_name || playerId;
  const overallRating = activeStudent?.score ?? activeStudent?.metric ?? scorecard?.overall_rating ?? 88;
  const playerPosition = activeStudent?.position || scorecard?.position || "ST";
  const playerCountry = activeStudent?.country || scorecard?.country || "AR";
  
  // Extract dynamic parameters / attributes specific to this drill session
  const dynamicAttributes = activeStudent?.metrics || activeStudent?.attributes || scorecard?.attributes || {
    PAC: activeStudent?.pace || 90,
    SHO: activeStudent?.shooting || 93,
    PAS: activeStudent?.passing || 82,
    DRI: activeStudent?.dribbling || 89,
    DEF: activeStudent?.defending || 35,
    PHY: activeStudent?.physical || 78
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center">
      <div className="max-w-4xl w-full">

        {/* Signed-in Player Commentary / Description */}
        {playDescription && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-slate-300 text-sm shadow-lg">
            <h3 className="font-bold text-indigo-400 mb-1">
              Observation by {signedInPlayer || "Signed-in Player"}:
            </h3>
            <p>{playDescription}</p>
          </div>
        )}

        {/* FIFA Ultimate Team Card Style Container */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold tracking-wide text-white">Players ranked by Overall rating</h1>
            <p className="text-sm text-slate-400">Campus individual drill performance profile.</p>
          </div>

          {/* FUT Card */}
          <div className="relative w-72 h-[420px] bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 rounded-t-3xl rounded-b-xl p-6 text-slate-950 shadow-2xl border-4 border-amber-100 flex flex-col justify-between">
            
            {/* Top Stats & Badges */}
            <div className="flex justify-between items-start">
              <div className="flex flex-col items-center">
                <span className="text-3xl font-black tracking-tighter">{overallRating}</span>
                <span className="text-xs font-bold uppercase tracking-wider">{playerPosition}</span>
                <div className="mt-2 w-6 h-4 bg-blue-600 rounded-sm flex items-center justify-center text-[10px] text-white font-bold">
                  {playerCountry}
                </div>
              </div>

              {/* Player Avatar or Crop */}
              <div className="w-32 h-36 bg-slate-900/10 rounded-b-full overflow-hidden flex items-center justify-center border-b-2 border-slate-900">
                {videoCropUrl || activeStudent?.avatar ? (
                  <img src={videoCropUrl || activeStudent?.avatar} alt={playerName} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-4xl font-black text-slate-900">⚽</div>
                )}
              </div>
            </div>

            {/* Player Name */}
            <div className="text-center -mt-6">
              <div className="text-xl font-black uppercase tracking-wide border-b-2 border-slate-900/20 pb-1 inline-block px-4">
                {playerName}
              </div>
            </div>

            {/* Dynamic Drill Parameters / Attributes Grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm font-bold px-2">
              {Object.entries(dynamicAttributes).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-slate-800 uppercase tracking-widest text-xs">{key}</span>
                  <span className="text-slate-950">{value}</span>
                </div>
              ))}
            </div>

            {/* Additional Info Footer */}
            <div className="text-center text-[10px] uppercase font-bold tracking-widest text-slate-900 opacity-75 border-t border-slate-900/20 pt-2">
              ID: {scorecard?.player_id || playerId}
            </div>
          </div>
        </div>

        {/* Detailed Telemetry & History Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-4">Detailed Session History & Telemetry</h2>
          
          <div className="text-sm text-slate-400 mb-4">
            <span>Created: {formatFirestoreDate(scorecard?.created_at || activeStudent?.createdAt)}</span>
          </div>

          {liveTelemetry && (
            <div className="bg-slate-950 p-4 rounded-lg mb-4 border border-slate-800">
              <h4 className="text-xs font-bold text-indigo-400 mb-2 uppercase">Live Telemetry Stream</h4>
              <pre className="text-xs text-slate-300 overflow-x-auto">{JSON.stringify(liveTelemetry, null, 2)}</pre>
            </div>
          )}

          {historyLogs.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase">Firestore Drill Logs</h4>
              <div className="space-y-2">
                {historyLogs.map((log) => (
                  <div key={log.id} className="bg-slate-950 p-3 rounded border border-slate-800 text-xs flex justify-between">
                    <span>{log.drill_name || "Drill Session"}</span>
                    <span className="text-indigo-400 font-bold">{log.score || log.metric || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}