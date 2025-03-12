// monad-app/packages/nextjs/hooks/useReplays.ts
import { useState, useEffect, useCallback } from 'react';

interface Replay {
  walletAddress: string;
  username?: string;
  score: number;
  replayData: any[];
  playedAt: string;
}

interface UseReplaysResult {
  replays: Replay[];
  loading: boolean;
  error: string | null;
  fetchUserReplays: (walletAddress: string) => Promise<void>;
  fetchAllReplays: () => Promise<void>;
}

export const useReplays = (): UseReplaysResult => {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  
  // Clear cache every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastFetched(null);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchUserReplays = useCallback(async (walletAddress: string) => {
    const cacheKey = `user-${walletAddress}`;
    
    // Don't fetch if we just did and have data
    if (lastFetched === cacheKey && replays.length > 0) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log(`[useReplays] Fetching replays for user: ${walletAddress}`);
      const response = await fetch(`/api/game/replay/${walletAddress}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[useReplays] User replays response:`, data);
      
      if (data && data.data && Array.isArray(data.data.replays)) {
        // Sort by score descending
        const sorted = data.data.replays.sort((a: Replay, b: Replay) => b.score - a.score);
        setReplays(sorted);
        setLastFetched(cacheKey);
      } else {
        setReplays([]);
        throw new Error('Invalid response format for user replays');
      }
    } catch (err) {
      console.error('[useReplays] Error fetching user replays:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setReplays([]);
    } finally {
      setLoading(false);
    }
  }, [lastFetched, replays.length]);
  
  const fetchAllReplays = useCallback(async () => {
    const cacheKey = 'all';
    
    // Don't fetch if we just did and have data
    if (lastFetched === cacheKey && replays.length > 0) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('[useReplays] Fetching all replays');
      const response = await fetch('/api/game/replays');
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[useReplays] All replays response:', data);
      
      if (data && data.data && Array.isArray(data.data.replays)) {
        // Sort by score descending
        const sorted = data.data.replays.sort((a: Replay, b: Replay) => b.score - a.score);
        setReplays(sorted);
        setLastFetched(cacheKey);
      } else {
        setReplays([]);
        throw new Error('Invalid response format for all replays');
      }
    } catch (err) {
      console.error('[useReplays] Error fetching all replays:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setReplays([]);
    } finally {
      setLoading(false);
    }
  }, [lastFetched, replays.length]);
  
  return {
    replays,
    loading,
    error,
    fetchUserReplays,
    fetchAllReplays
  };
};

export default useReplays;