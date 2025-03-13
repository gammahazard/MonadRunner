import { useScaffoldReadContract, useScaffoldWriteContract } from "./scaffold-eth";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";

// Type for player data
export type PlayerData = {
  username: string;
  highScore: bigint;
  timesPlayed: bigint;
  lastPlayed: bigint;
  exists: boolean;
};

// Type for game score data
export type GameScore = {
  playerAddress: string;
  score: bigint;
  timestamp: bigint;
  replayHash: string;
};

/**
 * Hook for interacting with the MonadRunnerGame contract.
 */
export const useMonadRunnerContract = () => {
  const { address: connectedAddress } = useAccount();

  // Read the public mapping "players" to check registration.
  const { data: rawPlayer } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "players",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });
  const isRegistered = rawPlayer ? Boolean(rawPlayer[4]) : false;

  // Use the object-parameter version of the write hooks.
  // We use the overload that accepts just the contract name.
  // Then, when calling the async function we supply the functionName.
  const { writeContractAsync: registerPlayerAsync } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: updateUsernameAsync } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: submitScoreAsync } =
    useScaffoldWriteContract("MonadRunnerGame");

  // Function to register a new player.
  const registerPlayer = async (username: string): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }
    try {
      const tx = await registerPlayerAsync({
        functionName: "registerPlayer",
        args: [username],
      });
      notification.success("Successfully registered on-chain!");
      return !!tx;
    } catch (error: any) {
      console.error("Error registering player:", error);
      notification.error(error.message || "Error registering player");
      return false;
    }
  };

  // Function to update a player's username.
  const updateUsername = async (newUsername: string): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }
    try {
      const tx = await updateUsernameAsync({
        functionName: "updateUsername",
        args: [newUsername],
      });
      notification.success("Username updated on-chain!");
      return !!tx;
    } catch (error: any) {
      console.error("Error updating username:", error);
      notification.error(error.message || "Error updating username");
      return false;
    }
  };

  // Helper function to create a keccak256 hash of replay data.
  const createReplayHash = async (replayDataJson: string): Promise<`0x${string}`> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(replayDataJson);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex =
      "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex as `0x${string}`;
  };

  // Function to submit a score.
  const submitScore = async (
    score: number,
    replayDataJson: string
  ): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }
    try {
      const replayHash = await createReplayHash(replayDataJson);
      const tx = await submitScoreAsync({
        functionName: "submitScore",
        args: [BigInt(score), replayHash],
      });
      notification.success("Score submitted on-chain!");
      return !!tx;
    } catch (error: any) {
      console.error("Error submitting score:", error);
      notification.error(error.message || "Error submitting score");
      return false;
    }
  };

  // If the user is registered, read detailed player data using getPlayer.
  const { data: playerData } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayer",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read player's rank.
  const { data: playerRank } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerRank",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read player's score history.
  const { data: playerScoreHistory } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerScoreHistory",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read top scores (leaderboard) – this can always be fetched.
  const { data: topScores } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getTopScores",
    args: [BigInt(10)],
    query: { enabled: true },
  });

  // Format the player data if available.
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

  return {
    // State
    isRegistered,
    playerData: formattedPlayerData,
    playerRank: playerRank ? Number(playerRank) : null,
    topScores: topScores as GameScore[] | undefined,
    playerScoreHistory: playerScoreHistory as GameScore[] | undefined,

    // Actions
    registerPlayer,
    updateUsername,
    submitScore,
  };
};

export default useMonadRunnerContract;
