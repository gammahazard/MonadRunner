import { useScaffoldReadContract, useScaffoldWriteContract } from "./scaffold-eth";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";
import { useAA } from "~~/providers/AAProvider";
import deployedContracts from "~~/contracts/deployedContracts";
import { encodeFunctionData } from "viem";
import { useEffect, useState, useCallback, useRef } from 'react';
import { AA_STATUS_EVENT } from "./useAAWallet";

// Re-export the original types
export type PlayerData = {
  username: string;
  highScore: bigint;
  timesPlayed: bigint;
  lastPlayed: bigint;
  exists: boolean;
};

export type GameScore = {
  playerAddress: string;
  score: bigint;
  timestamp: bigint;
  replayHash: string;
};

/**
 * Enhanced hook for Monad Runner contract with Account Abstraction support
 */
export const useMonadRunnerContractWithAA = () => {
  const { address: connectedAddress } = useAccount();
  const { 
    isAAEnabled, 
    aaAddress, 
    sendAATransaction, 
    showEnableModal,
    contractAddress,
    contractAbi
  } = useAA();
  
  // Get the locally stored smart account if available
  const storedSmartAccount = typeof window !== 'undefined' ? localStorage.getItem("monad-runner-aa-address") : null;
  
  // Use the most reliable address in this priority order:
  // 1. AA address from context if enabled
  // 2. Stored smart account from localStorage if different from EOA
  // 3. Connected EOA address as fallback
  const effectiveAddress = isAAEnabled && aaAddress ? 
    aaAddress : 
    (storedSmartAccount && storedSmartAccount.toLowerCase() !== connectedAddress?.toLowerCase()) ? 
      storedSmartAccount : 
      connectedAddress;

  // Read the public mapping "players" to check registration
  const { data: rawPlayer, refetch: refetchPlayer } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "players",
    args: [effectiveAddress],
    query: { enabled: !!effectiveAddress },
  });
  const isRegistered = rawPlayer ? Boolean(rawPlayer[4]) : false;

  // Get traditional write contract methods for EOA transactions
  const { writeContractAsync: registerPlayerEOA } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: updateUsernameEOA } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: submitScoreEOA } =
    useScaffoldWriteContract("MonadRunnerGame");

  // Helper function to create a keccak256 hash of replay data
  const createReplayHash = async (replayDataJson: string): Promise<`0x${string}`> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(replayDataJson);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex =
      "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex as `0x${string}`;
  };

  // Function to register a new player
  const registerPlayer = async (username: string): Promise<boolean> => {
    if (!effectiveAddress) {
      notification.error("Please connect your wallet");
      return false;
    }

    try {
      if (isAAEnabled && aaAddress) {
        // Use AA transaction
        const txHash = await sendAATransaction({
          to: contractAddress,
          functionName: "registerPlayer",
          args: [username],
        });

        notification.success("Successfully registered on-chain using AA!");
        refetchPlayer();
        return !!txHash;
      } else {
        // Use regular EOA transaction
        const tx = await registerPlayerEOA({
          functionName: "registerPlayer",
          args: [username],
        });
        notification.success("Successfully registered on-chain!");
        refetchPlayer();
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error registering player:", error);
      
      // If this is a gas error, suggest enabling AA
      if (error.message?.includes("insufficient funds") && !isAAEnabled) {
        notification.error(
          "Not enough gas funds. Enable Account Abstraction for gasless transactions?",
          {
            icon: "💡",
            actionText: "Enable AA",
            onClick: () => showEnableModal(),
          }
        );
      } else {
        notification.error(error.message || "Error registering player");
      }
      return false;
    }
  };

  // Function to update a player's username
  const updateUsername = async (newUsername: string): Promise<boolean> => {
    if (!effectiveAddress) {
      notification.error("Please connect your wallet");
      return false;
    }

    try {
      if (isAAEnabled && aaAddress) {
        // Use AA transaction
        const txHash = await sendAATransaction({
          to: contractAddress,
          functionName: "updateUsername",
          args: [newUsername],
        });

        notification.success("Username updated on-chain using AA!");
        refetchPlayer();
        return !!txHash;
      } else {
        // Use regular EOA transaction
        const tx = await updateUsernameEOA({
          functionName: "updateUsername",
          args: [newUsername],
        });
        notification.success("Username updated on-chain!");
        refetchPlayer();
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error updating username:", error);
      
      // If this is a gas error, suggest enabling AA
      if (error.message?.includes("insufficient funds") && !isAAEnabled) {
        notification.error(
          "Not enough gas funds. Enable Account Abstraction for gasless transactions?",
          {
            icon: "💡",
            actionText: "Enable AA",
            onClick: () => showEnableModal(),
          }
        );
      } else {
        notification.error(error.message || "Error updating username");
      }
      return false;
    }
  };

  // Function to submit a score
  const submitScore = async (
    score: number,
    replayDataJson: string
  ): Promise<boolean> => {
    if (!effectiveAddress) {
      notification.error("Please connect your wallet");
      return false;
    }

    try {
      const replayHash = await createReplayHash(replayDataJson);
      
      if (isAAEnabled && aaAddress) {
        // Use AA transaction
        const txHash = await sendAATransaction({
          to: contractAddress,
          functionName: "submitScore",
          args: [BigInt(score), replayHash],
        });

        notification.success("Score submitted on-chain using AA!");
        refetchPlayer();
        return !!txHash;
      } else {
        // Use regular EOA transaction
        const tx = await submitScoreEOA({
          functionName: "submitScore",
          args: [BigInt(score), replayHash],
        });
        notification.success("Score submitted on-chain!");
        refetchPlayer();
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error submitting score:", error);
      
      // If this is a gas error, suggest enabling AA
      if (error.message?.includes("insufficient funds") && !isAAEnabled) {
        notification.error(
          "Not enough gas funds. Enable Account Abstraction for gasless transactions?",
          {
            icon: "💡",
            actionText: "Enable AA",
            onClick: () => showEnableModal(),
          }
        );
      } else {
        notification.error(error.message || "Error submitting score");
      }
      return false;
    }
  };

  // If the user is registered, read detailed player data using getPlayer
  const { data: playerData, refetch: refetchPlayerData } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayer",
    args: [effectiveAddress],
    query: { enabled: !!effectiveAddress && isRegistered },
  });

  // Read player's rank
  const { data: playerRank, refetch: refetchPlayerRank } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerRank",
    args: [effectiveAddress],
    query: { enabled: !!effectiveAddress && isRegistered },
  });

  // Read player's score history
  const { data: playerScoreHistory, refetch: refetchPlayerScoreHistory } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerScoreHistory",
    args: [effectiveAddress],
    query: { enabled: !!effectiveAddress && isRegistered },
  });

  // Read top scores (leaderboard) – this can always be fetched
  const { data: topScores, refetch: refetchTopScores } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getTopScores",
    args: [BigInt(10)],
    query: { enabled: true },
  });

  // Format the player data if available
  const formattedPlayerData: PlayerData | null =
    playerData && playerData.exists
      ? {
          username: playerData.username,
          highScore: playerData.highScore,
          timesPlayed: playerData.timesPlayed,
          lastPlayed: playerData.lastPlayed,
          exists: playerData.exists,
        }
      : null;

  // Function to refresh all data
  const refreshAllData = async () => {
    await Promise.all([
      refetchPlayer(),
      refetchPlayerData(),
      refetchPlayerRank(),
      refetchPlayerScoreHistory(),
      refetchTopScores()
    ]);
  };
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Debounced refresh to prevent multiple rapid refreshes
  const debouncedRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      console.log("Refreshing Monad Runner contract data after AA status change");
      await refreshAllData();
      
      // Check for the stored smart account address
      const storedAAAddress = localStorage.getItem("monad-runner-aa-address");
      const isEnabled = localStorage.getItem("monad-runner-aa-enabled") === "true";
      
      // Instead of forcing a page reload on mismatch, just log it
      // This prevents endless refresh loops when RPC is rate limited
      if (isEnabled && storedAAAddress && 
          effectiveAddress?.toLowerCase() === connectedAddress?.toLowerCase() &&
          storedAAAddress.toLowerCase() !== connectedAddress?.toLowerCase()) {
        console.log("AA address mismatch detected - updating state without reload");
        // Don't force a reload
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshAllData, isRefreshing, effectiveAddress, connectedAddress]);

  // Listen for our standardized AA status change event
  // Track the last refresh timestamp to avoid excessive refreshes
  const lastRefreshTimestampRef = useRef<number>(0);
  
  useEffect(() => {
    const handleAAStatusChange = (event: Event) => {
      console.log("AA Status Changed in Contract Hook:", (event as CustomEvent).detail);
      
      // Add rate limiting to avoid refresh loops
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimestampRef.current;
      
      // Only refresh at most once every 5 seconds
      if (timeSinceLastRefresh < 5000) {
        console.log(`Skipping refresh, last refresh was ${timeSinceLastRefresh}ms ago`);
        return;
      }
      
      lastRefreshTimestampRef.current = now;
      
      // Trigger a refresh of data with debouncing and delay to avoid updating state during render
      setTimeout(() => {
        debouncedRefresh();
      }, 300);
    };
  
    // Add event listener using the constant from useAAWallet
    window.addEventListener(AA_STATUS_EVENT, handleAAStatusChange);
  
    // Cleanup listener
    return () => {
      window.removeEventListener(AA_STATUS_EVENT, handleAAStatusChange);
    };
  }, [debouncedRefresh]);
  return {
    isRegistered,
    playerData: formattedPlayerData,
    playerRank: playerRank ? Number(playerRank) : null,
    topScores: topScores as GameScore[] | undefined,
    playerScoreHistory: playerScoreHistory as GameScore[] | undefined,
    
    isAAEnabled,
    aaAddress,
    effectiveAddress,

    registerPlayer,
    updateUsername,
    submitScore,
    refreshAllData
  };
};

export default useMonadRunnerContractWithAA;