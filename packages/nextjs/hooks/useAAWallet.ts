import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useLocalStorage } from "./useLocalStorage";
import { encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";
import { notification } from "~~/utils/scaffold-eth";
import { getSmartAccountAddress } from "./aaWallet";

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
    
    // Special case: if localStorage has no data but user is logged in,
    // force a check to recover smart account data from blockchain
    const hasLocalSmartAccount = localStorage.getItem("monad-runner-aa-address");
    const hasLocalAAEnabled = localStorage.getItem("monad-runner-aa-enabled");
    
    if (connectedAddress && (!hasLocalSmartAccount || !hasLocalAAEnabled)) {
      console.log("No AA data in localStorage, forcing blockchain check to recover data");
      force = true;
    }
    
    // Add to pending set
    pendingRequestsRef.current.add(requestKey);
    
    // Implement very strict rate limiting to prevent refresh loops and RPC rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastApiRequestRef.current;
    const minRequestInterval = 30000; // 30 seconds between status checks
    
    // Only allow forced checks once every 15 seconds
    if ((timeSinceLastRequest < minRequestInterval) || 
        (force && timeSinceLastRequest < 15000)) {
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
      
      // Add the stored smart account address to the request headers if available
      const storedAAAddress = localStorage.getItem("monad-runner-aa-address");
      const headers: Record<string, string> = { 
        "Content-Type": "application/json" 
      };
      
      // Add header if smart account exists in localStorage
      if (storedAAAddress) {
        // Remove any quotes to prevent JSON encoding issues
        const cleanAddress = storedAAAddress.replace(/"/g, '');
        console.log(`Including stored smart account in request: ${cleanAddress}`);
        headers["x-aa-smart-account"] = cleanAddress;
      }
      
      const response = await fetch("/api/aa/status", {
        method: "POST",
        headers,
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
          
          console.log(`AA status for ${connectedAddress}: enabled=${data.isEnabled}, address=${updatedAAAddress}, uncertain=${isUncertain}`);
          
          // Only update if values actually changed
          if (updatedAAAddress !== aaAddress) {
            setAAAddress(updatedAAAddress);
          }
          
          // Store if the account is enabled
          const isEnabled = data.isEnabled;
          
          if (isEnabled !== isAAEnabled) {
            setIsAAEnabled(isEnabled);
          }
          
          // If API shows enabled and returns a valid smart account address,
          // update localStorage with the blockchain data
          const zeroAddress = "0x0000000000000000000000000000000000000000";
          if (isEnabled && updatedAAAddress && 
              updatedAAAddress !== zeroAddress && 
              updatedAAAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
            console.log(`API returned valid smart account ${updatedAAAddress}, updating localStorage`);
            localStorage.setItem("monad-runner-aa-enabled", "true");
            localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
            localStorage.setItem("monad-runner-aa-address", updatedAAAddress);
            
            // Dispatch a status event to notify other components
            window.dispatchEvent(
              new CustomEvent(AA_STATUS_EVENT, {
                detail: {
                  isEnabled: true,
                  address: connectedAddress,
                  smartAccountAddress: updatedAAAddress,
                  fromBlockchain: true,
                  timestamp: Date.now()
                },
              })
            );
          }
        }
        
        // Always dispatch a canonical event with status (even if uncertain)
        window.dispatchEvent(
          new CustomEvent(AA_STATUS_EVENT, {
            detail: {
              isEnabled: isAAEnabled, // Use our state value which should be updated
              address: connectedAddress,
              smartAccountAddress: aaAddress || updatedAAAddress,
              timestamp: Date.now(),
              isDefinitive: !isUncertain, // Only mark as definitive if not uncertain
              isUncertain: isUncertain
            },
          })
        );
        
        lastCheckedAddressRef.current = connectedAddress;
        return { isEnabled: data.isEnabled, smartAccountAddress: updatedAAAddress };
      } else {
        // Handle error status codes
        if (response.status === 429) {
          // Rate limited - check if we have a smart account address in the response
          if (data.smartAccountAddress && data.retainClientState) {
            console.log(`Rate limited but got smart account address: ${data.smartAccountAddress}`);
            
            // Immediately update localStorage and state if we have a valid address
            if (data.smartAccountAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
              console.log(`Saving rate-limited smart account to localStorage: ${data.smartAccountAddress}`);
              localStorage.setItem("monad-runner-aa-enabled", "true");
              localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
              localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress);
              
              // Update state too
              setAAAddress(data.smartAccountAddress);
              setIsAAEnabled(true);
              
              // Dispatch an event so UI components can update
              window.dispatchEvent(
                new CustomEvent(AA_STATUS_EVENT, {
                  detail: {
                    isEnabled: true,
                    address: connectedAddress,
                    smartAccountAddress: data.smartAccountAddress,
                    timestamp: Date.now(),
                    fromRateLimit: true,
                    isDefinitive: true
                  },
                })
              );
            }
          } else {
            // Standard rate limit with no data
            console.log(`Rate limited: ${data.error}, retry after ${data.retryAfter}ms`);
          }
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
    
    // Check if we need to force a blockchain sync on first connection
    // This is especially important if localStorage was cleared but smart account exists
    const storedSmartAccount = localStorage.getItem("monad-runner-aa-address");
    const storedEnabledWallet = localStorage.getItem("monad-runner-aa-wallet");
    
    // If we have no stored data but the user is connected, force a check with blockchain
    // This recovers lost state when localStorage is cleared
    if (!storedSmartAccount || !storedEnabledWallet) {
      console.log("No stored AA data found, checking blockchain for recovery...");
      
      // Use setTimeout to avoid doing this during render
      setTimeout(() => {
        // Force check with blockchain, bypass cache
        checkAAStatus(true);
      }, 500);
    }

    // CRITICAL: Check if this address has previously enabled AA
    // If the address matches what we stored, use the localStorage values directly
    const previousEnabledWallet = localStorage.getItem("monad-runner-aa-wallet");
    
    // Clear any window rate limit flags when accessing a wallet
    // This ensures a clean state for a new wallet connection
    window.isRateLimited = false;
    window.rateLimitRetryCount = 0;
    window.pendingUsername = "";
    
    // Case insensitive comparison to handle different address formats
    const isPreviouslyEnabled = previousEnabledWallet && 
      previousEnabledWallet.toLowerCase() === connectedAddress.toLowerCase();

    if (isPreviouslyEnabled) {
      // If this wallet previously enabled AA, check if we have a valid smart account address
      console.log(`This wallet (${connectedAddress}) previously enabled AA, validating stored data`);
      const storedAAAddress = localStorage.getItem("monad-runner-aa-address");
      
      // Only use if we have a valid smart account address and it's different from EOA
      if (storedAAAddress && storedAAAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
        console.log(`Using stored smart account address: ${storedAAAddress}`);
        
        // Make sure our state is correct
        if (!isAAEnabled) {
          setIsAAEnabled(true);
        }
        if (!aaAddress) {
          setAAAddress(storedAAAddress);
        }
      } else {
        console.warn("Invalid or missing smart account in localStorage, ignoring");
        // Clear invalid state to force reconfiguration
        localStorage.removeItem("monad-runner-aa-enabled");
        localStorage.removeItem("monad-runner-aa-address");
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

  // Track when wallet address changes - declared outside effect
  const previousAddressRef = useRef<string | null>(null);
  
  // Reset AA state when user disconnects or switches wallets
  useEffect(() => {
    if (!isConnected || !connectedAddress) {
      // User disconnected
      console.log("Wallet disconnected, resetting AA state");
      
      // Use setTimeout to avoid state updates during render
      setTimeout(() => {
        setIsAAEnabled(false);
        setAAAddress(null);
        lastCheckedAddressRef.current = null;
        previousAddressRef.current = null;
        
        // Also clear any wallet-specific localStorage to prevent using wrong data
        localStorage.removeItem("monad-runner-aa-enabled");
        localStorage.removeItem("monad-runner-aa-wallet");
        localStorage.removeItem("monad-runner-aa-address");
      }, 0);
    } else if (previousAddressRef.current && 
               previousAddressRef.current !== connectedAddress && 
               previousAddressRef.current.toLowerCase() !== connectedAddress.toLowerCase()) {
      // User switched to a different wallet
      console.log(`Wallet switched from ${previousAddressRef.current} to ${connectedAddress}, resetting and checking status`);
      
      // First reset the state since this is a different wallet
      setIsAAEnabled(false);
      setAAAddress(null);
      
      // Clear any previous wallet's localStorage
      localStorage.removeItem("monad-runner-aa-enabled");
      localStorage.removeItem("monad-runner-aa-wallet");
      localStorage.removeItem("monad-runner-aa-address");
      
      // Now check blockchain status for the new wallet
      setTimeout(() => {
        lastCheckedAddressRef.current = connectedAddress;
        hasCheckedOnConnectionRef.current = false; // Force a fresh check on connection
        checkAAStatus(true);
      }, 500);
      
      // Update previous address reference
      previousAddressRef.current = connectedAddress;
    } else if (lastCheckedAddressRef.current !== connectedAddress) {
      // First connection or address changed, check status right away
      console.log(`First connection or address changed to ${connectedAddress}, checking status`);
      previousAddressRef.current = connectedAddress;
      
      setTimeout(() => {
        checkAAStatus(true);
      }, 500);
    }
    
    // Update previous address reference
    previousAddressRef.current = connectedAddress;
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
    
    // Listen for our AA status events as well, especially for force refresh
    const handleAAStatusEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      
      if (detail && detail.forceRefresh) {
        console.log("Received force refresh AA status event in useAAWallet");
        
        // Force a state update directly
        if (detail.smartAccountAddress && detail.isEnabled) {
          setAAAddress(detail.smartAccountAddress);
          setIsAAEnabled(true);
          
          // Refresh address in localStorage too, with a delay to avoid circular updates
          setTimeout(() => {
            localStorage.setItem("monad-runner-aa-enabled", "true");
            localStorage.setItem("monad-runner-aa-wallet", connectedAddress || "");
            localStorage.setItem("monad-runner-aa-address", detail.smartAccountAddress);
            
            // Instead of reloading, update the UI with notifications
            notification.success("Account Abstraction state updated", {
              icon: "✅",
              duration: 3000
            });
          }, 500);
        }
      }
    };
    
    window.addEventListener('localStorage-updated', handleCustomEvent as EventListener);
    window.addEventListener(AA_STATUS_EVENT, handleAAStatusEvent as EventListener);
    
    return () => {
      window.removeEventListener('localStorage-updated', handleCustomEvent as EventListener);
      window.removeEventListener(AA_STATUS_EVENT, handleAAStatusEvent as EventListener);
    };
  }, [checkAAStatus, connectedAddress, setAAAddress, setIsAAEnabled]);

  const enableAA = useCallback(async () => {
    if (!connectedAddress || !isConnected) {
      setError("Please connect your wallet first");
      return;
    }
    if (isEnabling) return;

    try {
      setIsEnabling(true);
      setError(null);

      // Instead of using connectedAddress directly for standard AA (non-EIP7702),
      // We need to get the computed smart account address
      let updatedAAAddress;
      
      try {
        // Get the smart account address using the helper function from aaWallet.ts
        // ALWAYS use index 1 to get different address than EOA
        updatedAAAddress = await getSmartAccountAddress(connectedAddress, 1);
        console.log(`Computed smart account address: ${updatedAAAddress}`);
      } catch (error) {
        console.error("Error getting smart account address:", error);
        
        // Create a fallback address that is guaranteed to be different from the EOA
        try {
          // Create a simple derived address
          const eoaWithoutPrefix = connectedAddress.slice(2).toLowerCase();
          // Change the first character to ensure it's different
          const modifiedHex = eoaWithoutPrefix.charAt(0) === 'a' ? 
            'b' + eoaWithoutPrefix.slice(1) : 
            'a' + eoaWithoutPrefix.slice(1);
          updatedAAAddress = `0x${modifiedHex}`;
          console.log(`Using fallback smart account address: ${updatedAAAddress}`);
        } catch (fallbackError) {
          console.error("Failed to create fallback address:", fallbackError);
          // This is a last resort, but it's better than using the same address
          updatedAAAddress = `0xF${connectedAddress.slice(3)}`;
        }
      }

      // Check if this user was previously registered with EIP-7702
      const previousAAWallet = localStorage.getItem("monad-runner-aa-wallet");
      const previousAAAddress = localStorage.getItem("monad-runner-aa-address");
      
      const isPreviouslyEIP7702 = previousAAWallet === connectedAddress && 
                                 previousAAAddress === connectedAddress;
      
      if (isPreviouslyEIP7702) {
        console.log("Detected previously registered EIP-7702 wallet, updating to standard AA");
        // This will trigger a re-registration with the correct computed address
        localStorage.removeItem("monad-runner-aa-enabled");
        localStorage.removeItem("monad-runner-aa-wallet");
        localStorage.removeItem("monad-runner-aa-address");
        
        // We'll need the modal to re-open for this user to complete the re-registration
        // The EnableAAModal will handle the registration with the correct smart account
      }

      // IMPORTANT: Don't immediately update localStorage with this state
      // We need to wait for the API to confirm the AA setup was successful
      // This happens in the EnableAAModal and the account creation process
      // Just update local state, but don't write to localStorage yet
      setAAAddress(updatedAAAddress);
      setIsAAEnabled(false); // Leave this as false until confirmed by API
      
      console.log(`Computed smart account address: ${updatedAAAddress}`);
      console.log(`Store will happen after API confirm. EOA: ${connectedAddress}`);
      
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
      return { success: true };
      
    } catch (err: any) {
      console.error("Error enabling AA wallet:", err);
      setError(err.message || "Failed to enable account abstraction");
      setIsAAEnabled(false);
      setAAAddress(null);
      return { success: false, error: err.message };
    } finally {
      setIsEnabling(false);
    }
  }, [connectedAddress, isConnected, setAAAddress, setIsAAEnabled, isEnabling]);

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
          error.message?.includes("ZeroDev paymaster doesn't support Monad Testnet") ||
          error.message?.includes("No bundler RPC found for chainId")
        ) {
          console.warn("ZeroDev doesn't fully support Monad Testnet yet, prompting user for manual signing...");
          
          const userConfirmed = window.confirm(
            "Gasless transactions are not yet supported on Monad Testnet. Do you want to manually sign the transaction? (This will cost gas fees.)"
          );
          
          if (!userConfirmed) {
            notification.error("Transaction canceled by user.");
            throw new Error("User declined manual signing.");
          }
          
          if (!params.functionName || !params.args) {
            notification.error("AA failed, and manual signing is unavailable.");
            throw new Error("ZeroDev AA failed, manual signing requires function name & args.");
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
            throw new Error("ZeroDev AA failed, and manual signing also failed.");
          }
        } else if (
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
    [isAAEnabled, aaAddress, connectedAddress, writeContractAsync, checkAAStatus]
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
