import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";
import { AVAILABLE_DRILLS } from "../utils/drills";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

export default function GlobalCampusLeaderboard({
  onSelectPlayer,
}) {
  const navigate = useNavigate();

  const [leaderboardFeed, setLeaderboardFeed] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeTab, setActiveTab] = useState("global");
  const [selectedGroup, setSelectedGroup] = useState("Group A");
  const [selectedDrillType, setSelectedDrillType] =
    useState("all");

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

  // ------------------------------------------------------------
  // PLAYER ROW CLICK
  // ------------------------------------------------------------

  const handlePlayerRowClick = (
    targetPlayerId,
    playerData
  ) => {
    const activePlayerId = localStorage.getItem("activePlayerId");
    
    // Check multiple potential localStorage key/casing conventions
    const rawRole = 
      localStorage.getItem("userRole") || 
      localStorage.getItem("role") || 
      "";
    
    const userRole = rawRole.toLowerCase().trim();

    // Grant access to Admins, Coaches, or the athlete viewing their own profile
    const canAccess =
      userRole === "admin" ||
      userRole === "coach" ||
      String(activePlayerId) === String(targetPlayerId);

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
  // ------------------------------------------------------------
  // NORMALIZE LEADERBOARD PAYLOAD
  // ------------------------------------------------------------

  const normalizePayloadToSessions =
    useCallback(
      (rawPayload) => {
        if (!rawPayload) {
          return [];
        }

        // Already an array of sessions
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
              drill_id:
                rawPayload.drill_id ||
                rawPayload.drill_name ||
                "drill_session",

              drill_name:
                rawPayload.drill_name ||
                rawPayload.drill_id ||
                "Training Session",

              date:
                rawPayload.date ||
                todayDateStr,

              players:
                rawPayload.players,
            },
          ];
        }

        // Array of players
        if (Array.isArray(rawPayload)) {
          return [
            {
              drill_id:
                "drill_session",

              drill_name:
                "Active Campus Drill",

              date:
                todayDateStr,

              players:
                rawPayload,
            },
          ];
        }

        return [];
      },
      [todayDateStr]
    );

  // ------------------------------------------------------------
  // EXTRACT GROUP / DRILL FILTER OPTIONS
  // ------------------------------------------------------------

  const extractFilterOptions =
    useCallback((feed) => {
      const drillsSet = new Set();

      const groupsSet = new Set([
        "Group A",
        "Group B",
        "Group C",
        "default_group",
      ]);

      feed.forEach((session) => {
        if (
          session.drill_name ||
          session.drill_id
        ) {
          drillsSet.add(
            session.drill_name ||
              session.drill_id
          );
        }

        (
          session.players || []
        ).forEach((player) => {
          if (player.group_id) {
            groupsSet.add(
              player.group_id
            );
          }

          if (player.squad) {
            groupsSet.add(
              player.squad
            );
          }
        });
      });

      setAvailableDrills(
        Array.from(drillsSet)
      );

      setAvailableGroups(
        Array.from(groupsSet)
      );
    }, []);

  // ------------------------------------------------------------
  // FETCH LEADERBOARD
  // ------------------------------------------------------------

  const fetchLeaderboard =
    useCallback(
      async (showLoader = true) => {
        if (showLoader) {
          setLoading(true);
        }

        setIsRefreshing(true);

        try {
          let endpoint =
            `${API_BASE_URL}/api/leaderboard?date=` +
            encodeURIComponent(
              todayDateStr
            );

          if (activeTab === "group") {
            endpoint +=
              `&group_id=${encodeURIComponent(
                selectedGroup
              )}`;
          }

          const response =
            await fetch(endpoint);

          if (response.ok) {
            const data =
              await response.json();

            const rawContent =
              data.leaderboard ||
              data.leaderboardFeed ||
              data.analytics ||
              data;

            const normalizedFeed =
              normalizePayloadToSessions(
                rawContent
              );

            if (
              normalizedFeed.length > 0
            ) {
              setLeaderboardFeed(
                normalizedFeed
              );

              extractFilterOptions(
                normalizedFeed
              );

              return;
            }
          }

          // ----------------------------------------------------
          // FALLBACK CACHE
          // ----------------------------------------------------

          const cacheResponse =
            await fetch(
              "/coach_intel_cache.json"
            );

          if (cacheResponse.ok) {
            const cacheData =
              await cacheResponse.json();

            const fallbackFeed =
              normalizePayloadToSessions(
                cacheData.leaderboardFeed ||
                  cacheData.rankings ||
                  cacheData
              );

            setLeaderboardFeed(
              fallbackFeed
            );

            extractFilterOptions(
              fallbackFeed
            );
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

  // ------------------------------------------------------------
  // INITIAL LOAD
  // ------------------------------------------------------------

  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  // ------------------------------------------------------------
  // FILTER LEADERBOARD
  // ------------------------------------------------------------

  const filteredSessions =
    useMemo(() => {
      const normalizedSearch =
        searchTerm
          .trim()
          .toLowerCase();

      return leaderboardFeed
        .map((session) => {
          const sessionDrillName =
            session.drill_name ||
            session.drill_id ||
            "Completed Drill";

          const sessionDrillId =
            session.drill_id ||
            session.drill_name ||
            "";

          // --------------------------------------------------
          // DRILL FILTER
          // --------------------------------------------------

          const matchesDrillFilter =
            selectedDrillType === "all" ||
            sessionDrillName ===
              selectedDrillType ||
            sessionDrillId ===
              selectedDrillType;

          if (!matchesDrillFilter) {
            return null;
          }

          // --------------------------------------------------
          // PLAYER FILTER
          // --------------------------------------------------

          const playersList =
            (
              session.players || []
            ).filter((player) => {
              const playerGroup =
                player.group_id ||
                player.squad ||
                "default_group";

              const matchesGroup =
                activeTab === "global" ||
                playerGroup ===
                  selectedGroup;

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
                  .includes(
                    normalizedSearch
                  ) ||
                sessionDrillName
                  .toLowerCase()
                  .includes(
                    normalizedSearch
                  );

              return (
                matchesGroup &&
                matchesSearch
              );
            });

          if (
            playersList.length === 0
          ) {
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

  // ------------------------------------------------------------
  // LOADING STATE
  // ------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-semibold">
            Loading Campus Leaderboard...
          </div>

          <div className="text-sm text-slate-500 mt-2">
            Loading real-time performance metrics
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------
  // MAIN UI
  // ------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-7xl mx-auto">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">

          <div>
            <h1 className="text-2xl font-bold text-white">
              Campus Leaderboard
            </h1>

            <p className="text-sm text-slate-400 mt-1">
              Real-time performance metrics and
              session rankings
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">

            {/* SEARCH */}

            <input
              type="text"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(
                  e.target.value
                )
              }
              placeholder="Search athlete or drill..."
              className="bg-slate-900 border border-slate-800 text-sm rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />

            {/* REFRESH */}

            <button
              type="button"
              onClick={() =>
                fetchLeaderboard(false)
              }
              disabled={isRefreshing}
              className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </div>

        {/* ======================================================
            TABS
        ====================================================== */}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 mb-6 flex flex-wrap gap-2">

          <button
            type="button"
            onClick={() =>
              setActiveTab("global")
            }
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              activeTab === "global"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Global Rankings
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveTab("group")
            }
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
              activeTab === "group"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Group Filter
          </button>
        </div>

        {/* ======================================================
            FILTERS
        ====================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

          {/* GROUP FILTER */}

          {activeTab === "group" && (
            <label className="block">
              <span className="block text-xs font-bold text-slate-400 mb-2">
                Squad
              </span>

              <select
                value={selectedGroup}
                onChange={(e) =>
                  setSelectedGroup(
                    e.target.value
                  )
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
              >
                {availableGroups.map(
                  (group) => (
                    <option
                      key={group}
                      value={group}
                    >
                      {group}
                    </option>
                  )
                )}
              </select>
            </label>
          )}

          {/* DRILL FILTER */}

          <label className="block">
            <span className="block text-xs font-bold text-slate-400 mb-2">
              Drill
            </span>

            <select
              value={selectedDrillType}
              onChange={(e) =>
                setSelectedDrillType(
                  e.target.value
                )
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="all">
                All Drills
              </option>

              {AVAILABLE_DRILLS.map(
                (drill) => (
                  <option
                    key={drill.id}
                    value={drill.name}
                  >
                    {drill.label}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        {/* ======================================================
            LEADERBOARD FEED
        ====================================================== */}

        {filteredSessions.length ===
        0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
            <div className="text-slate-300 font-medium">
              No performance records found
              matching your active filters.
            </div>

            <div className="text-sm text-slate-500 mt-2">
              Try changing the drill, group,
              or search filter.
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {filteredSessions.map(
              (session, sIdx) => {
                const sortedPlayers =
                  [...session.players].sort(
                    (a, b) =>
                      (
                        b.score ??
                        b.metric ??
                        b.performance ??
                        0
                      ) -
                      (
                        a.score ??
                        a.metric ??
                        a.performance ??
                        0
                      )
                  );

                return (
                  <div
                    key={
                      session.drill_id ||
                      session.drill_name ||
                      `session-${sIdx}`
                    }
                    className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                  >

                    {/* SESSION HEADER */}

                    <div className="px-5 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">

                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          {session.drill_name ||
                            session.drill_id ||
                            "Completed Drill"}
                        </h2>

                        <p className="text-sm text-slate-500 mt-1">
                          Session Date:{" "}
                          {session.date ||
                            todayDateStr}
                        </p>
                      </div>

                      <div className="text-sm text-slate-400">
                        {
                          session.players
                            .length
                        }{" "}
                        Athletes Ranked
                      </div>
                    </div>

                    {/* TABLE */}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">

                        <thead>
                          <tr className="border-b border-slate-800 text-left text-slate-500">

                            <th className="px-5 py-3 font-medium">
                              Rank
                            </th>

                            <th className="px-5 py-3 font-medium">
                              Athlete
                            </th>

                            <th className="px-5 py-3 font-medium">
                              Group
                            </th>

                            <th className="px-5 py-3 font-medium">
                              Score / Metric
                            </th>

                          </tr>
                        </thead>

                        <tbody>
                          {sortedPlayers.map(
                            (
                              player,
                              pIdx
                            ) => {
                              const playerId =
                                player.player_id ||
                                player.id;

                              const playerName =
                                player.player_name ||
                                player.name ||
                                "Unknown Athlete";

                              const playerGroup =
                                player.group_id ||
                                player.squad ||
                                "default_group";

                              const playerScore =
                                player.score ??
                                player.metric ??
                                player.performance ??
                                0;

                              return (
                                <tr
                                  key={
                                    playerId ||
                                    `${sIdx}-${pIdx}`
                                  }
                                  onClick={() =>
                                    handlePlayerRowClick(
                                      playerId,
                                      player
                                    )
                                  }
                                  className="border-b border-slate-800/70 hover:bg-slate-800/50 cursor-pointer transition"
                                >

                                  <td className="px-5 py-4 text-slate-400 font-medium">
                                    #{pIdx + 1}
                                  </td>

                                  <td className="px-5 py-4">
                                    <div className="font-medium text-white">
                                      {playerName}
                                    </div>

                                    {playerId && (
                                      <div className="text-xs text-slate-500 mt-1">
                                        ID:{" "}
                                        {playerId}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-5 py-4 text-slate-400">
                                    {playerGroup}
                                  </td>

                                  <td className="px-5 py-4">
                                    <span className="font-semibold text-white">
                                      {playerScore}
                                    </span>
                                  </td>

                                </tr>
                              );
                            }
                          )}
                        </tbody>

                      </table>
                    </div>
                  </div>
                );
              }
            )}

          </div>
        )}
      </div>
    </div>
  );
}