import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface UserProfile {
  walletAddress: string;
  username: string | null;
  highScore: number;
  timesPlayed: number;
  createdAt: string;
}

export function useWallet() {
  const { address, isConnected } = useAccount();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register wallet when connected
  useEffect(() => {
    async function registerWallet() {
      if (isConnected && address) {
        setIsLoading(true);
        setError(null);
        
        try {
          const response = await fetch('/runnerapi/wallet/connect', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ walletAddress: address }),
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(data.error || 'Failed to connect wallet');
          }
          
          setUserProfile(data.data.user);
        } catch (err) {
          console.error('Error registering wallet:', err);
          setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
          setIsLoading(false);
        }
      } else {
        setUserProfile(null);
      }
    }
    
    registerWallet();
  }, [address, isConnected]);

  // Function to update username
  const updateUsername = async (username: string) => {
    if (!isConnected || !address) {
      setError('Wallet not connected');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/runnerapi/wallet/${address}/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }
      
      setUserProfile(data.data.user);
      return data.data.user;
    } catch (err) {
      console.error('Error updating username:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Function to submit score
  const submitScore = async (score: number) => {
    if (!isConnected || !address) {
      setError('Wallet not connected');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/runnerapi/game/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address, score }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit score');
      }
      
      // Update local user profile with new scores
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          highScore: data.data.highScore,
          timesPlayed: data.data.timesPlayed
        });
      }
      
      return data.data;
    } catch (err) {
      console.error('Error submitting score:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    address,
    isConnected,
    userProfile,
    isLoading,
    error,
    updateUsername,
    submitScore
  };
}