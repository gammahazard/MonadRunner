"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import UsernameModal from "~~/components/UsernameModal";
import dynamicImport from "next/dynamic";
import ReplayListModal from "~~/components/ReplayListModal";
import AABanner from "~~/components/AABanner";
// Import our AA-enabled contract hook with the correct name
import useMonadRunnerContractWithAA, { GameScore } from "~~/hooks/useMonadRunnerContractWithAA";

const MonadRunnerNoSSR = dynamicImport(() => import("~~/components/MonadRunner"), {
  ssr: false,
  loading: () => (
    <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex items-center justify-center">
      Loading uWu
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

  // Use our AA-enabled contract hook
  
  const {
    isRegistered,
    playerData,
    playerRank,
    topScores,
    playerScoreHistory,
    registerPlayer,
    updateUsername,
    submitScore,
    isAAEnabled,
    aaAddress,
    effectiveAddress
  } = useMonadRunnerContractWithAA();
  useEffect(() => {
    const handleAAStatusChange = (event: CustomEvent) => {
      console.log("AA Status Changed in Home Page:", event.detail);
      // If you have any refresh methods, call them here
    };
  
    // Add event listener
    window.addEventListener('aa-status-changed', handleAAStatusChange as EventListener);
  
    // Cleanup listener
    return () => {
      window.removeEventListener('aa-status-changed', handleAAStatusChange as EventListener);
    };
  }, []);
  // Set mounted flag once on client
  useEffect(() => {
    setMounted(true);
  }, []);

  const computedLeaderboard = useMemo(() => {
    if (!topScores) return [];
    return topScores.map((score, index) => ({
      rank: index + 1,
      walletAddress: score.playerAddress,
      username: playerData?.username || "Player",
      highScore: Number(score.score),
    }));
  }, [topScores, playerData]);
  
  // 2. Update leaderboard state only if it’s different.
  useEffect(() => {
    // Do a simple deep equality check by converting to JSON strings.
    const newLeaderboard = JSON.stringify(computedLeaderboard);
    const prevLeaderboard = JSON.stringify(leaderboardData);
    if (newLeaderboard !== prevLeaderboard) {
      setLeaderboardData(computedLeaderboard);
      setLoadingLeaderboard(false);
    }
  }, [computedLeaderboard, leaderboardData]);
  
  // 3. Compute user stats with useMemo.
  const computedUserStats = useMemo(() => {
    if (playerData && effectiveAddress) {
      return {
        walletAddress: effectiveAddress,
        username: playerData.username,
        highScore: Number(playerData.highScore),
        timesPlayed: Number(playerData.timesPlayed),
        rank: playerRank || 0,
      };
    }
    return null;
  }, [playerData, effectiveAddress, playerRank]);
  
  // 4. Update user stats state only if it’s changed.
  useEffect(() => {
    const newStats = JSON.stringify(computedUserStats);
    const prevStats = JSON.stringify(userStats);
    if (newStats !== prevStats) {
      setUserStats(computedUserStats);
      setLoadingUserStats(false);
    }
  }, [computedUserStats, userStats]);
  
  // 5. Finally, update isLoading only when both flags are done.
  useEffect(() => {
    if (!loadingLeaderboard && !loadingUserStats) {
      setIsLoading(false);
    }
  }, [loadingLeaderboard, loadingUserStats]);

  const formatTimestamp = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const handleStartGame = async () => {
    if (!connectedAddress) return;
    setIsLoading(true);
    
    if (isRegistered) {
      setGameStarted(true);
      setIsLoading(false);
    } else {
      setShowUsernameModal(true);
      setIsLoading(false);
    }
  };

  const handleGameEnd = async (score: number, replayData: any[]) => {
    if (!connectedAddress) return;
    setIsLoading(true);
    
    try {
      // Convert replay data to JSON string
      const replayDataJson = JSON.stringify(replayData);
      
      // Submit score to blockchain
      const success = await submitScore(score, replayDataJson);
      
      if (success) {
        // Update recent games
        setRecentGames(prevGames => {
          const newGames = [{ time: "just now", score }, ...prevGames.slice(0, 4)];
          return newGames;
        });
        
        // No need to fetch user stats again, they'll update via our hook
      }
    } catch (error) {
      console.error("Error submitting score:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameComplete = async (username: string) => {
    setShowUsernameModal(false);
    setIsLoading(true);
    
    if (connectedAddress) {
      try {
        if (isRegistered) {
          await updateUsername(username);
        } else {
          await registerPlayer(username);
        }
        
        setGameStarted(true);
      } catch (error) {
        console.error("Error setting username:", error);
      } finally {
        setIsLoading(false);
      }
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

  const LoadingSpinner = () => (
    <div className="flex justify-center items-center w-full h-full min-h-[200px]">
      <div className="loading loading-spinner loading-lg text-secondary"></div>
    </div>
  );

  // Now render UI based on mounted state. Even if not fully mounted,
  // we render a minimal fallback to preserve hook order.
  return (
    <>
      {!mounted ? (
        // Minimal fallback while mounting; this fallback doesn't depend on hooks.
        <div>Loading...</div>
      ) : (
        <div className="flex items-center flex-col flex-grow pt-10 pb-16">
          {/* Show AA Banner for users who haven't enabled it yet */}
          {connectedAddress && <AABanner />}
          
          {connectedAddress ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 w-full max-w-6xl px-4">
              {/* Game area */}
              <div className="lg:col-span-3 glass backdrop-blur-md p-6 rounded-xl border border-base-300">
                <div className="mb-6 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-secondary">Monad Runner <span className="text-sm font-normal bg-accent/30 px-2 py-1 rounded-md">On-Chain</span></h2>
                    
                    {/* Show AA status if enabled */}
                    {isAAEnabled && aaAddress && (
                      <div className="badge badge-success gap-1 text-xs">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-3 h-3 stroke-current">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        Gasless Mode
                      </div>
                    )}
                  </div>
                  
                  <div className="glass p-2 rounded-lg">
                    <Address address={connectedAddress} />
                  </div>
                </div>

                {isLoading && !gameStarted && !selectedReplay ? (
                  <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : selectedReplay ? (
                  // Show replay component when a replay is selected
                  <div className="relative">
                    {(() => {
                      const ReplayComponent = dynamicImport(() => import("~~/components/Replay"), {
                        ssr: false,
                        loading: () => <LoadingSpinner />,
                      });
                      return (
                        <ReplayComponent
                          replayData={selectedReplay.replayData}
                          onScoreUpdate={(score) => console.log("Replay score update:", score)}
                          onClose={handleReplayClose}
                        />
                      );
                    })()}
                    <div className="text-center mt-6">
                      <p className="text-sm opacity-80">
                        Replay of {selectedReplay.username || selectedReplay.walletAddress}'s run with score:{" "}
                        {selectedReplay.score}
                      </p>
                    </div>
                  </div>
                ) : gameStarted ? (
                  <MonadRunnerNoSSR
                    walletAddress={effectiveAddress ?? connectedAddress ?? ""} // Add fallbacks
                    username={playerData?.username || userStats?.username || "Player"}
                    onGameEnd={(score, replayData) => handleGameEnd(score, replayData)}
                    onClose={() => setGameStarted(false)}
                  />
                ) : (
                  <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex flex-col items-center justify-center">
                    <div className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
                      Monad Runner
                    </div>
                    <p className="mb-8 max-w-md text-center text-base-content/80">
                      Navigate through the Monad blockchain, avoid obstacles, and collect tokens to top the on-chain leaderboard!
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
                    <div className="mt-4 text-xs opacity-70">
                      {isRegistered 
                        ? "Your progress is stored on the Monad blockchain" 
                        : "You'll need to register on-chain before playing"}
                    </div>
                    
                    {/* Show AA benefits if enabled */}
                    {isAAEnabled && (
                      <div className="mt-2 text-xs text-success">
                        Gasless transactions enabled - play without paying gas fees!
                      </div>
                    )}
                  </div>
                )}

                {/* Replay buttons */}
                <div className="text-center mt-6 flex justify-center gap-4">
                  <div className="text-center mt-6">
                  
                  </div>
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
                      <div className="stat-value text-primary">{userStats?.highScore || playerData?.highScore ? Number(playerData?.highScore || 0) : 0}</div>
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
                      <div className="stat-value text-accent">{playerRank || userStats?.rank || "-"}</div>
                    )}
                    <div className="stat-desc">
                      {playerRank ? `Rank ${playerRank}` : "Not Ranked"}
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
                
                <div className="text-sm bg-primary/10 p-3 rounded-lg">
                  <p className="m-0 text-xs text-center">
                    All scores and gameplay data are stored on the Monad blockchain!
                  </p>
                  {isAAEnabled && (
                    <p className="m-0 mt-1 text-xs text-center text-success">
                      Gasless mode enabled - no transaction fees!
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-md glass backdrop-blur-md p-8 text-center rounded-xl border border-base-300 mt-12">
              <h2 className="text-2xl font-bold mb-4">Connect to Play</h2>
              <p className="mb-6 opacity-80">
                You need to connect your wallet to access the game and compete on the on-chain leaderboard.
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
              onComplete={(username) => handleUsernameComplete(username)}
              onCancel={() => setShowUsernameModal(false)}
            />
          )}

          {/* Global loading overlay */}
          {isLoading && gameStarted && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-base-100 p-6 rounded-xl shadow-xl flex flex-col items-center">
                <div className="loading loading-spinner loading-lg text-secondary mb-4"></div>
                <p className="text-lg font-medium">
                  {isAAEnabled ? "Submitting gasless transaction..." : "Submitting to blockchain..."}
                </p>
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
      )}
    </>
  );
};

export default Play;