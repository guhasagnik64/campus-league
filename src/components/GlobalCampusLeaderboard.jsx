import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function GlobalCampusLeaderboard({ onSelectPlayer }) {
  const navigate = useNavigate();

  const [leaderboardFeed, setLeaderboardFeed] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState("global");
  const [selectedGroup, setSelectedGroup] = useState("Group A");
  const [selectedDrillType, setSelectedDrillType] = useState("all");

  const todayDateStr = useMemo(
    () => new Date().toISOString().split("T")[0],
    []
  );

  const [availableGroups, setAvailableGroups] = useState([
    "Group A",
    "Group B",
    "Group C",
    "default_group",
  ]);

  const [availableDrills, setAvailableDrills] = useState([]);

  const handlePlayerRowClick = (targetPlayerId, playerData) => {
    const activePlayerId = localStorage.getItem("activePlayerId");
    const userRole = localStorage.getItem("userRole");

    const canAccess =
      userRole === "admin" ||
      userRole === "coach" ||
      activePlayerId === String(targetPlayerId);

    if (!canAccess) {
      alert(
        "🔒 Access Denied: This athlete's performance room is private."
      );
      return;
    }

    if (onSelectPlayer) {
      onSelectPlayer(playerData);
    }

    navigate(`/portfolio/${targetPlayerId}`);
  };

  const normalizePayloadToSessions = useCallback(
    (rawPayload) => {
      if (!rawPayload) {
        return [];
      }

      if (
        Array.isArray(rawPayload) &&
        rawPayload.length > 0 &&
        rawPayload[0]?.players
      ) {
        return rawPayload;
      }

      if (
        typeof rawPayload === "object" &&
        !Array.isArray(rawPayload) &&
        rawPayload.players
      ) {
        return [
          {
            drill_id:
              rawPayload.drill_id ||
              rawPayload.drill_name ||
              "drill_session",
            drill_name:
              rawPayload.drill_name ||
              rawPayload.drill_id ||
              "Training Session",
            date: rawPayload.date || todayDateStr,
            players: rawPayload.players,
          },
        ];
      }

      if (Array.isArray(rawPayload)) {
        return [
          {
            drill_id: "drill_session",
            drill_name: "Active Campus Drill",
            date: todayDateStr,
            players: rawPayload,
          },
        ];
      }

      return [];
    },
    [todayDateStr]
  );

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

  const fetchLeaderboard = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setLoading(true);
      }

      setIsRefreshing(true);

      try {
        let endpoint = `${API_BASE_URL}/api/leaderboard?date=${encodeURIComponent(
          todayDateStr
        )}`;

        if (activeTab === "group") {
          endpoint += `&group_id=${encodeURIComponent(selectedGroup)}`;
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
      todayDateStr,
      normalizePayloadToSessions,
      extractFilterOptions,
    ]
  );

  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return leaderboardFeed
      .map((session) => {
        const sessionDrillName =
          session.drill_name ||
          session.drill_id ||
          "Completed Drill";

        const matchesDrillFilter =
          selectedDrillType === "all" ||
          sessionDrillName === selectedDrillType;

        if (!matchesDrillFilter) {
          return null;
        }

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

  if (loading) {
    return (
      <div className="min-h-[300px] flex flex-col items-center justify-center text-center bg-slate-950 text-white rounded-2xl p-8">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-xl font-bold">
          Loading 24-hr daily standings...
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Fetching verified campus performance statistics for{" "}
          {todayDateStr}.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white p-4 md:p-6 rounded-2xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black">
            🏆 Campus League Leaderboard
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            📅 24-hr Cycle:{" "}
            <span className="text-yellow-400 font-bold">
              {todayDateStr}
            </span>
          </p>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Public campus standings based on verified AI match
            statistics and bounding-box tracking. Resets daily.
            Click any player name to review component markings and
            match reports.
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
          {isRefreshing ? "Updating..." : "Refresh Standings"}
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 mb-6">
        {/* View Toggle */}
        <div className="flex flex-wrap gap-2 mb-4">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Group Filter */}
          {activeTab === "group" && (
            <label className="block">
              <span className="block text-xs font-bold text-slate-400 mb-2">
                Squad:
              </span>

              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-yellow-400"
              >
                {availableGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Drill Filter */}
          <label className="block">
            <span className="block text-xs font-bold text-slate-400 mb-2">
              Drill:
            </span>

            <select
              value={selectedDrillType}
              onChange={(e) =>
                setSelectedDrillType(e.target.value)
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-yellow-400"
            >
              <option value="all">All Drills</option>

              {availableDrills.map((drill) => (
                <option key={drill} value={drill}>
                  {drill}
                </option>
              ))}
            </select>
          </label>

          {/* Search */}
          <label className="block">
            <span className="block text-xs font-bold text-slate-400 mb-2">
              Search:
            </span>

            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search player or drill..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-yellow-400 transition-colors"
            />
          </label>
        </div>
      </div>

      {/* Leaderboard */}
      {filteredSessions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>

          <h2 className="text-lg font-bold">
            No active sessions match the selected filter
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Try switching tabs or resetting your drill/squad
            search.
          </p>

          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSelectedDrillType("all");
              setActiveTab("global");
              setSelectedGroup("Group A");
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
                key={
                  session.drill_id ||
                  `${drillName}-${session.date || sessionIndex}`
                }
                className="bg-slate-950 border border-slate-800 rounded-2xl p-4 md:p-6"
              >
                {/* Session Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-lg md:text-xl font-black">
                      ⚡ {drillName}
                    </h2>

                    <p className="mt-1 text-xs text-slate-400">
                      📅 {session.date || todayDateStr}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold">
                    🤖 AI Vision:
                    <span className="text-yellow-400">
                      99.4%
                    </span>
                  </div>
                </div>

                {/* Players */}
                <div className="space-y-3">
                  {session.players.map(
                    (player, playerIndex) => {
                      const displayRank =
                        Number(player.rank) || playerIndex + 1;

                      const isRank1 = displayRank === 1;

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

                      const handleSelect = () => {
                        handlePlayerRowClick(
                          targetId,
                          player
                        );
                      };

                      return (
                        <div
                          key={`${targetId}-${playerIndex}`}
                          role="button"
                          tabIndex={0}
                          onClick={handleSelect}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              handleSelect();
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
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black shrink-0 ${
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
                                <h3 className="text-base md:text-lg font-black truncate">
                                  {playerName}
                                </h3>

                                {isRank1 && (
                                  <span className="px-2 py-1 rounded-md bg-yellow-400 text-slate-950 text-[10px] font-black uppercase">
                                    Top Performer
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span>ID: {targetId}</span>

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
                          <div className="flex flex-wrap items-center gap-3 md:gap-5">
                            {/* Speed */}
                            <div className="min-w-[90px]">
                              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                                ⚡ Speed
                              </div>
                              <div className="mt-1 font-black">
                                {speed} km/h
                              </div>
                            </div>

                            {/* Pass Accuracy */}
                            <div className="min-w-[100px]">
                              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                                🎯 Pass Acc
                              </div>
                              <div className="mt-1 font-black">
                                {passAccuracy}
                              </div>
                            </div>

                            {/* OVR */}
                            <div className="min-w-[80px]">
                              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
                                OVR Rating
                              </div>
                              <div className="mt-1 text-xl font-black text-yellow-400">
                                {ovr}
                              </div>
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
  );
}
