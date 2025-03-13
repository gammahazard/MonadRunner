import { useState, useCallback, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useLocalStorage } from "./useLocalStorage";
import { encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";

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

  useEffect(() => {
    const checkAAStatus = async () => {
      if (isConnected && connectedAddress && aaAddress) {
        try {
          const response = await fetch("/api/aa/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ walletAddress: connectedAddress }),
          });
          const data = await response.json();
          if (response.ok && data.isEnabled && data.smartAccountAddress) {
            setAAAddress(data.smartAccountAddress);
            setIsAAEnabled(true);
          } else {
            setAAAddress(null);
            setIsAAEnabled(false);
          }
        } catch (error) {
          console.error("Error checking AA status:", error);
        }
      }
    };
    checkAAStatus();
  }, [connectedAddress, isConnected, aaAddress, setAAAddress, setIsAAEnabled]);

  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      setIsAAEnabled(false);
      setAAAddress(null);
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
      console.log("Sending enableAA request with params:", {
        signature: signature.substring(0, 20) + "...",
        messagePreview: message.substring(0, 30) + "...",
        walletAddress: connectedAddress,
      });
      const response = await fetch("/api/aa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, message, walletAddress: connectedAddress }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to enable account abstraction");
      }
      setAAAddress(data.smartAccountAddress);
      setIsAAEnabled(true);
    } catch (err: any) {
      console.error("Error enabling AA wallet:", err);
      setError(err.message || "Failed to enable account abstraction");
      setIsAAEnabled(false);
      setAAAddress(null);
    } finally {
      setIsEnabling(false);
    }
  }, [connectedAddress, isConnected, signMessageAsync, setAAAddress, setIsAAEnabled, isEnabling]);

  const sendAATransaction = useCallback(async (params: {
    to: string;
    value?: bigint;
    data?: string;
    functionName?: string;
    args?: any[];
  }): Promise<string> => {
    if (!isAAEnabled || !aaAddress) {
      throw new Error("AA wallet not enabled");
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
      const response = await fetch("/api/aa/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aaAddress,
          to: params.to,
          value: params.value?.toString() || "0",
          data: data,
          originalSender: connectedAddress,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to send transaction");
      }
      return result.txHash;
    } catch (error: any) {
      console.error("Error sending AA transaction:", error);
      throw new Error(error.message || "Failed to send transaction");
    }
  }, [isAAEnabled, aaAddress, connectedAddress]);

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
