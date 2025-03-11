"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";

interface LeaderboardPlayer {
    rank: number;
    walletAddress: string;
    username?: string; // optional, may not be set
    highScore: number;
  }
  

const Play: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [gameStarted, setGameStarted] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardPlayer[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

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
      }
    }
    fetchLeaderboard();
  }, []);

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

            {gameStarted ? (
              <div className="relative w-full aspect-[16/9] bg-base-300/50 rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center text-xl text-base-content/50">
                  [Game Canvas - Excalibur.js will render here]
                </div>
                <div className="absolute top-5 left-5 glass p-2 rounded-lg">
                  <span className="font-mono">Score: 0</span>
                </div>
                <button
                  onClick={() => setGameStarted(false)}
                  className="absolute top-5 right-5 btn btn-sm btn-circle btn-outline"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="relative w-full aspect-[16/9] bg-base-300/30 rounded-lg flex flex-col items-center justify-center">
                <div className="text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
                  Monad Runner
                </div>
                <p className="mb-8 max-w-md text-center text-base-content/80">
                  Navigate through the digital realm, avoid obstacles, and collect tokens to top the leaderboard!
                </p>
                <button
                  onClick={() => setGameStarted(true)}
                  className="btn btn-secondary btn-lg shadow-neon hover:animate-glow"
                >
                  Start Game
                </button>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="stat bg-base-100/30 rounded-lg">
                <div className="stat-title">Your Best</div>
                <div className="stat-value text-primary">0</div>
                <div className="stat-desc">Score</div>
              </div>

              <div className="stat bg-base-100/30 rounded-lg">
                <div className="stat-title">Global</div>
                <div className="stat-value text-secondary">127</div>
                <div className="stat-desc">High Score</div>
              </div>

              <div className="stat bg-base-100/30 rounded-lg">
                <div className="stat-title">Your Rank</div>
                <div className="stat-value text-accent">-</div>
                <div className="stat-desc">Not Ranked</div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-xl font-bold mb-4">How to Play</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card bg-base-100/30">
                  <div className="card-body p-4">
                    <h4 className="card-title text-base text-primary">Controls</h4>
                    <ul className="list-disc list-inside text-sm space-y-1 opacity-80">
                      <li>Press SPACE to jump/fly</li>
                      <li>Press ESC to pause the game</li>
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
              <p className="text-center">Loading leaderboard...</p>
            ) : leaderboardData.length ? (
              <div className="space-y-3 mb-6">
               {leaderboardData.map((player, index) => (
  <div key={player.walletAddress} className="flex items-center justify-between p-3 rounded-lg bg-base-100/30">
    <div className="flex items-center gap-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
        index === 0 ? "bg-yellow-500" : 
        index === 1 ? "bg-gray-300" : 
        index === 2 ? "bg-amber-700" : "bg-base-300"
      } text-base-100`}>
        {index + 1}
      </div>
      <div className="text-sm truncate w-20">
  {player.username ? player.username : player.walletAddress}
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
              {[...Array(5)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 text-sm rounded bg-base-100/20 opacity-50"
                >
                  <span className="text-xs opacity-70">10 min ago</span>
                  <span className="font-mono font-bold">0</span>
                </div>
              ))}
            </div>

            <div className="text-center">
              <button className="btn btn-outline btn-secondary btn-sm">View All Games</button>
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
    </div>
  );
};

export default Play;
