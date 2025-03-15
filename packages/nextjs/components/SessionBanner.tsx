"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useSession } from "~~/providers/SessionProvider";
import { FaKey, FaHourglassEnd, FaClock, FaBug } from "react-icons/fa";

const SessionBanner: React.FC = () => {
  const { address: connectedAddress } = useAccount();
  const { 
    isSessionEnabled, 
    isSessionValid, 
    revokeSession,
    getSessionTimeLeft, 
    getSessionTimeLeftPercentage, 
    showCreateSessionModal,
    sessionKey
  } = useSession();

  const [timeLeft, setTimeLeft] = useState<string>("--:--:--");
  const [showBanner, setShowBanner] = useState(false);
  const [percentage, setPercentage] = useState(100);
  const [showDetails, setShowDetails] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Format time in hours, minutes, seconds
  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return "00:00:00";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [hours, minutes, secs]
      .map(val => val.toString().padStart(2, "0"))
      .join(":");
  };

  // Add a ready state to handle hydration properly
  const [isReady, setIsReady] = useState(false);
  
  // Set ready state after initial render to avoid hydration mismatch
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Update timer display
  useEffect(() => {
    // Don't run anything until after hydration is complete
    if (!isReady) return;
    
    // Clear existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    console.log('SESSION BANNER - Session state check:', {
      connectedAddress,
      isSessionEnabled,
      isValid: isSessionValid(),
      timeLeft: getSessionTimeLeft(),
      percentage: getSessionTimeLeftPercentage()
    });

    // Only run timer if we have a session
    if (!connectedAddress || !isSessionEnabled || !isSessionValid()) {
      console.log('SESSION BANNER - Hiding banner, no valid session');
      setShowBanner(false);
      return;
    }

    setShowBanner(true);
    
    // Update time immediately
    const updateTime = () => {
      const secondsLeft = getSessionTimeLeft();
      setTimeLeft(formatTime(secondsLeft));
      setPercentage(getSessionTimeLeftPercentage());
      
      // Hide banner when session expires
      if (secondsLeft <= 0) {
        setShowBanner(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
    };
    
    updateTime();
    
    // Setup interval to update every second
    timerRef.current = setInterval(updateTime, 1000);
    
    // Cleanup
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isReady, connectedAddress, isSessionEnabled, isSessionValid, getSessionTimeLeft, getSessionTimeLeftPercentage]);

  // Don't show anything if no wallet connected
  if (!connectedAddress) {
    return null;
  }

  // Don't show anything if not relevant
  if (!showBanner) {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 w-full">
      <div className="bg-primary/10 backdrop-blur-sm p-2 border-b border-primary/20">
        <div className="container mx-auto flex items-center justify-between px-4">
          <div 
            className="flex items-center space-x-2 cursor-pointer hover:text-primary transition-colors" 
            onClick={() => setShowDetails(true)}
            title="Click for session details"
          >
            <FaKey className="text-primary" />
            <span className="text-sm">
              Session active for <span className="font-mono font-bold">{timeLeft}</span>
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Progress bar */}
            <div className="w-24 h-2 bg-base-300 rounded-full overflow-hidden">
              <div 
                className={`h-full ${percentage > 20 ? 'bg-primary' : 'bg-error'} transition-all duration-500`} 
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
            
            {/* Low time warning */}
            {percentage <= 20 && (
              <button 
                onClick={showCreateSessionModal}
                className="btn btn-xs btn-warning"
              >
                <FaHourglassEnd className="mr-1" />
                Extend
              </button>
            )}
            
            {/* Revoke button */}
            <button 
              onClick={() => revokeSession()}
              className="btn btn-xs btn-outline btn-error"
            >
              Revoke
            </button>
          </div>
        </div>
      </div>
      
      {/* Session Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-base-100 rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Session Details</h3>
              <button 
                onClick={() => setShowDetails(false)}
                className="btn btn-sm btn-ghost"
              >
                &times;
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <tbody>
                  <tr>
                    <td className="font-semibold">Session Status</td>
                    <td className="text-success">Active</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Time Remaining</td>
                    <td>{timeLeft}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Expires</td>
                    <td>{sessionKey?.validUntil ? new Date(sessionKey.validUntil * 1000).toLocaleString() : 'Unknown'}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Session Key</td>
                    <td className="truncate max-w-[200px]">
                      {sessionKey?.sessionPublicKey?.substring(0, 20)}...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 flex justify-between flex-wrap gap-2">
              <button 
                onClick={() => {
                  setShowDetails(false);
                  showCreateSessionModal();
                }} 
                className="btn btn-sm btn-primary"
              >
                Extend Session
              </button>
              
              <button 
                onClick={() => {
                  revokeSession();
                  setShowDetails(false);
                }} 
                className="btn btn-sm btn-outline btn-error"
              >
                Revoke Session
              </button>
              
              <Link 
                href="/session-debug" 
                className="btn btn-sm btn-outline btn-info mt-2 w-full flex justify-center items-center"
                onClick={() => setShowDetails(false)}
              >
                <FaBug className="mr-2" />
                Advanced Session Debug
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionBanner;