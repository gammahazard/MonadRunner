// components/UsernameModal.tsx
"use client";

import React, { useState } from "react";

interface UsernameModalProps {
  walletAddress: string;
  onComplete: () => void;
  onCancel: () => void;
}

const UsernameModal: React.FC<UsernameModalProps> = ({ walletAddress, onComplete, onCancel }) => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    
    if (username.length > 20) {
      setError("Username must be 20 characters or less");
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch("/api/game/username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletAddress,
          username: username.trim(),
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to set username");
      }
      
      onComplete();
    } catch (error) {
      console.error("Error setting username:", error);
      setError(error instanceof Error ? error.message : "Failed to set username");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-center">Set Your Username</h2>
        <p className="mb-6 text-center opacity-80">
          Before you start playing, choose a username for the leaderboard.
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
              onClick={onCancel}
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
                "Save & Play"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UsernameModal;