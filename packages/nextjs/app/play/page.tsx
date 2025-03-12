"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import UsernameModal from "~~/components/UsernameModal";
import dynamicImport from "next/dynamic";
import ReplayListModal from "~~/components/ReplayListModal";

// Dynamically import MonadRunner with a loading state
const MonadRunnerNoSSR = dynamicImport(() => import("~~/components/MonadRunner"), {
  ssr: false,
  loading: () => (
    <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex items-center justify-center">
      <span className="loading loading-spinner loading-lg text-primary"></span>
    </div>
  ),
  // Add this to force client-side rendering

});

// Dynamically import Replay component
const ReplayComponent = dynamicImport(() => import("~~/components/Replay"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center items-center w-full h-full min-h-[200px]">
      <div className="loading loading-spinner loading-lg text-secondary"></div>
    </div>
  ),
});

interface LeaderboardPlayer {
  rank: number;
  walletAddress: string;
  username?: string;
  highScore: number;
}

interface UserStats {
  walletAddress: string;
  username?: string;
  highScore: number;
  timesPlayed: number;
  rank: number;
}

interface ReplayData {
  walletAddress: string;
  username?: string;
  score: number;
  replayData: any[];
  playedAt: string;
}

const Play: NextPage = () => {
  // Always call hooks in the same order
  const { address: connectedAddress } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardPlayer[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);
  const [recentGames, setRecentGames] = useState<{ time: string; score: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReplay, setSelectedReplay] = useState<ReplayData | null>(null);

  // Set mounted flag once on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load leaderboard data
  useEffect(() => {
    if (!mounted) return;

    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/game/leaderboard?limit=10");
        const data = await res.json();
        if (res.ok && data?.data?.leaderboard) {
          setLeaderboardData(data.data.leaderboard);
        } else {
          console.error("Error fetching leaderboard:", data.error);
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoadingLeaderboard(false);
      }
    }
    fetchLeaderboard();
  }, [mounted]);

  // Load user stats if connected
  useEffect(() => {
    if (!mounted || !connectedAddress) {
      setIsLoading(false);
      return;
    }

    async function fetchUserStats() {
      setLoadingUserStats(true);
      try {
        const res = await fetch(`/api/game/user/${connectedAddress}/stats`);
        const data = await res.json();
        if (res.ok && data?.data?.user) {
          setUserStats(data.data.user);
        } else if (res.status === 404) {
          console.log("New user - no stats yet");
        } else {
          console.error("Error fetching user stats:", data.error);
        }
      } catch (error) {
        console.error("Error fetching user stats:", error);
      } finally {
        setLoadingUserStats(false);
      }
    }
    fetchUserStats();
  }, [mounted, connectedAddress]);

  useEffect(() => {
    if (!loadingLeaderboard && !loadingUserStats) {
      setIsLoading(false);
    }
  }, [loadingLeaderboard, loadingUserStats]);

  const handleStartGame = async () => {
    if (!connectedAddress) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/game/user/${connectedAddress}/stats`);
      const data = await res.json();
      if (res.ok && data?.data?.user?.username) {
        setGameStarted(true);
      } else {
        setShowUsernameModal(true);
      }
    } catch (error) {
      console.error("Error checking username:", error);
      setGameStarted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGameEnd = async (score: number) => {
    if (!connectedAddress) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/game/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          score,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecentGames((prevGames) => {
          const newGames = [{ time: "just now", score }, ...prevGames.slice(0, 4)];
          return newGames;
        });
        const statsRes = await fetch(`/api/game/user/${connectedAddress}/stats`);
        const statsData = await statsRes.json();
        if (statsRes.ok && statsData?.data?.user) {
          setUserStats(statsData.data.user);
        }
        if (data?.data?.isHighScore) {
          const leaderboardRes = await fetch("/api/game/leaderboard?limit=10");
          const leaderboardData = await leaderboardRes.json();
          if (leaderboardRes.ok && leaderboardData?.data?.leaderboard) {
            setLeaderboardData(leaderboardData.data.leaderboard);
          }
        }
      }
    } catch (error) {
      console.error("Error submitting score:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameComplete = () => {
    setShowUsernameModal(false);
    setIsLoading(true);
    if (connectedAddress) {
      fetch(`/api/game/user/${connectedAddress}/stats`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.data?.user) {
            setUserStats(data.data.user);
          }
          setGameStarted(true);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Error refreshing user stats:", error);
          setGameStarted(true);
          setIsLoading(false);
        });
    } else {
      setGameStarted(true);
      setIsLoading(false);
    }
  };

  const handleSelectReplay = (replay: ReplayData) => {
    console.log("Selected replay:", replay);
    setSelectedReplay(replay);
    setShowReplayModal(false);
  };

  const handleReplayClose = () => {
    setSelectedReplay(null);
    setShowReplayModal(true);
  };

  // Prevent rendering before client-side mounting
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-col flex-grow pt-10 pb-16">
      {connectedAddress ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 w-full max-w-6xl px-4">
          {/* Game area */}
          <div className="lg:col-span-3 glass backdrop-blur-md p-6 rounded-xl border border-base-300">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-secondary">Monad Runner</h2>
              <div className="glass p-2 rounded-lg">
                <Address address={connectedAddress} />
              </div>
            </div>

            {isLoading && !gameStarted && !selectedReplay ? (
              <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex items-center justify-center">
                <span className="loading loading-spinner loading-lg text-secondary"></span>
              </div>
            ) : selectedReplay ? (
              <div className="relative">
            <ReplayComponent
  replayData={selectedReplay.replayData}
  onScoreUpdate={(score: number) => console.log("Replay score update:", score)}
  onClose={handleReplayClose}
/>
                <div className="text-center mt-6">
                  <p className="text-sm opacity-80">
                    Replay of {selectedReplay.username || selectedReplay.walletAddress}'s run 
                    with score: {selectedReplay.score}
                  </p>
                </div>
              </div>
            ) : gameStarted ? (
              <MonadRunnerNoSSR
                walletAddress={connectedAddress}
                username={userStats?.username || "Player"}
                onGameEnd={handleGameEnd}
                onClose={() => setGameStarted(false)}
              />
            ) : (
              <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex flex-col items-center justify-center">
                <div className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
                  Monad Runner
                </div>
                <p className="mb-8 max-w-md text-center text-base-content/80">
                  Navigate through the digital realm, avoid obstacles, and collect tokens to top the leaderboard!
                </p>
                <button
                  onClick={handleStartGame}
                  className="btn btn-secondary btn-lg shadow-neon hover:animate-glow"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Loading...
                    </>
                  ) : (
                    "Start Game"
                  )}
                </button>
              </div>
            )}

            {/* Replay buttons */}
            <div className="text-center mt-6 flex justify-center gap-4">
              <button
                className="btn btn-outline btn-secondary btn-sm"
                onClick={() => {
                  setSelectedReplay(null);
                  setShowReplayModal(true);
                  localStorage.setItem("replayFilter", connectedAddress ? "user" : "all");
                }}
              >
                View Games
              </button>
            </div>
          </div>

          {/* Leaderboard and Stats Section */}
          <div className="glass backdrop-blur-md p-6 rounded-xl border border-base-300">
            <div className="mb-6">
              <div className="stat bg-base-100/30 rounded-lg">
                <div className="stat-title">Your Best</div>
                {loadingUserStats ? (
                  <div className="stat-value text-primary">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : (
                  <div className="stat-value text-primary">{userStats?.highScore || 0}</div>
                )}
                <div className="stat-desc">Score</div>
              </div>
              <div className="stat bg-base-100/30 rounded-lg mt-4">
                <div className="stat-title">Global</div>
                {loadingLeaderboard ? (
                  <div className="stat-value text-secondary">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : (
                  <div className="stat-value text-secondary">
                    {leaderboardData.length > 0 ? leaderboardData[0].highScore : 0}
                  </div>
                )}
                <div className="stat-desc">High Score</div>
              </div>
              <div className="stat bg-base-100/30 rounded-lg mt-4">
                <div className="stat-title">Your Rank</div>
                {loadingUserStats ? (
                  <div className="stat-value text-accent">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : (
                  <div className="stat-value text-accent">{userStats?.rank || "-"}</div>
                )}
                <div className="stat-desc">
                  {userStats?.rank ? `Rank ${userStats.rank}` : "Not Ranked"}
                </div>
              </div>
            </div>

            <div className="divider">Recent Games</div>

            <div className="space-y-2 mb-6">
              {recentGames.length > 0 ? (
                recentGames.map((game, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 text-sm rounded bg-base-100/20"
                  >
                    <span className="text-xs opacity-70">{game.time}</span>
                    <span className="font-mono font-bold">{game.score}</span>
                  </div>
                ))
              ) : (
                [...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 text-sm rounded bg-base-100/20 opacity-50"
                  >
                    <span className="text-xs opacity-70">No games yet</span>
                    <span className="font-mono font-bold">0</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-md glass backdrop-blur-md p-8 text-center rounded-xl border border-base-300 mt-12">
          <h2 className="text-2xl font-bold mb-4">Connect to Play</h2>
          <p className="mb-6 opacity-80">
            You need to connect your wallet to access the game and compete on the leaderboard.
          </p>
          <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center animate-pulse mx-auto">
            <div className="w-10 h-10 rounded-full bg-secondary/40"></div>
          </div>
        </div>
      )}{/* Username Modal */}
      {showUsernameModal && connectedAddress && (
        <UsernameModal
          walletAddress={connectedAddress}
          onComplete={handleUsernameComplete}
          onCancel={() => setShowUsernameModal(false)}
        />
      )}

      {/* Global loading overlay */}
      {isLoading && gameStarted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-xl shadow-xl flex flex-col items-center">
            <div className="loading loading-spinner loading-lg text-secondary mb-4"></div>
            <p className="text-lg font-medium">Loading game data...</p>
          </div>
        </div>
      )}

      {/* Replay List Modal */}
      {showReplayModal && connectedAddress && (
        <ReplayListModal
          walletAddress={connectedAddress}
          onClose={() => setShowReplayModal(false)}
          onSelectReplay={handleSelectReplay}
        />
      )}
    </div>
  );
};

export default Play;