"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAA } from "~~/providers/AAProvider";
import { useAccount } from "wagmi";
import useMonadRunnerContractWithAA from "~~/hooks/useMonadRunnerContractWithAA";
import { AA_STATUS_EVENT } from "~~/hooks/useAAWallet";

const AABanner: React.FC = () => {
  const { isConnected, address: connectedAddress } = useAccount();
  const { isAAEnabled, isEnabling, showEnableModal, checkAAStatus } = useAA();
  const { isRegistered } = useMonadRunnerContractWithAA();
  
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [loading, setLoading] = useState(true); // Declare at top level
  const previousAddressRef = useRef<string | null>(null);
  
  // Check if wallet changed and force a fresh status check
  useEffect(() => {
    if (isConnected && connectedAddress) {
      if (previousAddressRef.current && 
          previousAddressRef.current !== connectedAddress &&
          previousAddressRef.current.toLowerCase() !== connectedAddress.toLowerCase()) {
        console.log("Wallet changed in AABanner, forcing fresh status check");
        
        // Force loading state while we check
        setLoading(true);
        
        // Use timeout to avoid state updates during render
        setTimeout(() => {
          // Force a blockchain check to update UI with new wallet status
          checkAAStatus(true);
        }, 500);
      }
      
      // Update reference
      previousAddressRef.current = connectedAddress;
    } else {
      // Reset when disconnected
      previousAddressRef.current = null;
    }
  }, [isConnected, connectedAddress, checkAAStatus]);

  // Define the handler outside of any conditional logic
  const handleEnableClick = useCallback(() => {
    setIsButtonDisabled(true);
    try {
      showEnableModal();
    } catch (error) {
      console.error("Error showing enable modal:", error);
    } finally {
      // Reset button after a short delay
      setTimeout(() => setIsButtonDisabled(false), 1000);
    }
  }, [showEnableModal]);
  
  // Effect for loading state with longer delay
  useEffect(() => {
    if (isConnected) {
      // Set a much longer timeout to wait for status check
      // This ensures we don't show the banner prematurely
      const timer = setTimeout(() => {
        // Check one more time before showing banner
        checkAAStatus(true);
        
        // Set loading to false after a delay
        setTimeout(() => {
          setLoading(false);
        }, 1000);
      }, 8000); // 8 seconds should be enough for most API calls to complete
      
      // Also listen for AA status events to stop loading early if we get a response
      const handleAAStatusEvent = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        console.log("AA status event received in banner:", detail);
        
        // If we receive a status update indicating AA is enabled, stay in loading state to hide banner
        if (detail && detail.isEnabled === true) {
          console.log("AA is enabled from event, keeping banner hidden");
          setLoading(true);
          
          // If we receive a forceRefresh flag, reload the page
          if (detail.forceRefresh) {
            console.log("Received force refresh flag, reloading page");
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
        } else {
          // Otherwise, stop loading to show the banner
          setTimeout(() => {
            setLoading(false);
          }, 500);
        }
      };
      
      window.addEventListener(AA_STATUS_EVENT, handleAAStatusEvent);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener(AA_STATUS_EVENT, handleAAStatusEvent);
      };
    } else {
      setLoading(true);
    }
  }, [isConnected]);
  
  // Watch isAAEnabled to update loading state
  useEffect(() => {
    if (isAAEnabled) {
      // If AA becomes enabled, immediately hide the banner
      setLoading(true);
    }
  }, [isAAEnabled]);
  
  // If user is connected and AA is not enabled, and we've waited to check
  if (!isConnected || isAAEnabled || loading) {
    return null;
  }

  return (
    <div className="alert alert-info shadow-lg mb-4">
      <div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
             className="stroke-current flex-shrink-0 w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <>
            <h3 className="font-bold">Play without gas fees or signing!</h3>
            <div className="text-xs">Enable Account Abstraction to enjoy gasless transactions on Monad.</div>
          </>
        </div>
      </div>
      <div className="flex-none">
        <button 
          className="btn btn-sm" 
          onClick={handleEnableClick}
          disabled={isEnabling || isButtonDisabled}
        >
          {isEnabling ? (
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
  );
};

export default AABanner;