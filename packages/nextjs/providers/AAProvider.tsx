"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
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
  isEIP7702: boolean;
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
  isEIP7702: true,
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
  const [isEIP7702] = useLocalStorage<boolean>("monad-runner-eip7702", true);
  
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
  
  // Enhanced show modal with additional logging
  const showEnableModal = useCallback(() => {
    console.log("Opening AA enable modal for address:", connectedAddress);
    setShowModal(true);
  }, [connectedAddress]);
  
  // Enhanced hide modal with reset capabilities
  const hideEnableModal = useCallback(() => {
    console.log("Closing AA enable modal");
    setShowModal(false);
    setCurrentUsername(""); // Reset username
  }, []);
  
  // Robust username update handler
  const handleUsernameUpdate = useCallback(async (newUsername: string) => {
    console.log("Username update requested:", newUsername);
    setCurrentUsername(newUsername);
    return Promise.resolve();
  }, []);
  
  // Comprehensive success handler for modal
  const handleEnableSuccess = useCallback(async (signature: string, message: string) => {
    try {
      console.log("AA Modal succeeded with signature:", signature.substring(0, 10) + "...");
      
      // Use setTimeout to avoid state updates during render
      setTimeout(async () => {
        try {
          // Let the useAAWallet hook handle the enablement
          await enableAA();
          
          // Close the modal after a short delay to allow state to settle
          hideEnableModal();
        } catch (error) {
          console.error("Error in AA enable delayed handler:", error);
        }
      }, 0);
    } catch (error) {
      console.error("Error in AA enable success handler:", error);
    }
  }, [enableAA, hideEnableModal]);
  
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
          fromCache: detail.fromCache
        });
      }
    };
  
    window.addEventListener(AA_STATUS_EVENT, handleAAStatusChange);
    
    return () => {
      window.removeEventListener(AA_STATUS_EVENT, handleAAStatusChange);
    };
  }, []);
  
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
    isEIP7702,
    checkAAStatus
  };

  return (
    <AAContext.Provider value={contextValue}>
      {children}
      {showModal && (
        <EnableAAModal
          onSuccess={handleEnableSuccess}
          onClose={hideEnableModal}
          useEIP7702={isEIP7702}
          username={currentUsername}
          onUsernameUpdate={handleUsernameUpdate}
        />
      )}
    </AAContext.Provider>
  );
};