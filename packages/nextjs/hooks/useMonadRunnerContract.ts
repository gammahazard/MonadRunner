import { useScaffoldReadContract, useScaffoldWriteContract } from "./scaffold-eth";
import { useAccount, useSignMessage } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";
import { useSession } from "~~/providers/SessionProvider";
import deployedContracts from "~~/contracts/deployedContracts";
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';

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
 * Enhanced hook for Monad Runner contract with Session Key support
 */
export const useMonadRunnerContract = () => {
  const { address: connectedAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const {
    isSessionEnabled,
    sessionKey,
    isSessionValid,
    showCreateSessionModal,
    getSessionTimeLeftPercentage,
    signWithSession
  } = useSession();

  // Get contract details
  const chainId = 10143; // Monad Testnet
  const contractData = deployedContracts[chainId].MonadRunnerGame;
  const contractAddress = contractData.address;
  const contractAbi = contractData.abi;
  
  // Read the public mapping "players" to check registration
  const { data: rawPlayer, refetch: refetchPlayer } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "players",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });
  const isRegistered = rawPlayer ? Boolean(rawPlayer[4]) : false;

  // Get traditional write contract methods for EOA transactions
  const { writeContractAsync: registerPlayerEOA } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: updateUsernameEOA } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: submitScoreEOA } =
    useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: registerSessionKeyEOA } =
    useScaffoldWriteContract("MonadRunnerGame");

  // Helper function to check if a valid session is available
  const hasValidSession = useCallback(() => {
    return isSessionEnabled && isSessionValid() && !!sessionKey;
  }, [isSessionEnabled, isSessionValid, sessionKey]);

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

  // Helper function to execute a transaction with session keys
  const executeSessionTransaction = async (params: {
    functionName: string;
    args: any[];
  }): Promise<{ success: boolean; txHash?: string }> => {
    if (!connectedAddress) {
      notification.error("Connect your wallet to continue");
      return { success: false };
    }

    // Check if session is valid
    if (!hasValidSession()) {
      notification.warning(
        "Session key required",
        {
          icon: "🔑",
          actionText: "Create Session",
          onClick: showCreateSessionModal,
        }
      );
      return { success: false };
    }

    try {
      console.log("Executing session transaction:", params.functionName, "with args:", params.args);
      
      // Process arguments to handle BigInt serialization - do this first!
      const processArgs = (args: any[]): any[] => {
        return args.map(arg => {
          if (typeof arg === 'bigint') {
            return arg.toString();
          } else if (Array.isArray(arg)) {
            return processArgs(arg);
          } else if (arg && typeof arg === 'object') {
            const processed: Record<string, any> = {};
            for (const key in arg) {
              processed[key] = 
                typeof arg[key] === 'bigint' 
                  ? arg[key].toString() 
                  : arg[key] && typeof arg[key] === 'object' 
                    ? Array.isArray(arg[key])
                      ? processArgs(arg[key])
                      : processArgs([arg[key]])[0] 
                    : arg[key];
            }
            return processed;
          }
          return arg;
        });
      };
      
      // Convert args before creating txData
      const processedArgs = processArgs(params.args);
      
      // Prepare transaction data for signing with processed args
      const txData = {
        contractAddress: contractAddress,
        functionName: params.functionName,
        args: processedArgs,
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Now we can safely stringify because all BigInts are converted to strings
      console.log("Transaction data prepared:", JSON.stringify(txData, null, 2));
      
      // Sign the transaction data with the session key
      const signature = await signWithSession(JSON.stringify(txData));
      if (!signature) {
        throw new Error("Failed to sign transaction with session key");
      }

      // Send the transaction to the API using the correct proxy endpoint
      const response = await fetch("/api/session/proxy/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: connectedAddress,
          publicKey: sessionKey.sessionPublicKey,
          signature,
          contractAddress: contractAddress,
          functionName: params.functionName,
          args: processedArgs
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transaction failed");
      }

      const result = await response.json();
      
      // Show success notification
      notification.success("Transaction executed successfully!");
      
      return {
        success: true,
        txHash: result.txHash
      };
    } catch (error: any) {
      console.error("Session transaction error:", error);
      
      // If session expired, suggest creating a new one
      if (error.message?.includes("expired")) {
        notification.error(
          "Session expired. Create a new session to continue.",
          {
            icon: "🔑",
            actionText: "New Session",
            onClick: showCreateSessionModal,
          }
        );
      } else {
        notification.error(error.message || "Transaction failed");
      }
      
      return { success: false };
    }
  };

  // Function to register a new player
  const registerPlayer = async (username: string): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }

    try {
      // Check if we have a valid session key
      if (hasValidSession()) {
        try {
          // Create a signature for the transaction using the user's wallet
          const message = `Register player with username: ${username}`;
          const signature = await signMessageAsync({ message });
          
          console.log("Successfully signed registerPlayer message with wallet");
          
          // Send directly to the MongoDB server API
          const response = await fetch("/api/session/proxy/transaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              userAddress: connectedAddress,
              publicKey: sessionKey.sessionPublicKey,
              signature,
              contractAddress: "0x775dc8Be07165261E1ef6371854F600bb01B24E6",
              functionName: "registerPlayerFor",
              args: [connectedAddress, username]
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to register player with session");
          }
          
          const result = await response.json();
          console.log("Player registration successful:", result);
          
          notification.success("Successfully registered on-chain using session key!");
          refetchPlayer();
          return true;
        } catch (error) {
          console.error("Error registering player with session:", error);
          throw error;
        }
      } else {
        // Use regular EOA transaction
        const tx = await registerPlayerEOA({
          functionName: "registerPlayer",
          args: [username],
        });
        notification.success("Successfully registered on-chain!");
        refetchPlayer();
        
        // Suggest creating a session for future transactions
        notification.info(
          "Create a session key to play without signing each transaction!",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
            duration: 5000,
          }
        );
        
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error registering player:", error);
      
      // If this is a session key expired error, prompt to create new session
      if (error.message?.includes("Session key expired") || error.message?.includes("Invalid or expired session")) {
        notification.error(
          "Your session has expired. Create a new session to continue playing without signing transactions?",
          {
            icon: "🔑",
            actionText: "New Session",
            onClick: showCreateSessionModal,
          }
        );
      } else if (error.message?.includes("insufficient funds")) {
        notification.error(
          "Not enough gas funds. Try using a session key for gasless transactions.",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
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
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }

    try {
      // Check if we have a valid session key
      if (hasValidSession()) {
        try {
          // Create a signature for the transaction using the user's wallet
          const message = `Update username to: ${newUsername}`;
          const signature = await signMessageAsync({ message });
          
          console.log("Successfully signed updateUsername message with wallet");
          
          // Send directly to the MongoDB server API
          const response = await fetch("/api/session/proxy/transaction", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              userAddress: connectedAddress,
              publicKey: sessionKey.sessionPublicKey,
              signature,
              contractAddress: "0x775dc8Be07165261E1ef6371854F600bb01B24E6",
              functionName: "updateUsernameFor",
              args: [connectedAddress, newUsername]
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to update username with session");
          }
          
          const result = await response.json();
          console.log("Username update successful:", result);
          
          notification.success("Username updated on-chain using session key!");
          refetchPlayer();
          return true;
        } catch (error) {
          console.error("Error updating username with session:", error);
          throw error;
        }
      } else {
        // Use regular EOA transaction
        const tx = await updateUsernameEOA({
          functionName: "updateUsername",
          args: [newUsername],
        });
        notification.success("Username updated on-chain!");
        refetchPlayer();
        
        // Suggest creating a session for future transactions
        notification.info(
          "Create a session key to play without signing each transaction!",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
            duration: 5000,
          }
        );
        
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error updating username:", error);
      
      // If this is a session key expired error, prompt to create new session
      if (error.message?.includes("Session key expired") || error.message?.includes("Invalid or expired session")) {
        notification.error(
          "Your session has expired. Create a new session to continue playing without signing transactions?",
          {
            icon: "🔑",
            actionText: "New Session",
            onClick: showCreateSessionModal,
          }
        );
      } else if (error.message?.includes("insufficient funds")) {
        notification.error(
          "Not enough gas funds. Try using a session key for gasless transactions.",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
          }
        );
      } else {
        notification.error(error.message || "Error updating username");
      }
      return false;
    }
  };
  
  // Function to register a session key on-chain
  const registerSessionKeyOnChain = async (
    sessionPublicKey: string, 
    validUntil: number
  ): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("Please connect your wallet");
      return false;
    }
    
    if (!isRegistered) {
      notification.error("Please register a player account first");
      return false;
    }
    
    try {
      // We always use a direct EOA transaction for this since we're registering the session
      const tx = await registerSessionKeyEOA({
        functionName: "registerSessionKey",
        args: [sessionPublicKey, BigInt(validUntil)],
      });
      
      notification.success("Session key registered on-chain!");
      return !!tx;
    } catch (error: any) {
      console.error("Error registering session key:", error);
      notification.error(error.message || "Error registering session key");
      return false;
    }
  };

  // Function to submit a score - enhanced with session key support
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
      
      // Check if we have a valid session key
      if (hasValidSession()) {
        console.log("Using session key to submit score");
        
        try {
          // Create a signature for the transaction using the user's wallet
          // This is more reliable than using the Web Crypto API directly
          const message = `Submit score ${score} with replay hash ${replayHash}`;
          const signature = await signMessageAsync({ message });
          
          console.log("Successfully signed message with wallet for session transaction");
          
          // Log the arguments for debugging
          console.log("Submitting score with params:", {
            userAddress: connectedAddress,
            score: score,
            replayHash: replayHash
          });
          
          // Send directly to the MongoDB server API
          const response = await fetch("/api/game/score", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              walletAddress: connectedAddress,
              score: score,
              // Use the entire replay data JSON here, not just the hash
              replayData: replayDataJson,
              sessionPublicKey: sessionKey.sessionPublicKey,
              signature
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error("Score submission failed:", errorData);
            
            // Handle the specific error for player not registered
            if (errorData.error && (
              errorData.error.includes("Player not registered") || 
              errorData.error.includes("PlayerDoesNotExist") ||
              errorData.error.includes("0xb92fd79c") // The specific error code for PlayerDoesNotExist
            )) {
              throw new Error("You need to register a username before submitting scores. Please restart the game and set a username.");
            }
            
            throw new Error(errorData.error || "Failed to submit score with session");
          }
          
          const result = await response.json();
          console.log("Score submission successful:", result);
          
          notification.success("Score submitted on-chain using session key!");
          refetchPlayer();
          return true;
        } catch (error) {
          console.error("Error submitting score with session:", error);
          throw error;
        }
      } 
      // Check session percentage - if low, warn user
      else if (isSessionEnabled && getSessionTimeLeftPercentage() < 20) {
        notification.warning(
          "Your session is about to expire. Consider creating a new session before continuing.",
          {
            icon: "⏰",
            actionText: "New Session",
            onClick: showCreateSessionModal,
            duration: 5000,
          }
        );
        
        // Use regular EOA transaction if session is expiring
        const tx = await submitScoreEOA({
          functionName: "submitScore",
          args: [BigInt(score), replayHash],
        });
        notification.success("Score submitted on-chain!");
        refetchPlayer();
        return !!tx;
      } else {
        // Use regular EOA transaction
        const tx = await submitScoreEOA({
          functionName: "submitScore",
          args: [BigInt(score), replayHash],
        });
        notification.success("Score submitted on-chain!");
        refetchPlayer();
        
        // Suggest creating a session for future transactions
        notification.info(
          "Create a session key to play without signing each transaction!",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
            duration: 5000,
          }
        );
        
        return !!tx;
      }
    } catch (error: any) {
      console.error("Error submitting score:", error);
      
      // If this is a session key expired error, prompt to create new session
      if (error.message?.includes("Session key expired") || error.message?.includes("Invalid or expired session")) {
        notification.error(
          "Your session has expired. Create a new session to continue playing without signing transactions?",
          {
            icon: "🔑",
            actionText: "New Session",
            onClick: showCreateSessionModal,
          }
        );
      } else if (error.message?.includes("insufficient funds")) {
        notification.error(
          "Not enough gas funds. Try using a session key for gasless transactions.",
          {
            icon: "🔑",
            actionText: "Create Session",
            onClick: showCreateSessionModal,
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
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read player's rank
  const { data: playerRank, refetch: refetchPlayerRank } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerRank",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read player's score history
  const { data: playerScoreHistory, refetch: refetchPlayerScoreHistory } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerScoreHistory",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
  });

  // Read top scores (leaderboard) – this can always be fetched
  const { data: topScores, refetch: refetchTopScores } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getTopScores",
    args: [BigInt(10)],
    query: { enabled: true },
  });

  // Read player's session keys 
  const { data: sessionKeys, refetch: refetchSessionKeys } = useScaffoldReadContract({
    contractName: "MonadRunnerGame",
    functionName: "getPlayerSessionKeys",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress && isRegistered },
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
      refetchTopScores(),
      refetchSessionKeys()
    ]);
  };
  
  // Set up automatic refresh on session changes
  useEffect(() => {
    // Create a custom event name for session changes
    const SESSION_CHANGE_EVENT = 'session-status-changed';
    
    const handleSessionChange = () => {
      console.log("Session status changed, refreshing data");
      refreshAllData();
    };
    
    // Listen for session changes
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    
    // Also listen for wallet connection changes
    if (connectedAddress) {
      refreshAllData();
    }
    
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    };
  }, [connectedAddress, isSessionEnabled, sessionKey]);

  return {
    isRegistered,
    playerData: formattedPlayerData,
    playerRank: playerRank ? Number(playerRank) : null,
    topScores: topScores as GameScore[] | undefined,
    playerScoreHistory: playerScoreHistory as GameScore[] | undefined,
    sessionKeys: sessionKeys as string[] | undefined,
    
    // User address
    userAddress: connectedAddress,
    
    // Contract info
    contractAddress,
    contractAbi,
    
    // Session-related properties
    isSessionEnabled,
    isSessionValid,
    hasValidSession,
    showCreateSessionModal,
    getSessionTimeLeftPercentage,

    // Contract methods
    registerPlayer,
    updateUsername,
    submitScore,
    registerSessionKeyOnChain,
    refreshAllData,
    
    // Helper for creating replay hash
    createReplayHash
  };
};

export default useMonadRunnerContract;