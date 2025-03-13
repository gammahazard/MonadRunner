"use client";

import React from "react";
import { useAA } from "~~/providers/AAProvider";
import { useAccount } from "wagmi";
import EnableAAModal from "./EnableAAModal";

const AABanner: React.FC = () => {
  const { isConnected, address: connectedAddress } = useAccount();
  const { 
    isAAEnabled, 
    aaAddress, 
    showEnableModal, 
    hideEnableModal, 
    isModalOpen 
  } = useAA();

  // Don't show the banner when not connected or AA is already enabled
  if (!isConnected || isAAEnabled) return null;

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
            <h3 className="font-bold">Play without gas fees!</h3>
            <div className="text-xs">Enable Account Abstraction to enjoy gasless transactions on Monad.</div>
          </div>
        </div>
        <div className="flex-none">
          <button className="btn btn-sm" onClick={showEnableModal}>
            Enable Now
          </button>
        </div>
      </div>

      {isModalOpen && (
  <EnableAAModal 
    onSuccess={(signature, message) => {
      fetch('/api/aa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          message,
          walletAddress: connectedAddress,
        }),
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to enable account abstraction');
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.smartAccountAddress) {
          hideEnableModal();
          // Optionally update AA state in your provider
        }
      })
      .catch(error => {
        console.error('Error enabling AA:', error);
        // The modal will handle error state
      });
    }} 
    onClose={hideEnableModal} 
  />
)}
    </>
  );
};

export default AABanner;