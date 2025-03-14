import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useLocalStorage } from "./useLocalStorage";
import { encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { notification } from "~~/utils/scaffold-eth";

export interface AAWalletState {
  isAAEnabled: boolean;
  aaAddress: string | null;
  isEnabling: boolean;
  error: string | null;
  enableAA: () => Promise<void>;
  sendAATransaction: (params: {
    to: string;
    value?: bigint;
    data?: string;
    functionName?: string;
    args?: any[];
  }) => Promise<string>;
}

export const useAAWallet = (): AAWalletState => {
  const { address: connectedAddress, isConnected } = useAccount();
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aaAddress, setAAAddress] = useLocalStorage<string | null>("monad-runner-aa-address", null);
  const [isAAEnabled, setIsAAEnabled] = useLocalStorage<boolean>("monad-runner-aa-enabled", false);
  const { signMessageAsync } = useSignMessage();
  const [isEIP7702] = useLocalStorage<boolean>("monad-runner-eip7702", true);
  const { writeContractAsync } = useScaffoldWriteContract("MonadRunnerGame");
  const statusCheckInProgressRef = useRef(false);
  const lastCheckedAddressRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isConnected || !connectedAddress) return;

    const intervalId = setInterval(async () => {
      if (statusCheckInProgressRef.current) return;
      statusCheckInProgressRef.current = true;

      try {
        const response = await fetch("/api/aa/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: connectedAddress }),
        });

        if (response.ok) {
          const data = await response.json();
          setAAAddress((prev) =>
            data.smartAccountAddress !== prev ? data.smartAccountAddress : prev
          );
          setIsAAEnabled((prev) =>
            data.isEnabled !== prev ? data.isEnabled : prev
          );
          window.dispatchEvent(
            new CustomEvent("aa-status-updated", {
              detail: {
                isEnabled: data.isEnabled,
                address: connectedAddress,
                smartAccountAddress: data.smartAccountAddress,
              },
            })
          );
        }
      } catch (error) {
        console.error("Error checking AA status:", error);
      } finally {
        statusCheckInProgressRef.current = false;
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isConnected, connectedAddress]);

  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      setIsAAEnabled(false);
      setAAAddress(null);
      lastCheckedAddressRef.current = null;
    }
  }, [connectedAddress, isConnected, setIsAAEnabled, setAAAddress]);

  const enableAA = useCallback(async () => {
    if (!connectedAddress || !isConnected) {
      setError("Please connect your wallet first");
      return;
    }
    if (isEnabling) return;

    try {
      setIsEnabling(true);
      setError(null);

      const message = `Enable Account Abstraction for Monad Runner\nWallet: ${connectedAddress}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch("/api/aa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature,
          message,
          walletAddress: connectedAddress,
          useEIP7702: isEIP7702,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enable account abstraction");
      }

      const data = await response.json();
      const updatedAAAddress = isEIP7702 ? connectedAddress : data.smartAccountAddress;

      localStorage.setItem("monad-runner-aa-enabled", "true");
      localStorage.setItem("monad-runner-aa-address", updatedAAAddress);
      setAAAddress(updatedAAAddress);
      setIsAAEnabled(true);

      window.dispatchEvent(
        new CustomEvent("aa-status-updated", {
          detail: {
            isEnabled: true,
            address: connectedAddress,
            smartAccountAddress: updatedAAAddress,
          },
        })
      );
    } catch (err: any) {
      setError(err.message || "Failed to enable account abstraction");
      localStorage.removeItem("monad-runner-aa-enabled");
      localStorage.removeItem("monad-runner-aa-address");
      setIsAAEnabled(false);
      setAAAddress(null);
    } finally {
      setIsEnabling(false);
    }
  }, [connectedAddress, isConnected, signMessageAsync, setAAAddress, setIsAAEnabled, isEnabling, isEIP7702]);

  const sendAATransaction = useCallback(
    async (params: {
      to: string;
      value?: bigint;
      data?: string;
      functionName?: string;
      args?: any[];
    }): Promise<string> => {
      if (!isAAEnabled || !aaAddress) {
        console.warn("AA is disabled, falling back to manual transaction signing.");
        
        if (!params.functionName || !params.args) {
          throw new Error("Function name and arguments are required for EOA transactions.");
        }
  
        try {
          console.log("Sending transaction with manual signing...");
          const tx = await writeContractAsync({
            functionName: params.functionName,
            args: params.args,
          });
  
          notification.success("Transaction sent successfully with manual signing.");
          return tx.hash;
        } catch (error: any) {
          console.error("Error with manual signing:", error);
          notification.error(error.message || "Failed to send transaction manually.");
          throw error;
        }
      }
  
      try {
        let data = params.data || "0x";
        if (params.functionName && params.args) {
          const chainId = 10143;
          const contractData = deployedContracts[chainId].MonadRunnerGame;
          data = encodeFunctionData({
            abi: contractData.abi,
            functionName: params.functionName,
            args: params.args,
          });
        }
  
        console.log("Attempting AA transaction:", {
          aaAddress,
          to: params.to,
          value: params.value?.toString() || "0",
          functionName: params.functionName,
          args: params.args,
          useEIP7702: isEIP7702,
        });
  
        const response = await fetch("/api/aa/transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aaAddress,
            to: params.to,
            value: params.value?.toString() || "0",
            data,
            originalSender: connectedAddress,
            useEIP7702: isEIP7702,
          }),
        });
  
        if (!response.ok) {
          const errorData = await response.json();
          console.error("AA transaction failed:", errorData);
          throw new Error(errorData.error || "AA transaction failed.");
        }
  
        const result = await response.json();
        console.log("AA transaction success:", result);
        return result.txHash;
      } catch (error: any) {
        console.error("Error processing AA transaction:", error);
  
        if (
          error.message?.includes("HTTP request failed") ||
          error.message?.includes("Internal Server Error") ||
          error.message?.includes("CALL_EXCEPTION") ||
          error.message?.includes("request limit reached")
        ) {
          console.warn("AA failed, prompting user for manual signing...");
  
          const userConfirmed = window.confirm(
            "Gasless transactions are currently broken because the dev is a dumbass. Do you want to manually sign the transaction? (This will cost gas fees.)"
          );
  
          if (!userConfirmed) {
            notification.error("Transaction canceled by user.");
            throw new Error("User declined manual signing.");
          }
  
          if (!params.functionName || !params.args) {
            notification.error("AA failed, and manual signing is unavailable.");
            throw new Error("AA failed, manual signing requires function name & args.");
          }
  
          try {
            const tx = await writeContractAsync({
              functionName: params.functionName,
              args: params.args,
            });
  
            notification.success("Transaction signed manually.");
            return tx.hash;
          } catch (fallbackError: any) {
            console.error("Fallback signing failed:", fallbackError);
            throw new Error("AA failed, and manual signing also failed.");
          }
        }
  
        throw error;
      }
    },
    [isAAEnabled, aaAddress, connectedAddress, isEIP7702, writeContractAsync]
  );

  return {
    isAAEnabled,
    aaAddress,
    isEnabling,
    error,
    enableAA,
    sendAATransaction,
  };
};

export default useAAWallet;
