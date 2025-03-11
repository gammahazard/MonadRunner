"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import UsernameModal from "~~/components/UsernameModal";
import dynamic from "next/dynamic";

const MonadRunnerNoSSR = dynamic(
  () => import("~~/components/MonadRunner"),
  { ssr: false }
);
interface LeaderboardPlayer {
  rank: number;
  walletAddress: string;
  username?: string; // optional, may not be set
  highScore: number;
}

interface UserStats {
  walletAddress: string;
  username?: string;
  highScore: number;
  timesPlayed: number;
  rank: number;
}

const Play: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [gameStarted, setGameStarted] = useState(false);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardPlayer[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);
  const [recentGames, setRecentGames] = useState<{ time: string; score: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load leaderboard data
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/game/leaderboard?limit=10");
        const data = await res.json();
        if (res.ok && data && data.data && data.data.leaderboard) {
          setLeaderboardData(data.data.leaderboard);
        } else {
          console.error("Error fetching leaderboard:", data.error);
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoadingLeaderboard(false);
        checkIfAllLoaded();
      }
    }
    fetchLeaderboard();
  }, []);

  // Load user stats if connected
  useEffect(() => {
    async function fetchUserStats() {
      if (!connectedAddress) {
        setIsLoading(false);
        return;
      }
      
      setLoadingUserStats(true);
      try {
        const res = await fetch(`/api/game/user/${connectedAddress}/stats`);
        const data = await res.json();
        if (res.ok && data && data.data && data.data.user) {
          setUserStats(data.data.user);
        } else if (res.status === 404) {
          // User not found - might be first time connecting
          console.log("New user - no stats yet");
        } else {
          console.error("Error fetching user stats:", data.error);
        }
      } catch (error) {
        console.error("Error fetching user stats:", error);
      } finally {
        setLoadingUserStats(false);
        checkIfAllLoaded();
      }
    }
    fetchUserStats();
  }, [connectedAddress]);

  // Helper function to check if all data has loaded
  const checkIfAllLoaded = () => {
    if (!loadingLeaderboard && !loadingUserStats) {
      setIsLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!connectedAddress) return;
    
    setIsLoading(true);
    
    // Check if user has a username
    try {
      const res = await fetch(`/api/game/user/${connectedAddress}/stats`);
      const data = await res.json();
      
      if (res.ok && data?.data?.user?.username) {
        // User has a username, start the game
        setGameStarted(true);
      } else {
        // User needs to set a username first
        setShowUsernameModal(true);
      }
    } catch (error) {
      console.error("Error checking username:", error);
      // In case of error, try to start the game anyway
      setGameStarted(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGameEnd = async (score: number) => {
    if (!connectedAddress) return;
    
    setIsLoading(true);
    
    try {
      // Submit the score
      const res = await fetch("/api/game/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          score,
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        // Update recent games
        setRecentGames(prevGames => {
          const newGames = [
            { time: "just now", score },
            ...prevGames.slice(0, 4) // Keep only the 5 most recent
          ];
          return newGames;
        });
        
        // Refresh user stats
        const statsRes = await fetch(`/api/game/user/${connectedAddress}/stats`);
        const statsData = await statsRes.json();
        
        if (statsRes.ok && statsData?.data?.user) {
          setUserStats(statsData.data.user);
        }
        
        // Refresh leaderboard if score was high
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
    
    // Refresh user stats
    if (connectedAddress) {
      fetch(`/api/game/user/${connectedAddress}/stats`)
        .then(res => res.json())
        .then(data => {
          if (data?.data?.user) {
            setUserStats(data.data.user);
          }
          setGameStarted(true);
          setIsLoading(false);
        })
        .catch(error => {
          console.error("Error refreshing user stats:", error);
          setGameStarted(true);
          setIsLoading(false);
        });
    } else {
      setGameStarted(true);
      setIsLoading(false);
    }
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <div className="flex justify-center items-center w-full h-full min-h-[200px]">
      <div className="loading loading-spinner loading-lg text-secondary"></div>
    </div>
  );

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

            {isLoading && !gameStarted ? (
              <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex items-center justify-center">
                <LoadingSpinner />
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

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="stat bg-base-100/30 rounded-lg">
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

              <div className="stat bg-base-100/30 rounded-lg">
                <div className="stat-title">Your Rank</div>
                {loadingUserStats ? (
                  <div className="stat-value text-accent">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : (
                  <div className="stat-value text-accent">
                    {userStats?.rank || "-"}
                  </div>
                )}
                <div className="stat-desc">
                  {userStats?.rank ? `Rank ${userStats.rank}` : "Not Ranked"}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-bold mb-4">How to Play</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card bg-base-100/30">
                  <div className="card-body p-4">
                    <h4 className="card-title text-base text-primary">Controls</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 opacity-80">
                      <li>Move left - A</li>
                      <li>Move Right - B</li>
                      <li>Jump - W</li>
                      <li>End Jump Early - S</li>
                    </ul>
                  </div>
                </div>

                <div className="card bg-base-100/30">
                  <div className="card-body p-4">
                    <h4 className="card-title text-base text-secondary">Objective</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 opacity-80">
                      <li>Navigate through obstacles</li>
                      <li>Collect tokens for extra points</li>
                      <li>Survive as long as possible</li>
                    </ul>
                  </div>
                </div>

                <div className="card bg-base-100/30">
                  <div className="card-body p-4">
                    <h4 className="card-title text-base text-accent">Scoring</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 opacity-80">
                      <li>+1 point for each second</li>
                      <li>+5 points per token collected</li>
                      <li>Scores saved on-chain</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="glass backdrop-blur-md p-6 rounded-xl border border-base-300">
            <h2 className="text-2xl font-bold mb-6 text-center text-accent">Leaderboard</h2>

            {loadingLeaderboard ? (
              <div className="flex justify-center items-center p-8">
                <div className="loading loading-spinner loading-md text-accent"></div>
              </div>
            ) : leaderboardData.length ? (
              <div className="space-y-3 mb-6">
                {leaderboardData.map((player, index) => (
                  <div 
                    key={player.walletAddress} 
                    className={`flex items-center justify-between p-3 rounded-lg bg-base-100/30 ${
                      player.walletAddress === connectedAddress ? "border border-secondary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        index === 0 ? "bg-yellow-500" : 
                        index === 1 ? "bg-gray-300" : 
                        index === 2 ? "bg-amber-700" : "bg-base-300"
                      } text-base-100`}>
                        {index + 1}
                      </div>
                      <div className="text-sm truncate w-20">
                        {player.username ? player.username : player.walletAddress.substring(0, 6) + "..."}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-secondary">{player.highScore}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center">No leaderboard data available.</p>
            )}

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

            <div className="text-center">
              <button 
                className="btn btn-outline btn-secondary btn-sm"
                onClick={() => setGameStarted(false)}
              >
                View All Games
              </button>
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
      )}

      {/* Username Modal */}
      {showUsernameModal && connectedAddress && (
        <UsernameModal
          walletAddress={connectedAddress}
          onComplete={handleUsernameComplete}
          onCancel={() => setShowUsernameModal(false)}
        />
      )}

      {/* Global loading overlay for major operations */}
      {isLoading && gameStarted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-base-100 p-6 rounded-xl shadow-xl flex flex-col items-center">
            <div className="loading loading-spinner loading-lg text-secondary mb-4"></div>
            <p className="text-lg font-medium">Loading game data...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Play;