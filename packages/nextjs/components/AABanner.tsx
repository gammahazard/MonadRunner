"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useAA } from "~~/providers/AAProvider";
import { useAccount } from "wagmi";
import EnableAAModal from "./EnableAAModal";
import useMonadRunnerContractWithAA from "~~/hooks/useMonadRunnerContractWithAA";

const AABanner: React.FC = () => {
  const { isConnected, address: connectedAddress } = useAccount();
  const { isAAEnabled, isEnabling, hideEnableModal, enableAA } = useAA();
  const { isRegistered, playerData, registerPlayer, updateUsername, refreshAllData } = useMonadRunnerContractWithAA();
  
  const [showModal, setShowModal] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>("idle");
  const [localIsAAEnabled, setLocalIsAAEnabled] = useState(isAAEnabled);
  
  // Use refs to prevent any duplication issues
  const inProgressRef = useRef(false);
  const modalOpenRef = useRef(false);
  const processedSignatureRef = useRef<string | null>(null);

  // Update local state when isAAEnabled changes
  useEffect(() => {
    setLocalIsAAEnabled(isAAEnabled);
  }, [isAAEnabled]);

  // If not connected or AA is already enabled (either globally or locally), don't show the banner
  if (!isConnected || isAAEnabled || localIsAAEnabled) {
    return null;
  }

  // onUsernameUpdate: if the user is not registered, call registerPlayer to create a new player.
  // Otherwise, if already registered, update the username.
  const onUsernameUpdate = async (newUsername: string) => {
    console.log("Updating username to:", newUsername);
    if (!isRegistered) {
      await registerPlayer(newUsername);
    } else {
      await updateUsername(newUsername);
    }
  };

  // This function is called when the EnableAAModal processes a successful signature
  const handleModalSuccess = async (signature: string, message: string) => {
    // Prevent duplicate calls
    if (inProgressRef.current) return;
  
    try {
      inProgressRef.current = true;
  
      // Immediately update local storage
      localStorage.setItem("monad-runner-aa-enabled", "true");
      localStorage.setItem("monad-runner-aa-address", connectedAddress || "");
  
      // Trigger a global event to update state across components
      window.dispatchEvent(new CustomEvent('aa-status-changed', {
        detail: {
          isEnabled: true,
          address: connectedAddress
        }
      }));
  
      // Update local state 
      setLocalIsAAEnabled(true);
  
      // Call global enable method
      await enableAA();
  
      // Refresh data to reflect new state
      await refreshAllData();
  
      // Close modal
      closeModal();
    } catch (error) {
      console.error("AA Enable Error:", error);
      
      // Reset on failure
      localStorage.removeItem("monad-runner-aa-enabled");
      localStorage.removeItem("monad-runner-aa-address");
      setLocalIsAAEnabled(false);
    } finally {
      inProgressRef.current = false;
    }
  };

  const openModal = () => {
    if (modalOpenRef.current) return;
    
    setCurrentStage("idle");
    setShowModal(true);
    modalOpenRef.current = true;
    inProgressRef.current = false;
    processedSignatureRef.current = null;
  };

  const closeModal = () => {
    if (!modalOpenRef.current) return;
    
    setShowModal(false);
    setCurrentStage("idle");
    modalOpenRef.current = false;
    if (hideEnableModal) hideEnableModal();
  };

  return (
    <>
      <div className="alert alert-info shadow-lg mb-4">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
               className="stroke-current flex-shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <h3 className="font-bold">Play without gas fees or signing!</h3>
            <div className="text-xs">Enable Account Abstraction to enjoy gasless transactions on Monad.</div>
          </div>
        </div>
        <div className="flex-none">
          <button 
            className="btn btn-sm" 
            onClick={openModal}
            disabled={isEnabling || inProgressRef.current}
          >
            {isEnabling || inProgressRef.current ? (
              <>
                <span className="loading loading-spinner loading-xs mr-1"></span>
                Enabling...
              </>
            ) : (
              "Enable Now"
            )}
          </button>
        </div>
      </div>

      {showModal && (
        <EnableAAModal
          onSuccess={handleModalSuccess}
          onClose={closeModal}
          useEIP7702={true}
          initialStage={currentStage}
          username={playerData?.username || ""}
          onUsernameUpdate={onUsernameUpdate}
        />
      )}
    </>
  );
};

export default AABanner;