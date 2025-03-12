// monad-app/packages/nextjs/components/ReplayListModal.tsx
"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ReplayNoSSR = dynamic(() => import("./Replay"), {
  ssr: false,
  loading: () => <div>Loading Replay...</div>,
});
interface Replay {
  walletAddress: string;
  username?: string;
  score: number;
  replayData: any[];
  playedAt: string;
}

interface ReplayListModalProps {
  walletAddress?: string;
  onClose: () => void;
  onSelectReplay?: (replay: Replay) => void;
}

const ReplayListModal: React.FC<ReplayListModalProps> = ({ 
  walletAddress, 
  onClose,
  onSelectReplay
}) => {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReplay, setSelectedReplay] = useState<Replay | null>(null);
  const [replayScore, setReplayScore] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'user' | 'all'>('user');
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Get the replay filter from localStorage
    const filter = localStorage.getItem('replayFilter') as 'user' | 'all';
    if (filter) {
      setViewMode(filter);
      // Clear the filter after using it
      localStorage.removeItem('replayFilter');
    }
  }, []);
  
  const fetchUserReplays = async (address: string) => {
    if (!address) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Use the correct path based on your NextJS API route
      const endpoint = `/api/game/replay/${address}`;
      console.log("[ReplayListModal] Fetching user replays for", address);
      console.log(`[ReplayListModal] Making request to: ${endpoint}`);
      
      const res = await fetch(endpoint);
      console.log(`[ReplayListModal] Response status: ${res.status}`);
      
      if (!res.ok) {
        // If the specific user replay endpoint fails, fall back to all replays and filter
        console.log("[ReplayListModal] User replay endpoint failed, falling back to all replays");
        await fetchAllReplaysAndFilter(address);
        return;
      }
      
      const data = await res.json();
      console.log("[ReplayListModal] Response data:", data);
      
      if (data.data?.replays) {
        if (!Array.isArray(data.data.replays)) {
          setReplays([]);
          throw new Error('Invalid replay data format');
        }
        
        const sorted = data.data.replays.sort((a: Replay, b: Replay) => b.score - a.score);
        setReplays(sorted);
        console.log("[ReplayListModal] Fetched", sorted.length, "replays");
      } else {
        console.error("[ReplayListModal] No replays found in response:", data);
        setReplays([]);
      }
    } catch (err) {
      console.error("[ReplayListModal] Error fetching replays:", err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching replays');
      // Try fetching all replays as a fallback and filter client-side
      await fetchAllReplaysAndFilter(address);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchAllReplaysAndFilter = async (address?: string) => {
    try {
      const allReplays = await fetchAllReplaysInternal();
      
      if (address && allReplays.length > 0) {
        // Filter to just this user's replays
        const userReplays = allReplays.filter(replay => 
          replay.walletAddress && 
          replay.walletAddress.toLowerCase() === address.toLowerCase()
        );
        
        if (userReplays.length > 0) {
          console.log(`[ReplayListModal] Filtered ${userReplays.length} replays for address ${address}`);
          setReplays(userReplays);
          setError(null);
          return;
        } else {
          console.log(`[ReplayListModal] No replays found for address ${address} after filtering`);
          setReplays([]);
        }
      }
    } catch (err) {
      console.error("[ReplayListModal] Error in fallback replay filtering:", err);
    }
  };
  
  const fetchAllReplaysInternal = async (): Promise<Replay[]> => {
    try {
      const endpoint = "/api/game/replays";
      console.log(`[ReplayListModal] Making request to: ${endpoint}`);
      
      const res = await fetch(endpoint);
      console.log(`[ReplayListModal] Response status: ${res.status}`);
      
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data.data?.replays && Array.isArray(data.data.replays)) {
        return data.data.replays.sort((a: Replay, b: Replay) => b.score - a.score);
      }
      
      return [];
    } catch (err) {
      console.error("[ReplayListModal] Error fetching all replays:", err);
      throw err;
    }
  };
  
  const fetchAllReplays = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const replays = await fetchAllReplaysInternal();
      setReplays(replays);
      console.log("[ReplayListModal] Fetched", replays.length, "replays");
      
    } catch (err) {
      console.error("[ReplayListModal] Error in fetchAllReplays:", err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching replays');
      setReplays([]);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (viewMode === 'user' && walletAddress) {
      fetchUserReplays(walletAddress);
    } else {
      fetchAllReplays();
    }
  }, [walletAddress, viewMode]);

  const handleSelectReplay = (replay: Replay) => {
    console.log("[ReplayListModal] Selected replay with score:", replay.score);
    
    // Check that replay data exists and is valid
    if (!replay.replayData || !Array.isArray(replay.replayData) || replay.replayData.length === 0) {
      console.error("[ReplayListModal] Cannot play replay - missing or invalid replay data");
      setError("This replay doesn't have valid data and cannot be played.");
      return;
    }
    
    // Log replay data structure for debugging
    console.log(`[ReplayListModal] Replay has ${replay.replayData.length} events`);
    if (replay.replayData.length > 0) {
      console.log("[ReplayListModal] First event:", replay.replayData[0]);
      console.log("[ReplayListModal] Last event:", replay.replayData[replay.replayData.length - 1]);
    }
    
    setSelectedReplay(replay);
    setReplayScore(replay.score);
    
    if (onSelectReplay) {
      onSelectReplay(replay);
    }
  };

  const handleReplayScoreUpdate = (score: number) => {
    setReplayScore(score);
  };
  
  const handleReplayClose = () => {
    setSelectedReplay(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="modal-box glass max-w-2xl p-6 rounded-2xl text-center shadow-xl">
        {selectedReplay ? (
          // Replay view
          <>
            <h3 className="font-bold text-3xl mb-4 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
              Replay
            </h3>
            <div className="mb-4 h-96 relative">
              <ReplayNoSSR 
                replayData={selectedReplay.replayData} 
                onScoreUpdate={handleReplayScoreUpdate}
                onClose={handleReplayClose}
              />
              <div className="mt-2 text-sm text-center opacity-80">
                Played by {selectedReplay.username || 
                (selectedReplay.walletAddress ? 
                  `${selectedReplay.walletAddress.substr(0, 6)}...${selectedReplay.walletAddress.substr(-4)}` : 
                  'Unknown')} on{" "}
                {new Date(selectedReplay.playedAt).toLocaleString()}
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm shadow-neon mt-2"
              onClick={handleReplayClose}
            >
              Back to List
            </button>
          </>
        ) : (
          // List view
          <>
            <h3 className="font-bold text-3xl mb-2 bg-clip-text text-transparent bg-gradient-to-r from-secondary to-accent">
              {viewMode === 'user' ? 'My Games' : 'All Games'}
            </h3>
            
            {/* Toggle buttons for My Games/All Games */}
            <div className="flex justify-center gap-2 mb-4">
              <button
                className={`btn btn-sm ${viewMode === 'user' ? 'btn-secondary' : 'btn-outline'}`}
                onClick={() => setViewMode('user')}
                disabled={loading || !walletAddress}
              >
                My Games
              </button>
              <button
                className={`btn btn-sm ${viewMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setViewMode('all')}
                disabled={loading}
              >
                All Games
              </button>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => viewMode === 'user' && walletAddress ? 
                  fetchUserReplays(walletAddress) : fetchAllReplays()}
                disabled={loading}
                title="Refresh"
              >
                ↻
              </button>
            </div>
            
            {loading ? (
              <div className="flex justify-center items-center p-8">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            ) : error ? (
              <div className="text-center p-4 bg-error/20 rounded-lg">
                <p className="text-error mb-2">Error loading replays</p>
                <p className="text-sm opacity-80">{error}</p>
                <button 
                  className="btn btn-sm btn-outline mt-4"
                  onClick={() => viewMode === 'user' && walletAddress ? 
                    fetchUserReplays(walletAddress) : fetchAllReplays()}
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {replays.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="mb-2">
                      {viewMode === 'user' ? 'No personal replays found.' : 'No replays found.'}
                    </p>
                    <p className="text-sm opacity-70">
                      {viewMode === 'user' 
                        ? 'Play a game to record your first replay!' 
                        : 'Be the first to record a gameplay!'}
                    </p>
                  </div>
                ) : (
                  replays.map((replay, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-base-200 rounded shadow-sm"
                    >
                      <div className="text-left">
                        <p className="font-mono">Score: {replay.score}</p>
                        <p className="text-xs opacity-70">
                          {new Date(replay.playedAt).toLocaleString()}
                        </p>
                        <p className="text-xs">
                          By: {replay.username || 
                          (replay.walletAddress ? 
                            `${replay.walletAddress.substr(0, 6)}...${replay.walletAddress.substr(-4)}` : 
                            'Unknown')}
                        </p>
                      </div>
                      <button
                        className="btn btn-sm btn-primary shadow-neon"
                        onClick={() => handleSelectReplay(replay)}
                        disabled={!replay.replayData || !Array.isArray(replay.replayData) || replay.replayData.length === 0}
                      >
                        {(!replay.replayData || !Array.isArray(replay.replayData) || replay.replayData.length === 0) ? 
                          'No Data' : 'Replay'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="modal-action mt-4">
              <button className="btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReplayListModal;