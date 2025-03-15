"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useSession } from "~~/providers/SessionProvider";
import { FaLock, FaCheckCircle, FaHourglassHalf, FaKey, FaExclamationTriangle } from "react-icons/fa";

interface CreateSessionModalProps {
  onSuccess?: () => void;
  onClose: () => void;
}

const CreateSessionModal: React.FC<CreateSessionModalProps> = ({ onSuccess, onClose }) => {
  const { address: connectedAddress } = useAccount();
  const { createSession, isCreatingSession, isSessionValid } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(24); // Default 24 hours

  // Duration options in hours
  const durationOptions = [
    { value: 1, label: "1 Hour" },
    { value: 2, label: "2 Hours" },
    { value: 6, label: "6 Hours" },
    { value: 12, label: "12 Hours" },
    { value: 24, label: "24 Hours" },
    { value: 48, label: "48 Hours" },
  ];

  // Handle create session
  const handleCreateSession = async () => {
    if (!connectedAddress) {
      setError("Please connect your wallet first");
      return;
    }

    setError(null);
    try {
      // Convert hours to seconds
      const durationInSeconds = selectedDuration * 60 * 60;
      const success = await createSession(durationInSeconds);
      
      if (success) {
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError("Failed to create session. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  };

  // Check for existing valid session on mount
  useEffect(() => {
    console.log('Checking session validity in CreateSessionModal:', isSessionValid());
    // Temporarily disable auto-close to debug the modal
    // if (isSessionValid()) {
    //   // Modal should auto-close if session is valid
    //   onClose();
    // }
  }, [isSessionValid]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" style={{ zIndex: 9999 }}>
      <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 max-w-md relative">
        <h2 className="text-2xl font-bold mb-4">Create Session</h2>
        
        <p className="mb-6">
          Create a session key to play the game without signing each transaction. Your session will expire after the selected time.
        </p>
        
        <div className="mb-6">
          <label className="form-control w-full">
            <div className="label">
              <span className="label-text">Session Duration</span>
            </div>
            <select 
              className="select select-bordered w-full" 
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Number(e.target.value))}
              disabled={isCreatingSession}
            >
              {durationOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        
        <div className="mb-6 p-4 bg-base-200 rounded-lg text-sm">
          <div className="flex items-start mb-2">
            <FaKey className="text-secondary mr-2 mt-1" />
            <div>
              <p className="font-medium">What are session keys?</p>
              <p className="opacity-70">Session keys allow you to play without signing every transaction. They're stored securely in your browser.</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <FaLock className="text-primary mr-2 mt-1" />
            <div>
              <p className="font-medium">Are session keys secure?</p>
              <p className="opacity-70">Yes! Session keys have limited permissions and expire automatically. You can revoke them at any time.</p>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="alert alert-error mb-4">
            <FaExclamationTriangle className="w-6 h-6 mr-2" />
            <span>{error}</span>
          </div>
        )}
        
        <div className="flex justify-between">
          <button 
            onClick={onClose} 
            className="btn btn-outline" 
            disabled={isCreatingSession}
          >
            Cancel
          </button>
          
          <button
            onClick={handleCreateSession}
            className="btn btn-primary"
            disabled={isCreatingSession || !connectedAddress}
          >
            {isCreatingSession ? (
              <>
                <FaHourglassHalf className="mr-2 animate-pulse" />
                Creating Session...
              </>
            ) : (
              <>
                <FaKey className="mr-2" />
                Create Session
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateSessionModal;