"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import useSessionKeys from "~~/hooks/useSessionKeys";
import { useLocalStorage } from "~~/hooks/useLocalStorage";
import { notification } from "~~/utils/scaffold-eth";
import CreateSessionModal from "~~/components/CreateSessionModal";

interface SessionContextType {
  isSessionEnabled: boolean;
  isCreatingSession: boolean;
  isSessionValid: () => boolean;
  createSession: (durationInSeconds?: number) => Promise<boolean>;
  revokeSession: () => Promise<boolean>;
  signWithSession: (data: string) => Promise<string | null>;
  getSessionTimeLeft: () => number;
  getSessionTimeLeftPercentage: () => number;
  showCreateSessionModal: () => void;
  hideCreateSessionModal: () => void;
  isModalOpen: boolean;
  sessionKey: any;
  forceSessionCheck?: () => Promise<boolean>; // Add debug method
}

// Create the context with default values
const SessionContext = createContext<SessionContextType>({
  isSessionEnabled: false,
  isCreatingSession: false,
  isSessionValid: () => false,
  createSession: async () => false,
  revokeSession: async () => false,
  signWithSession: async () => null,
  getSessionTimeLeft: () => 0,
  getSessionTimeLeftPercentage: () => 0,
  showCreateSessionModal: () => {},
  hideCreateSessionModal: () => {},
  isModalOpen: false,
  sessionKey: null,
  forceSessionCheck: async () => false,
});

// Hook to use the session context
export const useSession = () => {
  return useContext(SessionContext);
};

interface SessionProviderProps {
  children: ReactNode;
}

// The main Session Provider component
export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const { address: connectedAddress } = useAccount();
  const [showModal, setShowModal] = useState(false);
  const [isSessionEnabled, setIsSessionEnabled] = useLocalStorage<boolean>("monad-runner-session-enabled", false, true);
  
  // Use our session keys hook
  const {
    sessionKey,
    isCreatingSession,
    error,
    createSession: createSessionKey,
    revokeSession: revokeSessionKey,
    signWithSession,
    isSessionValid,
    getSessionTimeLeft,
    getSessionTimeLeftPercentage,
    forceSessionCheck,
  } = useSessionKeys();

  // Add state to track hydration status
  const [isHydrated, setIsHydrated] = useState(false);

  // Mark as hydrated after initial render and perform initial session check
  useEffect(() => {
    setIsHydrated(true);
    
    // Force a session check immediately when the provider loads
    if (connectedAddress && isSessionValid && typeof isSessionValid === 'function') {
      console.log('SessionProvider: Initial session check');
      const valid = isSessionValid();
      console.log('SessionProvider: Initial session check result:', valid);
      
      // If session is valid, force enable it
      if (valid) {
        setIsSessionEnabled(true);
      }
    }
  }, [connectedAddress, isSessionValid, setIsSessionEnabled]);
  
  // Listen for auto-fix events
  useEffect(() => {
    const handleAutoFix = (event: any) => {
      console.log("Received session auto-fix event:", event.detail);
      if (event.detail.valid) {
        setIsSessionEnabled(true);
      }
    };
    
    // Listen for fix session events from useSessionKeys
    document.addEventListener('session-autofix', handleAutoFix);
    
    return () => {
      document.removeEventListener('session-autofix', handleAutoFix);
    };
  }, [setIsSessionEnabled]);
  
  // Listen for direct localStorage update events
  useEffect(() => {
    const handleStorageUpdate = (event: any) => {
      if (event.detail?.key === "monad-runner-session-enabled") {
        console.log("Direct localStorage update:", event.detail);
        setIsSessionEnabled(event.detail.value);
      }
    };
    
    document.addEventListener('monad-runner-fix-session', handleStorageUpdate);
    
    return () => {
      document.removeEventListener('monad-runner-fix-session', handleStorageUpdate);
    };
  }, [setIsSessionEnabled]);

  // Update session enabled state based on sessionKey and validity - runs on every render
  useEffect(() => {
    // Skip during server-side rendering
    if (!isHydrated) return;

    console.log('Checking session state:', {
      hasSessionKey: !!sessionKey,
      isValid: isSessionValid(),
      currentEnabledState: isSessionEnabled
    });

    // Simple logic: If valid, enable it. If invalid, disable it.
    // This always updates the state regardless of current value
    const valid = sessionKey && isSessionValid();
    
    if (valid) {
      console.log('Auto-enabling session - valid session key found');
      setIsSessionEnabled(true);
    } else if (isSessionEnabled) {
      console.log('Disabling session - no valid session key');
      setIsSessionEnabled(false);
    }
  }, [isHydrated, sessionKey, isSessionValid, isSessionEnabled, setIsSessionEnabled]);

  // Reset session state when wallet is disconnected
  useEffect(() => {
    if (!connectedAddress) {
      setIsSessionEnabled(false);
    } else {
      // Add explicit debugging when wallet is connected
      console.log('SessionProvider - Wallet connected:', connectedAddress);
      console.log('SessionProvider - Current session state:', {
        isSessionEnabled,
        sessionKey: sessionKey ? {
          publicKey: sessionKey.sessionPublicKey?.substring(0, 20) + '...',
          validUntil: sessionKey.validUntil,
          userAddress: sessionKey.userAddress
        } : null,
        isValid: isSessionValid()
      });
    }
  }, [connectedAddress, setIsSessionEnabled, isSessionEnabled, sessionKey, isSessionValid]);

  // Create session with error handling
  const createSession = useCallback(async (durationInSeconds?: number) => {
    try {
      const success = await createSessionKey(durationInSeconds);
      if (success) {
        setIsSessionEnabled(true);
        setShowModal(false); // Auto-hide modal on success
      }
      return success;
    } catch (err) {
      console.error("Error creating session:", err);
      notification.error("Failed to create session");
      return false;
    }
  }, [createSessionKey, setIsSessionEnabled]);

  // Revoke session
  const revokeSession = useCallback(async () => {
    try {
      const success = await revokeSessionKey();
      if (success) {
        setIsSessionEnabled(false);
      }
      return success;
    } catch (err) {
      console.error("Error revoking session:", err);
      notification.error("Failed to revoke session");
      return false;
    }
  }, [revokeSessionKey, setIsSessionEnabled]);

  // Show/hide modal functions
  const showCreateSessionModal = useCallback(() => {
    console.log('showCreateSessionModal called - Opening session modal');
    setShowModal(true);
    // Log confirmation after state update
    setTimeout(() => {
      console.log('Modal state after update:', showModal);
    }, 100);
  }, []);

  const hideCreateSessionModal = useCallback(() => {
    console.log('hideCreateSessionModal called - Closing session modal');
    setShowModal(false);
  }, []);

  // Provide context value
  const contextValue: SessionContextType = {
    isSessionEnabled,
    isCreatingSession,
    isSessionValid,
    createSession,
    revokeSession,
    signWithSession,
    getSessionTimeLeft,
    getSessionTimeLeftPercentage,
    showCreateSessionModal,
    hideCreateSessionModal,
    isModalOpen: showModal,
    sessionKey,
    forceSessionCheck,
  };

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
      {showModal && (
        <CreateSessionModal
          onSuccess={() => {
            // Close modal on success
            hideCreateSessionModal();
          }}
          onClose={hideCreateSessionModal}
        />
      )}
    </SessionContext.Provider>
  );
};

export default SessionProvider;