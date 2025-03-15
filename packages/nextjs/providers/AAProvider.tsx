"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { useLocalStorage } from "~~/hooks/useLocalStorage";
import { useAAWallet, AA_STATUS_EVENT } from "~~/hooks/useAAWallet";
import EnableAAModal from "~~/components/EnableAAModal";
import deployedContracts from "~~/contracts/deployedContracts";

// Define the context type first
interface AAContextType {
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
  showEnableModal: () => void;
  hideEnableModal: () => void;
  isModalOpen: boolean;
  contractAddress: string;
  contractAbi: any[];
  checkAAStatus: () => Promise<void>;
}

// Create the context with an explicit type and initial value
const AAContext = createContext<AAContextType>({
  isAAEnabled: false,
  aaAddress: null,
  isEnabling: false,
  error: null,
  enableAA: async () => {},
  sendAATransaction: async () => '',
  showEnableModal: () => {},
  hideEnableModal: () => {},
  isModalOpen: false,
  contractAddress: '',
  contractAbi: [],
  checkAAStatus: async () => {}
});

// Hook to use the AA context
export const useAA = () => {
  const context = useContext(AAContext);
  return context;
};

// Provider props interface
interface AAProviderProps {
  children: ReactNode;
}

// The main AA Provider component
export const AAProvider: React.FC<AAProviderProps> = ({ children }) => {
  const { address: connectedAddress, isConnected } = useAccount();
  const [showModal, setShowModal] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string>("");
  
  // Get the game contract details from deployed contracts
  const chainId = 10143; // Monad Testnet
  const contractData = deployedContracts[chainId].MonadRunnerGame;
  const contractAddress = contractData.address;
  const contractAbi = contractData.abi;
  
  // Use our hook to get AA functionality 
  const {
    isAAEnabled,
    aaAddress,
    isEnabling,
    error,
    enableAA,
    sendAATransaction,
    checkAAStatus
  } = useAAWallet();
  
  // Track the last status check to prevent multiple requests
  const lastAAStatusCheckRef = useRef<number>(0);
  
  // Force a blockchain check when a user connects, but limit frequency
  useEffect(() => {
    if (isConnected && connectedAddress) {
      const now = Date.now();
      const timeSinceLastCheck = now - lastAAStatusCheckRef.current;
      
      // Only check once per 10 seconds
      if (timeSinceLastCheck < 10000) {
        console.log(`Skipping connection status check, last check was ${timeSinceLastCheck}ms ago`);
        return;
      }
      
      console.log("Wallet connected, checking blockchain for existing AA status");
      lastAAStatusCheckRef.current = now;
      
      // Delay check to avoid race conditions with other initialization
      setTimeout(() => {
        checkAAStatus(true);
      }, 1000);
    }
  }, [isConnected, connectedAddress, checkAAStatus]);
  
  // Enhanced show modal with additional logging
  const showEnableModal = useCallback(() => {
    console.log("Opening AA enable modal for address:", connectedAddress);
    setShowModal(true);
  }, [connectedAddress]);
  
  // Enhanced hide modal - keep username!
  const hideEnableModal = useCallback(() => {
    console.log("Closing AA enable modal - preserving username:", currentUsername);
    setShowModal(false);
    // Don't reset username - we want to remember it for next time!
    // This ensures if user sets username but cancels AA, we remember it
  }, [currentUsername]);
  
  // Robust username update handler
  const handleUsernameUpdate = useCallback(async (newUsername: string) => {
    console.log("Username update requested:", newUsername);
    
    // Store username in state for form purposes only
    // The real validation happens when the transaction is confirmed on-chain
    setCurrentUsername(newUsername);
    
    // Let calling component handle the actual transaction
    return Promise.resolve();
  }, []);
  
  // Comprehensive success handler for modal
  const handleEnableSuccess = useCallback(async (signature: string, message: string) => {
    try {
      console.log("AA Modal succeeded with signature:", signature.substring(0, 10) + "...");
      
      // DO NOT update anything here - we need to wait for the API to confirm
      // The actual smart account address will come from the API response in EnableAAModal
      console.log("Waiting for API response with smart account address");
      
      // Let the EnableAAModal handle the localStorage updates after API confirmation
      // This prevents showing AA as enabled when it actually failed
      
      // Instead of an automatic reload, notify the user with a message
      console.log("AA enablement reported successful, updating state without reload");
      
      // Run the normal flow without automatic reloads
      setTimeout(async () => {
        try {
          // Let the useAAWallet hook handle the enablement
          await enableAA();
          
          console.log("AA enablement successful, state updated");
          
          // Instead of reloading, dispatch a custom event to notify components
          window.dispatchEvent(
            new CustomEvent(AA_STATUS_EVENT, {
              detail: {
                isEnabled: true,
                address: connectedAddress,
                smartAccountAddress: aaAddress,
                timestamp: Date.now(),
                isDefinitive: true,
                avoidReload: true
              },
            })
          );
          
          // Show a notification to the user
          notification.success(
            "Account Abstraction enabled successfully! Enjoy gasless transactions.",
            { icon: "✅" }
          );
        } catch (error) {
          console.error("Error in AA enable handler:", error);
          notification.error(
            "There was an issue enabling Account Abstraction, but your account may still be enabled.",
            { icon: "⚠️" }
          );
        }
      }, 500);
    } catch (error) {
      console.error("Error in AA enable success handler:", error);
      hideEnableModal();
    }
  }, [enableAA, hideEnableModal, connectedAddress]);
  
  // Listen for AA status changes from any component
  // BUT - don't force a network check, just update local state
  useEffect(() => {
    const handleAAStatusChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail;
      
      // Update provider state based on event rather than triggering a status check
      if (detail && (detail.isEnabled !== undefined || detail.smartAccountAddress)) {
        console.log("Received AA status update event:", {
          isEnabled: detail.isEnabled,
          address: detail.smartAccountAddress,
          fromCache: detail.fromCache,
          fromRateLimit: detail.fromRateLimit
        });
        
        // If this is from a rate limit response with a confirmed smart account address
        if (detail.fromRateLimit && detail.smartAccountAddress && detail.isEnabled) {
          console.log("Detected rate-limited smart account in provider:", detail.smartAccountAddress);
          
          // Set directly to localStorage from this event
          try {
            localStorage.setItem("monad-runner-aa-enabled", "true");
            localStorage.setItem("monad-runner-aa-wallet", connectedAddress || "");
            localStorage.setItem("monad-runner-aa-address", detail.smartAccountAddress);
            console.log("Updated localStorage with rate-limited AA data");
          } catch (e) {
            console.error("Failed to update localStorage with rate-limited AA data:", e);
          }
          
          // Force a status check to pick up the new localStorage values
          setTimeout(() => {
            checkAAStatus(true);
          }, 100);
        }
      }
    };
  
    window.addEventListener(AA_STATUS_EVENT, handleAAStatusChange);
    
    return () => {
      window.removeEventListener(AA_STATUS_EVENT, handleAAStatusChange);
    };
  }, [connectedAddress, checkAAStatus]);
  
  // No need for a duplicate check in the provider
  // The useAAWallet hook already checks on connection
  // Removing this to prevent duplicate API calls
  
  // Provide the context value
  const contextValue: AAContextType = {
    isAAEnabled,
    aaAddress,
    isEnabling,
    error,
    enableAA,
    sendAATransaction,
    showEnableModal,
    hideEnableModal,
    isModalOpen: showModal,
    contractAddress,
    contractAbi,
    checkAAStatus
  };

  return (
    <AAContext.Provider value={contextValue}>
      {children}
      {showModal && (
        <EnableAAModal
          onSuccess={handleEnableSuccess}
          onClose={hideEnableModal}
          username={currentUsername}
          onUsernameUpdate={handleUsernameUpdate}
        />
      )}
    </AAContext.Provider>
  );
};