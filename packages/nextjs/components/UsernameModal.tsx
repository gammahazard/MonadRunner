"use client";

import React, { useState, useEffect } from "react";

interface UsernameModalProps {
  walletAddress: string;
  onComplete: (username: string) => void;
  onCancel: () => void;
}

const UsernameModal: React.FC<UsernameModalProps> = ({ walletAddress, onComplete, onCancel }) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Add rate limit protection - track the last submission time
  const [lastSubmitTime, setLastSubmitTime] = useState(0);
  
  // Setup persistent retry mechanism
  useEffect(() => {
    // Initialize persistent state on window object
    window.isRateLimited = window.isRateLimited || false;
    window.rateLimitRetryCount = window.rateLimitRetryCount || 0;
    window.pendingUsername = window.pendingUsername || "";
    
    // Setup a persistent retry mechanism
    let retryTimer: ReturnType<typeof setTimeout>;
    
    if (window.isRateLimited && window.pendingUsername) {
      const retryDelay = Math.min(2000 * Math.pow(1.5, window.rateLimitRetryCount), 10000);
      console.log(`Setting up retry in ${retryDelay}ms (attempt ${window.rateLimitRetryCount + 1})`);
      
      retryTimer = setTimeout(() => {
        console.log(`Auto-retrying username registration for: ${window.pendingUsername}`);
        window.isRateLimited = false;
        window.rateLimitRetryCount++;
        
        // Set the username in the form
        setUsername(window.pendingUsername);
        
        // Keep loading state, but show retry attempt number
        setLoading(true);
        setError(`Auto-retrying... Attempt #${window.rateLimitRetryCount} of 10`);
        
        // Auto-submit the form after a brief delay
        setTimeout(() => {
          const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
          handleSubmit(fakeEvent);
        }, 100);
      }, retryDelay);
    }
    
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check global rate limit flag
    if (window.isRateLimited) {
      // Just show loading, don't show error
      setLoading(true);
      // Show attempt number if we have it
      if (window.rateLimitRetryCount) {
        setError(`Auto-retrying... Attempt #${window.rateLimitRetryCount} of 10`);
      } else {
        setError("");
      }
      return;
    }
    
    // Add rate limiting protection - only allow one submission every 3 seconds
    const now = Date.now();
    const timeSinceLastSubmit = now - lastSubmitTime;
    const MIN_SUBMIT_INTERVAL = 3000; // 3 seconds minimum between submissions
    
    if (timeSinceLastSubmit < MIN_SUBMIT_INTERVAL) {
      const waitTime = Math.ceil((MIN_SUBMIT_INTERVAL - timeSinceLastSubmit) / 1000);
      setError(`Please wait ${waitTime} seconds before trying again to avoid rate limits`);
      return;
    }
    
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    
    if (username.length > 20) {
      setError("Username must be 20 characters or less");
      return;
    }
    
    try {
      // Update last submit time
      setLastSubmitTime(now);
      setLoading(true);
      setError("Sending transaction to blockchain...");
      console.log("Submitting username:", username.trim());
      
      // Call the parent's onComplete with the trimmed username.
      await onComplete(username.trim());
      
      // Reset the modal state after success.
      setUsername("");
      setError("");
      setLoading(false);
    } catch (error) {
      console.error("Error setting username:", error);
      
      // Handle user rejection specially - don't trigger auto-retry for these
      if (error instanceof Error && 
          (error.message.includes("User denied") || 
           error.message.includes("User rejected"))) {
        
        // Clear any pending username to avoid auto-retry
        window.pendingUsername = "";
        window.isRateLimited = false;
        window.rateLimitRetryCount = 0;
        
        // Just reset the loading state - no error message needed
        // We'll return to the username form to try again
        setError("");
        setLoading(false);
        return;
      }
      
      // Special handling for rate limit errors with persistent retry
      if (error instanceof Error && 
          (error.message.includes("rate limit") || 
           error.message.includes("429") ||
           error.message.includes("requests limited"))) {
        
        // Store username and setup for auto-retry
        const trimmedName = username.trim();
        if (trimmedName) {
          // Store for future retries
          window.pendingUsername = trimmedName;
          window.isRateLimited = true;
          
          // Increment retry count if already set, otherwise initialize to 0
          window.rateLimitRetryCount = (window.rateLimitRetryCount || 0) + 1;
          
          // Calculate delay with exponential backoff
          const retryDelay = Math.min(2000 * Math.pow(1.5, window.rateLimitRetryCount), 10000);
          
          // Show informative message about auto-retry
          setError(`Rate limited. Will retry in ${Math.ceil(retryDelay/1000)} seconds... (Attempt #${window.rateLimitRetryCount} of 10)`);
          // Keep showing loading spinner
          setLoading(true);
          
          // We don't need to set a timeout here as the useEffect will handle it
        } else {
          setError("Username cannot be empty");
        }
      } else {
        setError(error instanceof Error ? error.message : "Failed to set username");
      }
      
      // Only reset loading state for non-rate-limit errors
      // Rate limit errors will keep showing the loading spinner
      if (!(error instanceof Error && 
          (error.message.includes("rate limit") || 
           error.message.includes("429") ||
           error.message.includes("requests limited")))) {
        setLoading(false);  
      }
    }
  };

  // Check if a previously stored username is available when component mounts
  useEffect(() => {
    // If we have a pending username from a previous attempt, use it
    if (window.pendingUsername && !username) {
      setUsername(window.pendingUsername);
    }
  }, [username]);
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Set Your On-Chain Username</h2>
        <p className="mb-6 text-center opacity-80">
          Choose a username that will be stored on the Monad blockchain (you will need gas).
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Username</span>
            </label>
            <input
              type="text"
              placeholder="Enter your username"
              className="input input-bordered w-full"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError("");
              }}
              maxLength={20}
              autoFocus
            />
            {error && <div className="text-error text-sm mt-2">{error}</div>}
          </div>
          
          <div className="flex justify-between mt-6">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                // Reset state on cancel
                setUsername("");
                setError("");
                setLoading(false);
                
                // Clear pending username
                window.pendingUsername = "";
                window.isRateLimited = false;
                
                onCancel();
              }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                "Save On-Chain"
              )}
            </button>
          </div>
          
          <div className="mt-4 text-xs text-center opacity-70">
            This will create a transaction on the Monad blockchain
          </div>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;
