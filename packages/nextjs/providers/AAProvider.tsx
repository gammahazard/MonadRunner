"use client";

import React, { useRef, createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAccount } from "wagmi";
import { useLocalStorage } from "~~/hooks/useLocalStorage";
import { useAAWallet } from "~~/hooks/useAAWallet";
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
  isEIP7702: true
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
  const [isEIP7702, setIsEIP7702] = useLocalStorage<boolean>("monad-runner-eip7702", true);
  
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
    sendAATransaction
  } = useAAWallet();
  
  // Enhanced show modal with additional logging and state management
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
  
  // Comprehensive success handler with enhanced persistence
  const handleEnableSuccess = useCallback(async (signature: string, message: string) => {
    try {
      console.log("AA Modal succeeded with signature:", signature.substring(0, 10) + "...");
      
      // Persist AA status with timestamp for potential future validation
      const persistenceData = {
        enabled: true,
        address: connectedAddress,
        timestamp: Date.now()
      };
      
      localStorage.setItem("monad-runner-aa-state", JSON.stringify(persistenceData));
      
      // Refresh our local AA state 
      await enableAA();
      
      // Close the modal
      hideEnableModal();
    } catch (error) {
      console.error("Error in AA enable success handler:", error);
      
      // Clean up local storage if something goes wrong
      localStorage.removeItem("monad-runner-aa-state");
    }
  }, [connectedAddress, enableAA, hideEnableModal]);
  
  // Side effect to handle AA state across wallet connections
  const attemptedAA = useRef(false);
  useEffect(() => {
    if (!isConnected) {
      localStorage.removeItem("monad-runner-aa-state");
      attemptedAA.current = false;
    } else if (!isAAEnabled && !attemptedAA.current) { 
      const storedState = localStorage.getItem("monad-runner-aa-state");
      if (storedState) {
        try {
          const parsedState = JSON.parse(storedState);
          if (parsedState.address === connectedAddress) {
            attemptedAA.current = true;
            enableAA();
          }
        } catch (error) {
          console.error("Error parsing stored AA state:", error);
          localStorage.removeItem("monad-runner-aa-state");
        }
      }
    }
  }, [isConnected, connectedAddress, enableAA, isAAEnabled]);
  
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
    isEIP7702
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