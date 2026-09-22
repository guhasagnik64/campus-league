// src/components/PlayerProfileScorecard.jsx

import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
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
  playerId,
  studentData,
  user,
}) {
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
    user?.role === "admin" || user?.role === "coach";

  const isSelf =
    String(user?.id || "") === String(playerId || "") ||
    String(user?.name || "") === String(playerId || "");

  const canAccessTelemetryProof = isCoachOrAdmin || isSelf;

  // ------------------------------------------------------------
  // Active Student
  // ------------------------------------------------------------

  const activeStudent = studentData || {
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
    return <div className="player-profile-scorecard loading">Loading scorecard...</div>;
  }

  if (!scorecard) {
    return <div className="player-profile-scorecard empty">Scorecard unavailable.</div>;
  }

  return (
    <section className="player-profile-scorecard">
      <div className="scorecard-header">
        <h2>{activeStudent?.name || "Player Profile"}</h2>
      </div>

      <div className="scorecard-body">
        <div className="scorecard-meta">
          <span>Player ID: {scorecard?.player_id || playerId}</span>
          <span>Created: {formatFirestoreDate(scorecard?.created_at)}</span>
        </div>

        {liveTelemetry && (
          <div className="telemetry-card">
            <pre>{JSON.stringify(liveTelemetry, null, 2)}</pre>
          </div>
        )}

        {videoCropUrl && (
          <div className="video-crop-card">
            <img src={videoCropUrl} alt="Video crop" />
          </div>
        )}
      </div>
    </section>
  );
}