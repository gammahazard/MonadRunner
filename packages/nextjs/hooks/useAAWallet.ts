import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useLocalStorage } from "./useLocalStorage";
import { encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { notification } from "~~/utils/scaffold-eth";

// Define standard AA event name for the entire app
export const AA_STATUS_EVENT = 'aa-status-changed';

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
  checkAAStatus: () => Promise<void>;
}

export const useAAWallet = (): AAWalletState => {
  const { address: connectedAddress, isConnected } = useAccount();
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aaAddress, setAAAddress] = useLocalStorage<string | null>("monad-runner-aa-address", null, true);
  const [isAAEnabled, setIsAAEnabled] = useLocalStorage<boolean>("monad-runner-aa-enabled", false, true);
  const [isEIP7702] = useLocalStorage<boolean>("monad-runner-eip7702", true);
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useScaffoldWriteContract("MonadRunnerGame");
  const statusCheckInProgressRef = useRef(false);
  const lastCheckedAddressRef = useRef<string | null>(null);

  // Global timestamp for throttling API requests
  const lastApiRequestRef = useRef<number>(0);
  const pendingRequestsRef = useRef<Set<string>>(new Set());
  const apiRequestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Centralized function to check AA status that can be called on demand
  const checkAAStatus = useCallback(async (force: boolean = false) => {
    if (!isConnected || !connectedAddress) return;
    
    // Don't make concurrent requests for the same wallet
    const requestKey = `status-${connectedAddress}`;
    if (pendingRequestsRef.current.has(requestKey) && !force) {
      return;
    }
    
    // Add to pending set
    pendingRequestsRef.current.add(requestKey);
    
    // Implement rate limiting - only one request per second
    const now = Date.now();
    const timeSinceLastRequest = now - lastApiRequestRef.current;
    const minRequestInterval = 1100; // Slightly over 1 second to avoid race conditions
    
    if (timeSinceLastRequest < minRequestInterval) {
      // If we have an existing timeout, don't set another one
      if (apiRequestTimeoutRef.current !== null) {
        pendingRequestsRef.current.delete(requestKey);
        return;
      }
      
      // Wait for the remaining time before making the request
      const waitTime = minRequestInterval - timeSinceLastRequest;
      apiRequestTimeoutRef.current = setTimeout(async () => {
        apiRequestTimeoutRef.current = null;
        // Attempt again after delay
        await checkAAStatus(true);
      }, waitTime);
      
      pendingRequestsRef.current.delete(requestKey);
      return;
    }
    
    // Update the timestamp
    lastApiRequestRef.current = now;
    statusCheckInProgressRef.current = true;
    
    try {
      console.log(`Checking AA status for ${connectedAddress}...`);
      const response = await fetch("/api/aa/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          walletAddress: connectedAddress
        }),
      });

      // Regardless of status, parse the response
      const data = await response.json();
      
      if (response.ok) {
        // Check localStorage for previous enablement
        const previousEnabledWallet = localStorage.getItem("monad-runner-aa-wallet");
        const isPreviouslyEnabled = previousEnabledWallet && 
          previousEnabledWallet.toLowerCase() === connectedAddress.toLowerCase();
          
        // If localStorage indicates enabled, this takes priority over API response
        if (isPreviouslyEnabled) {
          console.log(`LocalStorage shows wallet ${connectedAddress} previously enabled AA, using this status`);
          if (!isAAEnabled) {
            setIsAAEnabled(true);
          }
          if (!aaAddress) {
            setAAAddress(connectedAddress);
          }
          // Skip further processing - wallet is enabled
        } else {
          // Process API response
          const updatedAAAddress = data.smartAccountAddress;
          const updatedStatus = data.isEnabled;
          const isUncertain = data.isUncertain === true;
          
          console.log(`AA status for ${connectedAddress}: enabled=${updatedStatus}, address=${updatedAAAddress}, uncertain=${isUncertain}`);
          
          // Only update if values actually changed
          if (updatedAAAddress !== aaAddress) {
            setAAAddress(updatedAAAddress);
          }
          
          if (updatedStatus !== isAAEnabled) {
            setIsAAEnabled(updatedStatus);
          }
          
          // If API shows enabled, store in localStorage for future reference
          if (updatedStatus) {
            console.log(`API returned enabled status, saving to localStorage`);
            localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
          }
        }
        
        // Always dispatch a canonical event with status (even if uncertain)
        window.dispatchEvent(
          new CustomEvent(AA_STATUS_EVENT, {
            detail: {
              isEnabled: !!updatedStatus, // Convert to boolean to ensure it's definitive
              address: connectedAddress,
              smartAccountAddress: updatedAAAddress,
              timestamp: Date.now(),
              isDefinitive: !isUncertain, // Only mark as definitive if not uncertain
              isUncertain: isUncertain
            },
          })
        );
        
        lastCheckedAddressRef.current = connectedAddress;
        return { isEnabled: updatedStatus, smartAccountAddress: updatedAAAddress };
      } else {
        // Handle error status codes
        if (response.status === 429) {
          // Rate limited - just log, don't change state
          console.log(`Rate limited: ${data.error}, retry after ${data.retryAfter}ms`);
        } else if ([500, 503].includes(response.status) && data.retainClientState) {
          // Server error but we should keep current state
          console.log("Server error but retaining client state:", data.error);
          
          // Always dispatch a definitive event with the current state
          window.dispatchEvent(
            new CustomEvent(AA_STATUS_EVENT, {
              detail: {
                isEnabled: !!isAAEnabled, // Convert to boolean to ensure it's definitive
                address: connectedAddress,
                smartAccountAddress: aaAddress,
                timestamp: Date.now(),
                fromCache: true,
                isDefinitive: true
              },
            })
          );
        } else {
          // Other error, log it
          console.error(`Status check failed: ${response.status}`, data.error || "Unknown error");
        }
      }
    } catch (error) {
      console.error("Error checking AA status:", error);
    } finally {
      statusCheckInProgressRef.current = false;
      pendingRequestsRef.current.delete(requestKey);
    }
  }, [isConnected, connectedAddress, aaAddress, isAAEnabled, setAAAddress, setIsAAEnabled]);

  // Check status only on initialization, wallet change, or when directly requested
  // Use a ref to track if we've already checked on this connection
  const hasCheckedOnConnectionRef = useRef(false);
  
  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      // Reset the check flag when disconnected
      hasCheckedOnConnectionRef.current = false;
      return;
    }

    // Log current status for debugging
    console.log(`Connected with wallet: ${connectedAddress}`);
    console.log(`Current AA status in memory: enabled=${isAAEnabled}, address=${aaAddress || 'none'}`);
    console.log(`LocalStorage AA wallet: ${localStorage.getItem("monad-runner-aa-wallet") || 'none'}`);

    // CRITICAL: Check if this address has previously enabled AA
    // If the address matches what we stored, use the localStorage values directly
    const previousEnabledWallet = localStorage.getItem("monad-runner-aa-wallet");
    
    // Case insensitive comparison to handle different address formats
    const isPreviouslyEnabled = previousEnabledWallet && 
      previousEnabledWallet.toLowerCase() === connectedAddress.toLowerCase();

    if (isPreviouslyEnabled) {
      // If this wallet previously enabled AA, force enable state
      console.log(`This wallet (${connectedAddress}) previously enabled AA, using cached status`);
      
      // Make sure our state is correct
      if (!isAAEnabled || !aaAddress) {
        setAAAddress(connectedAddress);
        setIsAAEnabled(true);
      }
      
      // Always dispatch a definitive event - AA is enabled for this wallet
      window.dispatchEvent(
        new CustomEvent(AA_STATUS_EVENT, {
          detail: {
            isEnabled: true,
            address: connectedAddress,
            smartAccountAddress: connectedAddress,
            timestamp: Date.now(),
            fromCache: true,
            isDefinitive: true
          },
        })
      );
      
      // We already know it's enabled, no need to check with API
      hasCheckedOnConnectionRef.current = true;
      lastCheckedAddressRef.current = connectedAddress;
      
      return;
    }

    // For initial load, trust localStorage values first for faster UI response
    // This will make sure the banner doesn't flicker if we've already enabled AA
    if (isAAEnabled !== undefined) {
      console.log("Using cached AA status from localStorage:", { isAAEnabled, aaAddress });
      
      // Always dispatch a definitive event based on our localStorage values
      // This is critical to ensure the banner shows/hides correctly
      window.dispatchEvent(
        new CustomEvent(AA_STATUS_EVENT, {
          detail: {
            isEnabled: !!isAAEnabled, // Convert to boolean to ensure it's definitive
            address: connectedAddress,
            smartAccountAddress: aaAddress,
            timestamp: Date.now(),
            fromCache: true,
            isDefinitive: true // Mark as a definitive answer
          },
        })
      );
      
      // If we've already checked once for this wallet connection, don't check again
      if (hasCheckedOnConnectionRef.current) {
        console.log("Already verified AA status for this connection, skipping redundant check");
        return;
      }
      
      // Only check at most once per connection, and only for addresses we haven't seen yet
      if (lastCheckedAddressRef.current !== connectedAddress) {
        // Only check once on initial connection, with a short delay
        const timer = setTimeout(() => {
          checkAAStatus(false);
          hasCheckedOnConnectionRef.current = true;
        }, 2000); // Shorter delay since we only check once per connection
        
        return () => clearTimeout(timer);
      }
    } else if (!hasCheckedOnConnectionRef.current) {
      // If no cached status and we haven't checked yet, check once with a short delay
      // This avoids race conditions but still gets a quick response
      const timer = setTimeout(() => {
        checkAAStatus(true);
        hasCheckedOnConnectionRef.current = true;
      }, 500); 
      
      return () => clearTimeout(timer);
    }
  }, [isConnected, connectedAddress, checkAAStatus, isAAEnabled, aaAddress, setAAAddress, setIsAAEnabled]);

  // Reset AA state when user disconnects
  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        setIsAAEnabled(false);
        setAAAddress(null);
        lastCheckedAddressRef.current = null;
      }, 0);
    } else if (lastCheckedAddressRef.current !== connectedAddress) {
      // Address changed, check status right away with a slight delay
      setTimeout(() => {
        checkAAStatus(true);
      }, 0);
    }
  }, [connectedAddress, isConnected, setIsAAEnabled, setAAAddress, checkAAStatus]);

  // Track the last update timestamp to avoid duplicate calls - must be outside of useEffect
  const lastUpdateTimestampRef = useRef<number>(0);
  
  // Listen for localStorage updates - only if they didn't originate from this component
  useEffect(() => {
    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && 
         (customEvent.detail.key === "monad-runner-aa-enabled" || 
          customEvent.detail.key === "monad-runner-aa-address")) {
          
        // Skip if this update is too close to our last one (likely originated from here)
        const currentTimestamp = Date.now();
        if (currentTimestamp - lastUpdateTimestampRef.current < 1000) {
          return;
        }
        
        // Update timestamp and trigger check
        lastUpdateTimestampRef.current = currentTimestamp;
        
        // Trigger a status check if localStorage was updated elsewhere
        // Use setTimeout to avoid state updates during render
        setTimeout(() => {
          checkAAStatus(true);
        }, 0);
      }
    };
    
    window.addEventListener('localStorage-updated', handleCustomEvent as EventListener);
    return () => {
      window.removeEventListener('localStorage-updated', handleCustomEvent as EventListener);
    };
  }, [checkAAStatus]);

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

      // CRITICAL - Immediately update localStorage with this permanent state
      // No need to check with the API again, it's now enabled permanently
      setAAAddress(updatedAAAddress);
      setIsAAEnabled(true);
      
      // Store which address this was enabled for
      // THIS IS EXTREMELY IMPORTANT - it's how we remember which wallets have AA
      console.log(`Storing wallet ${connectedAddress} in localStorage as AA-enabled`);
      localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
      
      // Log the current localStorage state to verify it's set correctly
      console.log(`LocalStorage after enabling: ${localStorage.getItem("monad-runner-aa-wallet")}`);
      
      // Mark that we've already checked for this connection
      hasCheckedOnConnectionRef.current = true;
      lastCheckedAddressRef.current = connectedAddress;
      
      // Canonical event dispatch with definitive enabled status
      window.dispatchEvent(
        new CustomEvent(AA_STATUS_EVENT, {
          detail: {
            isEnabled: true,
            address: connectedAddress,
            smartAccountAddress: updatedAAAddress,
            timestamp: Date.now(),
            isDefinitive: true
          },
        })
      );
      
      // No need to check status again after enabling - we know it's enabled
      
    } catch (err: any) {
      setError(err.message || "Failed to enable account abstraction");
      setIsAAEnabled(false);
      setAAAddress(null);
    } finally {
      setIsEnabling(false);
    }
  }, [connectedAddress, isConnected, signMessageAsync, setAAAddress, setIsAAEnabled, isEnabling, isEIP7702, checkAAStatus]);

  const sendAATransaction = useCallback(
    async (params: {
      to: string;
      value?: bigint;
      data?: string;
      functionName?: string;
      args?: any[];
    }): Promise<string> => {
      // Trust localStorage state completely - avoid unnecessary status checks
      // Only in extreme edge cases would we have wrong state here
      
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
            "Gasless transactions are currently having issues. Do you want to manually sign the transaction? (This will cost gas fees.)"
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
    [isAAEnabled, aaAddress, connectedAddress, isEIP7702, writeContractAsync, checkAAStatus]
  );

  return {
    isAAEnabled,
    aaAddress,
    isEnabling,
    error,
    enableAA,
    sendAATransaction,
    checkAAStatus
  };
};

export default useAAWallet;
