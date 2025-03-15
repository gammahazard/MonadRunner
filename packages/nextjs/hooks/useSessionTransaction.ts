import { useCallback } from "react";
import { useSession } from "~~/providers/SessionProvider";
import { notification } from "~~/utils/scaffold-eth";
import { encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { useAccount } from "wagmi";

/**
 * Hook for executing transactions using session keys
 * This simplifies the process of sending transactions through the server with session keys
 */
export const useSessionTransaction = () => {
  const { address: connectedAddress } = useAccount();
  const {
    isSessionEnabled,
    isSessionValid,
    sessionKey,
    signWithSession,
    showCreateSessionModal
  } = useSession();

  /**
   * Execute a transaction using the session key
   * @param params Transaction parameters 
   * @returns Result of transaction execution
   */
  const executeWithSession = useCallback(async (params: {
    contractName: string;
    functionName: string;
    args: any[];
  }): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    if (!connectedAddress) {
      notification.error("Connect your wallet to continue");
      return { success: false, error: "No wallet connected" };
    }

    // Check if session is valid
    if (!isSessionEnabled || !isSessionValid() || !sessionKey) {
      notification.warning(
        "Session key required",
        {
          icon: "🔑",
          actionText: "Create Session",
          onClick: showCreateSessionModal,
        }
      );
      return { success: false, error: "No valid session" };
    }

    try {
      // Get contract details
      const chainId = 10143; // Monad Testnet
      const contractData = deployedContracts[chainId][params.contractName];
      if (!contractData) {
        throw new Error(`Contract ${params.contractName} not found`);
      }

      // Prepare transaction data for signing
      const txData = {
        contractAddress: contractData.address,
        functionName: params.functionName,
        args: params.args,
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Sign the transaction data with the session key
      const signature = await signWithSession(JSON.stringify(txData));
      if (!signature) {
        throw new Error("Failed to sign transaction with session key");
      }

      // Convert any BigInt values in the args to strings
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

      // Send the transaction via our Next.js API proxy
      const response = await fetch("/api/session/proxy/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: connectedAddress,
          publicKey: sessionKey.sessionPublicKey,
          signature,
          contractAddress: contractData.address,
          functionName: params.functionName,
          args: processArgs(params.args)
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
      
      return {
        success: false,
        error: error.message
      };
    }
  }, [connectedAddress, isSessionEnabled, isSessionValid, sessionKey, signWithSession, showCreateSessionModal]);

  /**
   * Check if a valid session is available for transactions
   * @returns Boolean indicating if a valid session exists
   */
  const hasValidSession = useCallback((): boolean => {
    return isSessionEnabled && isSessionValid() && !!sessionKey;
  }, [isSessionEnabled, isSessionValid, sessionKey]);

  return {
    executeWithSession,
    hasValidSession
  };
};

export default useSessionTransaction;