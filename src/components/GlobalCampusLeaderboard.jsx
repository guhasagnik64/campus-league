import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function GlobalCampusLeaderboard({ onSelectPlayer }) {
  const navigate = useNavigate();

  const [leaderboardFeed, setLeaderboardFeed] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [activeTab, setActiveTab] = useState("global");
  const [selectedGroup, setSelectedGroup] = useState("Group A");
  const [selectedDrillType, setSelectedDrillType] = useState("all");

  const [availableGroups, setAvailableGroups] = useState([
    "Group A",
    "Group B",
    "Group C",
    "default_group",
  ]);

  const [availableDrills, setAvailableDrills] = useState([]);

  /**
   * Handle clicking on a player.
   *
   * Admins and coaches can access any portfolio.
   * Players can only access their own portfolio.
   */
  const handlePlayerRowClick = (targetPlayerId) => {
    const activePlayerId = localStorage.getItem("activePlayerId");
    const userRole = localStorage.getItem("userRole");

    const canAccess =
      userRole === "admin" ||
      userRole === "coach" ||
      activePlayerId === String(targetPlayerId);

    if (canAccess) {
      navigate(`/portfolio/${targetPlayerId}`);
    } else {
      alert(
        "🔒 Access Denied: This athlete's performance room is private."
      );
    }
  };

  /**
   * Convert different backend response formats
   * into a consistent session structure.
   */
  const normalizePayloadToSessions = useCallback((rawPayload) => {
    if (!rawPayload) {
      return [];
    }

    // Already in session format:
    // [
    //   {
    //     drill_id,
    //     drill_name,
    //     date,
    //     players: []
    //   }
    // ]
    if (
      Array.isArray(rawPayload) &&
      rawPayload.length > 0 &&
      rawPayload[0]?.players
    ) {
      return rawPayload;
    }

    // Single session object
    if (
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      rawPayload.players
    ) {
      return [
        {
          drill_id: rawPayload.drill_id || rawPayload.drill_name || "drill_session",
          drill_name:
            rawPayload.drill_name || rawPayload.drill_id || "Training Session",
          date:
            rawPayload.date || new Date().toLocaleDateString(),
          players: rawPayload.players,
        },
      ];
    }

    // Simple player array
    if (Array.isArray(rawPayload)) {
      return [
        {
          drill_id: "drill_session",
          drill_name: "Active Campus Drill",
          date: "Today",
          players: rawPayload,
        },
      ];
    }

    return [];
  }, []);

  /**
   * Extract available groups and drills from leaderboard data.
   */
  const extractFilterOptions = useCallback((feed) => {
    const drillsSet = new Set();

    const groupsSet = new Set([
      "Group A",
      "Group B",
      "Group C",
      "default_group",
    ]);

    feed.forEach((session) => {
      if (session.drill_name || session.drill_id) {
        drillsSet.add(session.drill_name || session.drill_id);
      }

      (session.players || []).forEach((player) => {
        if (player.group_id) {
          groupsSet.add(player.group_id);
        }

        if (player.squad) {
          groupsSet.add(player.squad);
        }
      });
    });

    setAvailableDrills(Array.from(drillsSet));
    setAvailableGroups(Array.from(groupsSet));
  }, []);

  /**
   * Fetch leaderboard data from backend.
   */
  const fetchLeaderboard = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      }

      setIsRefreshing(true);

      try {
        let endpoint = `${API_BASE_URL}/api/leaderboard`;

        if (activeTab === "group") {
          endpoint += `?group_id=${encodeURIComponent(selectedGroup)}`;
        }

        const response = await fetch(endpoint);

        if (response.ok) {
          const data = await response.json();

          const rawContent =
            data.leaderboard ||
            data.leaderboardFeed ||
            data.analytics ||
            data;

          const normalizedFeed =
            normalizePayloadToSessions(rawContent);

          if (normalizedFeed.length > 0) {
            setLeaderboardFeed(normalizedFeed);
            extractFilterOptions(normalizedFeed);
            return;
          }
        }

        // Backend failed or returned empty data.
        // Try local cache as fallback.
        const cacheResponse = await fetch(
          "/coach_intel_cache.json"
        );

        if (cacheResponse.ok) {
          const cacheData = await cacheResponse.json();

          const fallbackFeed = normalizePayloadToSessions(
            cacheData.leaderboardFeed ||
              cacheData.rankings ||
              cacheData
          );

          setLeaderboardFeed(fallbackFeed);
          extractFilterOptions(fallbackFeed);
        } else {
          setLeaderboardFeed([]);
        }
      } catch (error) {
        console.error(
          "Error fetching leaderboard payload:",
          error
        );

        setLeaderboardFeed([]);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      activeTab,
      selectedGroup,
      normalizePayloadToSessions,
      extractFilterOptions,
    ]
  );

  /**
   * Fetch leaderboard whenever filters change.
   */
  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  /**
   * Filter the sessions and players.
   */
  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return leaderboardFeed
      .map((session) => {
        const sessionDrillName =
          session.drill_name ||
          session.drill_id ||
          "Completed Drill";

        // Drill filter
        const matchesDrillFilter =
          selectedDrillType === "all" ||
          sessionDrillName === selectedDrillType;

        if (!matchesDrillFilter) {
          return null;
        }

        // Player filtering
        const playersList = (session.players || []).filter(
          (player) => {
            const playerGroup =
              player.group_id ||
              player.squad ||
              "default_group";

            const matchesGroup =
              activeTab === "global" ||
              playerGroup === selectedGroup;

            const playerName =
              player.player_name ||
              player.name ||
              player.player_id ||
              player.id ||
              "";

            const matchesSearch =
              !normalizedSearch ||
              String(playerName)
                .toLowerCase()
                .includes(normalizedSearch) ||
              sessionDrillName
                .toLowerCase()
                .includes(normalizedSearch);

            return matchesGroup && matchesSearch;
          }
        );

        if (playersList.length === 0) {
          return null;
        }

        return {
          ...session,
          players: playersList,
        };
      })
      .filter(Boolean);
  }, [
    leaderboardFeed,
    searchTerm,
    activeTab,
    selectedGroup,
    selectedDrillType,
  ]);

  /**
   * Loading state.
   */
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center bg-slate-950 text-white rounded-2xl">
        <div className="text-center">
          <div className="text-4xl mb-4">🏆</div>

          <p className="text-slate-300 font-semibold">
            Loading leaderboard data...
          </p>

          <p className="text-slate-500 text-sm mt-2">
            Fetching verified campus performance statistics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              🏆 Campus League Leaderboard
            </h1>

            <p className="text-sm text-slate-400 mt-2">
              Public campus standings based on verified AI match
              statistics & bounding-box tracking.
            </p>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchLeaderboard(false)}
            disabled={isRefreshing}
            className="self-start md:self-auto bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>🔄</span>

            {isRefreshing
              ? "Updating..."
              : "Refresh Standings"}
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">

            {/* View Toggle */}
            <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 w-fit">
              <button
                type="button"
                onClick={() => setActiveTab("global")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "global"
                    ? "bg-yellow-400 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🌐 Overall Campus
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("group")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  activeTab === "group"
                    ? "bg-yellow-400 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                👥 Squad / Group
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">

              {/* Group Filter */}
              {activeTab === "group" && (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="group-select"
                    className="text-xs font-bold text-slate-400"
                  >
                    Squad:
                  </label>

                  <select
                    id="group-select"
                    value={selectedGroup}
                    onChange={(e) =>
                      setSelectedGroup(e.target.value)
                    }
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                  >
                    {availableGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Drill Filter */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="drill-select"
                  className="text-xs font-bold text-slate-400"
                >
                  Drill:
                </label>

                <select
                  id="drill-select"
                  value={selectedDrillType}
                  onChange={(e) =>
                    setSelectedDrillType(e.target.value)
                  }
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-yellow-400"
                >
                  <option value="all">
                    All Drills
                  </option>

                  {availableDrills.map((drill) => (
                    <option key={drill} value={drill}>
                      {drill}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) =>
              setSearchTerm(e.target.value)
            }
            placeholder="Search player or drill..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-yellow-400 transition-colors"
          />
        </div>

        {/* Leaderboard */}
        {filteredSessions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-4">
              🔍
            </div>

            <h2 className="text-lg font-bold text-white">
              No active sessions match the selected filter
            </h2>

            <p className="text-sm text-slate-500 mt-2">
              Try switching tabs or resetting your
              drill/squad search.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSelectedDrillType("all");
                setActiveTab("global");
              }}
              className="mt-5 px-4 py-2 rounded-lg bg-yellow-400 text-slate-950 text-xs font-bold hover:bg-yellow-300 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredSessions.map((session, sessionIndex) => {
              const drillName =
                session.drill_name ||
                session.drill_id ||
                "Completed Drill";

              return (
                <section
                  key={`${session.drill_id || drillName}-${sessionIndex}`}
                  className="space-y-3"
                >
                  {/* Session Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-1">
                    <div>
                      <h2 className="text-lg font-black text-white">
                        ⚡ {drillName}
                      </h2>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>
                        🤖 AI Vision:{" "}
                        <strong className="text-green-400">
                          99.4%
                        </strong>
                      </span>

                      <span>
                        📅 {session.date || "Today"}
                      </span>
                    </div>
                  </div>

                  {/* Players */}
                  <div className="space-y-3">
                    {session.players.map(
                      (player, playerIndex) => {
                        const displayRank =
                          Number(player.rank) ||
                          playerIndex + 1;

                        const isRank1 =
                          displayRank === 1;

                        const targetId =
                          player.player_id ||
                          player.id ||
                          `PLY-${playerIndex + 1}`;

                        const playerName =
                          player.player_name ||
                          player.name ||
                          player.player_id ||
                          "Player";

                        const speed =
                          player.top_speed ??
                          player.speed ??
                          player.sprint_accel ??
                          player.raw_speed ??
                          0;

                        const passAccuracy =
                          player.pass_acc ??
                          player.pass_accuracy ??
                          player.raw_pass_acc ??
                          "0%";

                        const ovr =
                          player.highest_ovr ??
                          player.ovr_score ??
                          player.ovr_rating ??
                          0;

                        return (
                          <div
                            key={`${targetId}-${playerIndex}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (onSelectPlayer) {
                                onSelectPlayer(player);
                              }

                              handlePlayerRowClick(
                                targetId
                              );
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" ||
                                event.key === " "
                              ) {
                                event.preventDefault();

                                if (onSelectPlayer) {
                                  onSelectPlayer(player);
                                }

                                handlePlayerRowClick(
                                  targetId
                                );
                              }
                            }}
                            className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 md:p-5 rounded-2xl transition-all duration-200 cursor-pointer ${
                              isRank1
                                ? "bg-gradient-to-r from-amber-500/20 via-orange-600/15 to-yellow-500/10 border-2 border-yellow-400 text-white shadow-xl shadow-orange-500/10 hover:border-yellow-300"
                                : "bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/60"
                            }`}
                          >
                            {/* Left Side */}
                            <div className="flex items-center gap-4 min-w-0">
                              {/* Rank */}
                              <div
                                className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-black ${
                                  isRank1
                                    ? "bg-yellow-400 text-slate-950"
                                    : "bg-slate-800 text-slate-300"
                                }`}
                              >
                                {displayRank}
                              </div>

                              {/* Player Details */}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-black text-base md:text-lg truncate">
                                    {playerName}
                                  </h3>

                                  {isRank1 && (
                                    <span className="px-2 py-1 rounded-md bg-yellow-400 text-slate-950 text-[10px] font-black uppercase tracking-wide">
                                      Top Performer
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                                  <span>
                                    ID: {targetId}
                                  </span>

                                  {(player.squad ||
                                    player.group_id) && (
                                    <>
                                      <span>•</span>

                                      <span>
                                        {player.squad ||
                                          player.group_id}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Side Stats */}
                            <div className="flex items-center gap-4 md:gap-6">
                              {/* Speed */}
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                  ⚡ Speed
                                </p>

                                <p className="font-black text-sm md:text-base text-white">
                                  {speed} km/h
                                </p>
                              </div>

                              {/* Pass Accuracy */}
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                  🎯 Pass Acc
                                </p>

                                <p className="font-black text-sm md:text-base text-white">
                                  {passAccuracy}
                                </p>
                              </div>

                              {/* OVR */}
                              <div className="text-right min-w-[60px]">
                                <p className="text-xl md:text-2xl font-black text-yellow-400">
                                  {ovr}
                                </p>

                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                                  OVR Rating
                                </p>
                              </div>

                              {/* Arrow */}
                              <div className="text-2xl text-slate-500">
                                ›
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}