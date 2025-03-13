"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount, useWalletClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import useMonadRunnerContract from "~~/hooks/useMonadRunnerContract";
import EnableAAModal from "~~/components/EnableAAModal";

interface LeaderboardPlayer {
  rank: number;
  displayName: string;
  score: number;
}

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient(); // used only to check connection
  const { topScores, playerData } = useMonadRunnerContract();
  const [showAAModal, setShowAAModal] = useState(false);
  const [aaEnabled, setAAEnabled] = useState(false);
  const [hasDeclinedAA, setHasDeclinedAA] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);

  // Memoize the computed leaderboard to avoid unnecessary state updates.
  const leaderboard = useMemo<LeaderboardPlayer[]>(() => {
    if (!topScores) return [];
    // Deduplicate: keep only the highest score per wallet.
    const uniqueMap = new Map<string, typeof topScores[0]>();
    topScores.forEach((entry) => {
      const wallet = entry.playerAddress.toLowerCase();
      if (!uniqueMap.has(wallet) || Number(entry.score) > Number(uniqueMap.get(wallet)!.score)) {
        uniqueMap.set(wallet, entry);
      }
    });
    const uniqueEntries = Array.from(uniqueMap.values()).sort(
      (a, b) => Number(b.score) - Number(a.score)
    );
    // Map to our LeaderboardPlayer type.
    return uniqueEntries.map((entry, index) => {
      const wallet = entry.playerAddress;
      const displayName =
        connectedAddress &&
        wallet.toLowerCase() === connectedAddress.toLowerCase() &&
        playerData?.username
          ? playerData.username
          : wallet.substring(0, 6) + "..." + wallet.substring(wallet.length - 4);
      return {
        rank: index + 1,
        displayName,
        score: Number(entry.score),
      };
    });
  }, [topScores, connectedAddress, playerData]);

  // Show the AA modal only once if the wallet is connected, AA isn't enabled, and the user hasn't declined AA.
  useEffect(() => {
    if (connectedAddress && !aaEnabled && !hasDeclinedAA) {
      setShowAAModal(true);
    }
  }, [connectedAddress, aaEnabled, hasDeclinedAA]);

  // Called when the user successfully signs the AA enabling message.
  const handleEnableAA = async (signature: string, message: string) => {
    if (!connectedAddress) return;
    try {
      const res = await fetch("/api/aa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          message,
          walletAddress: connectedAddress,
        }),
      });
      const data = await res.json();
      if (res.ok && data.smartAccountAddress) {
        setSmartAccountAddress(data.smartAccountAddress);
        setAAEnabled(true);
        setShowAAModal(false);
        console.log("AA enabled. Smart account address:", data.smartAccountAddress);
      } else {
        console.error("Error enabling AA:", data.error);
      }
    } catch (error) {
      console.error("Error enabling AA:", error);
    }
  };

  // Called when the user cancels AA enablement.
  const handleCancelAA = () => {
    setHasDeclinedAA(true);
    setShowAAModal(false);
  };

  return (
    <div className="flex items-center flex-col flex-grow pt-10">
      {showAAModal && (
        <EnableAAModal onSuccess={handleEnableAA} onClose={handleCancelAA} />
      )}
      {/* Hero Section */}
      <div className="min-h-[80vh] w-full bg-base-200 bg-gradient-to-b from-base-300 to-base-100 rounded-lg overflow-hidden relative">
        <div className="hero-content text-center relative z-10 py-16">
          <div className="max-w-md">
            <h1 className="text-6xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
              Monad Runner
            </h1>
            <p className="py-6 text-lg text-base-content/90">
              Navigate through the blockchain, avoid obstacles, and collect tokens.
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

      {/* Leaderboard Section */}
      <div className="w-full max-w-6xl mx-auto my-12 px-6">
        <h2 className="text-3xl font-bold mb-6 text-base-content/90">Top Players</h2>
        <div className="glass backdrop-blur-md p-6 rounded-xl border border-base-300">
          {leaderboard.length > 0 ? (
            leaderboard.map((player) => (
              <div
                key={player.rank}
                className="flex items-center justify-between p-3 mb-2 rounded-lg bg-base-100/30"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      player.rank === 1
                        ? "bg-yellow-500"
                        : player.rank === 2
                        ? "bg-gray-300"
                        : player.rank === 3
                        ? "bg-amber-700"
                        : "bg-base-300"
                    } text-base-100`}
                  >
                    {player.rank}
                  </div>
                  <div className="text-sm truncate w-24">{player.displayName}</div>
                </div>
                <div className="font-mono font-bold text-secondary">{player.score}</div>
              </div>
            ))
          ) : (
            <p>No leaderboard data available.</p>
          )}
          <div className="mt-4 text-center">
            <Link href="/play" className="btn btn-sm btn-accent shadow-neon-purple">
              View Full Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
