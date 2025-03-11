"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const [isRegistering, setIsRegistering] = useState(false);
  const [leaderboard, setLeaderboard] = useState([
    { rank: 1, address: "0x1234...5678", score: 127 },
    { rank: 2, address: "0x8765...4321", score: 95 },
    { rank: 3, address: "0x5432...8765", score: 84 },
  ]);

  // Effect to register wallet when connected
  useEffect(() => {
    const registerWallet = async () => {
      if (connectedAddress && !isRegistering) {
        setIsRegistering(true);
        try {
          console.log(`Registering wallet: ${connectedAddress}`);
          const response = await fetch('/api/wallet/connect', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ walletAddress: connectedAddress }),
          });
          
          const data = await response.json();
          if (!response.ok) {
            console.error('Failed to register wallet:', data.error);
          } else {
            console.log('Wallet registered successfully:', data);
            
            // Optionally fetch leaderboard after registration
            fetchLeaderboard();
          }
        } catch (error) {
          console.error('Error registering wallet:', error);
        } finally {
          setIsRegistering(false);
        }
      }
    };
    
    registerWallet();
  }, [connectedAddress]);
  
  // Function to fetch real leaderboard data
  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/game/leaderboard?limit=3');
      const data = await response.json();
      
      if (response.ok && data.data?.leaderboard) {
        // Transform backend data to match our UI format
        const formattedLeaderboard = data.data.leaderboard.map((player, index) => ({
          rank: index + 1,
          address: player.username || 
                  (player.walletAddress ? 
                   `${player.walletAddress.substring(0, 6)}...${player.walletAddress.substring(player.walletAddress.length - 4)}` : 
                   "Unknown"),
          score: player.highScore
        }));
        
        setLeaderboard(formattedLeaderboard);
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };
  
  // Fetch leaderboard on initial load
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      {/* Main hero section with gradient background */}
      <div className="min-h-[80vh] w-full bg-base-200 bg-gradient-to-b from-base-300 to-base-100 rounded-lg overflow-hidden relative">
        {/* Decorative grid background */}
        <div className="absolute inset-0 bg-monad-grid bg-grid-lg opacity-10"></div>
        
        {/* Glowing accent elements */}
        <div className="absolute top-1/4 left-1/4 w-32 h-32 rounded-full bg-accent/10 blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-40 h-40 rounded-full bg-secondary/10 blur-3xl"></div>
        
        <div className="hero-content text-center relative z-10 py-16">
          <div className="max-w-md">
            <h1 className="text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
              Monad Runner
            </h1>
            <p className="py-6 text-lg text-base-content/90">
              Navigate through the blockchain, avoid obstacles, and collect tokens in this fast-paced game.
            </p>
            
            {connectedAddress ? (
              <div className="mt-8 flex flex-col items-center">
                <div className="mb-4 text-base-content/80">Connected as:</div>
                <div className="glass p-3 rounded-xl backdrop-blur-md mb-4">
                  <Address address={connectedAddress} />
                </div>
                <Link href="/play" className="btn btn-secondary mt-4 px-8 shadow-neon hover:animate-glow">
                  Play Now
                </Link>
              </div>
            ) : (
              <div className="mt-10">
                <p className="mb-6 text-base-content/80">Connect your wallet to begin the experience</p>
                <div className="mt-4 flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-secondary/40"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game info section */}
      <div className="w-full max-w-6xl mx-auto my-12 px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6 text-base-content/90">Top Players</h2>
            
            <div className="glass backdrop-blur-md p-6 rounded-xl border border-base-300">
              {leaderboard.map((player) => (
                <div key={player.rank} className="flex items-center justify-between p-3 mb-2 rounded-lg bg-base-100/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      player.rank === 1 ? "bg-yellow-500" : 
                      player.rank === 2 ? "bg-gray-300" : 
                      player.rank === 3 ? "bg-amber-700" : "bg-base-300"
                    } text-base-100`}>
                      {player.rank}
                    </div>
                    <div className="text-sm truncate w-24">{player.address}</div>
                  </div>
                  <div className="font-mono font-bold text-secondary">{player.score}</div>
                </div>
              ))}
              
              <div className="mt-4 text-center">
                <Link href="/play" className="btn btn-sm btn-accent shadow-neon-purple">
                  View Full Leaderboard
                </Link>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-3xl font-bold mb-6 text-base-content/90">Game Overview</h2>
            
            <div className="glass backdrop-blur-md p-6 rounded-xl border border-base-300">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-content font-bold">1</div>
                  <h3 className="text-lg font-bold text-primary">Navigate the Blockchain</h3>
                </div>
                <p className="ml-10 opacity-80">Fly through a procedurally generated blockchain landscape.</p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-content font-bold">2</div>
                  <h3 className="text-lg font-bold text-secondary">Avoid Obstacles</h3>
                </div>
                <p className="ml-10 opacity-80">Dodge network congestion and security threats along the way.</p>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-content font-bold">3</div>
                  <h3 className="text-lg font-bold text-accent">Collect Tokens</h3>
                </div>
                <p className="ml-10 opacity-80">Grab tokens to increase your score and unlock special abilities.</p>
              </div>
              
              <div className="text-center mt-8">
                <Link href="/play" className="btn btn-secondary shadow-neon">
                  Play Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;