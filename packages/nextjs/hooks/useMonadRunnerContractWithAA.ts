import { useScaffoldReadContract, useScaffoldWriteContract } from "./scaffold-eth";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";
import { useAA } from "~~/providers/AAProvider";
import deployedContracts from "~~/contracts/deployedContracts";
import { encodeFunctionData } from "viem";
import { useEffect } from 'react';
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
  
  // Use the AA address if available, otherwise use the connected EOA address
  const effectiveAddress = isAAEnabled && aaAddress ? aaAddress : connectedAddress;

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
  useEffect(() => {
    const handleAAStatusChange = (event: CustomEvent) => {
      console.log("AA Status Changed in Contract Hook:", event.detail);
      // Trigger a refresh of data
      refreshAllData();
    };
  
    // Add event listener
    window.addEventListener('aa-status-changed', handleAAStatusChange as EventListener);
  
    // Cleanup listener
    return () => {
      window.removeEventListener('aa-status-changed', handleAAStatusChange as EventListener);
    };
  }, [refreshAllData]);
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