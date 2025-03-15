import { useCallback, useState, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";
import { useLocalStorage } from "./useLocalStorage";
import { Hex, encodeFunctionData } from "viem";
import deployedContracts from "~~/contracts/deployedContracts";

// Default session expiry time is 24 hours (in seconds)
const DEFAULT_SESSION_EXPIRY = 24 * 60 * 60;

// Type for storing session keys in localStorage
interface StoredSessionKey {
  sessionPrivateKey: string;
  sessionPublicKey: string;
  signature: string;
  validUntil: number;
  userAddress: string;
}

/**
 * Hook to manage session keys for simplified transaction signing
 */
export const useSessionKeys = () => {
  const { address: connectedAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionKey, setSessionKey] = useLocalStorage<StoredSessionKey | null>(
    "monad-runner-session-key",
    null,
    true
  );
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSessionCheckRef = useRef<number>(0);

  // Helper to check if current session is still valid
  const isSessionValid = useCallback(() => {
    if (!sessionKey) return false;
    return sessionKey.validUntil > Math.floor(Date.now() / 1000);
  }, [sessionKey]);

  // Returns time left in session in seconds
  const getSessionTimeLeft = useCallback(() => {
    if (!sessionKey) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, sessionKey.validUntil - now);
  }, [sessionKey]);

  // Percentage of session time left
  const getSessionTimeLeftPercentage = useCallback(() => {
    if (!sessionKey) return 0;
    const timeLeft = getSessionTimeLeft();
    const totalTime = DEFAULT_SESSION_EXPIRY;
    return Math.floor((timeLeft / totalTime) * 100);
  }, [sessionKey, getSessionTimeLeft]);

  // Create session key for the connected wallet
  const createSession = useCallback(async (durationInSeconds: number = DEFAULT_SESSION_EXPIRY): Promise<boolean> => {
    if (!connectedAddress) {
      notification.error("No wallet connected");
      return false;
    }

    // Check for existing valid session
    if (isSessionValid()) {
      notification.info("Session already active");
      return true;
    }

    setIsCreatingSession(true);
    setError(null);

    try {
      // Generate a new session key pair using Web Crypto API
      const crypto = window.crypto;
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        true,
        ["sign", "verify"]
      );

      // Export the keys to store them
      const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
      const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
      
      // Convert to hex strings for storage
      const privateKeyHex = Array.from(new Uint8Array(privateKeyBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
        
      const publicKeyHex = Array.from(new Uint8Array(publicKeyBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      console.log("Generated session key pair successfully");

      // Create expiry timestamp
      const validUntil = Math.floor(Date.now() / 1000) + durationInSeconds;
      
      // Create a message to sign that authorizes this session
      const sessionMessage = `I authorize this session key for Monad Runner:
Public Key: ${publicKeyHex.substring(0, 20)}...
Valid Until: ${new Date(validUntil * 1000).toISOString()}
Address: ${connectedAddress}`;

      // Have the user sign this message to prove ownership
      const signature = await signMessageAsync({ message: sessionMessage });
      
      console.log("Session authorization signed successfully");

      // Register the session via our Next.js API proxy
      const response = await fetch("/api/session/proxy/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: connectedAddress,
          publicKey: publicKeyHex,
          signature,
          validUntil
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to register session with server");
      }

      // Store session data in localStorage
      const sessionKeyData: StoredSessionKey = {
        sessionPrivateKey: privateKeyHex,
        sessionPublicKey: publicKeyHex,
        signature,
        validUntil,
        userAddress: connectedAddress
      };

      setSessionKey(sessionKeyData);

      // Show success notification
      notification.success(`Session created! Valid for ${Math.floor(durationInSeconds / 60 / 60)} hours.`);
      return true;
    } catch (error: any) {
      console.error("Error creating session:", error);
      setError(error.message || "Failed to create session key");
      notification.error("Failed to create session key");
      return false;
    } finally {
      setIsCreatingSession(false);
    }
  }, [connectedAddress, isSessionValid, setSessionKey, signMessageAsync]);

  // Sign data with session key
  const signWithSession = useCallback(async (data: string): Promise<string | null> => {
    if (!sessionKey || !isSessionValid()) {
      console.error("No valid session key available");
      return null;
    }

    try {
      // Import the private key
      const privateKeyBytes = new Uint8Array(
        sessionKey.sessionPrivateKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );
      
      const privateKey = await window.crypto.subtle.importKey(
        "pkcs8",
        privateKeyBytes.buffer,
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        false,
        ["sign"]
      );

      // Convert data to bytes
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(data);
      
      // Sign the data
      const signatureBuffer = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        dataBytes
      );
      
      // Convert signature to hex
      const signatureHex = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
        
      return signatureHex;
    } catch (error) {
      console.error("Error signing with session key:", error);
      return null;
    }
  }, [sessionKey, isSessionValid]);

  // Revoke current session key
  const revokeSession = useCallback(async () => {
    if (sessionKey) {
      try {
        // Notify about revocation via our Next.js API proxy
        await fetch("/api/session/proxy/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: connectedAddress,
            publicKey: sessionKey.sessionPublicKey
          })
        });
      } catch (error) {
        console.error("Error notifying server about session revocation:", error);
      }
    }
    
    // Clear local session data regardless
    setSessionKey(null);
    notification.info("Session key revoked");
    return true;
  }, [setSessionKey, sessionKey, connectedAddress]);

  // Function to check session status with backend - define this first
  const checkSessionWithBackend = useCallback(async () => {
    if (!connectedAddress) return false;
    
    try {
      console.log("Checking session status with backend for:", connectedAddress);
      
      const response = await fetch("/api/session/proxy/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: connectedAddress
        })
      });
      
      if (!response.ok) {
        console.error("Error checking session status:", response.statusText);
        return false;
      }
      
      const data = await response.json();
      console.log("Backend session check result:", data);
      
      if (data.status === 'success' && data.hasSession) {
        // If backend says we have a valid session but local storage doesn't match,
        // update local storage with the session data from backend
        if (!sessionKey || !isSessionValid() || sessionKey.userAddress !== connectedAddress) {
          console.log("Syncing session data from backend");
          
          // Only update if we have all the necessary data
          if (data.sessionData?.publicKey && data.sessionData?.validUntil) {
            const validUntil = new Date(data.sessionData.validUntil).getTime() / 1000;
            
            // If backend doesn't provide the private key, we can't fully restore the session
            // but we can at least create a placeholder session record
            setSessionKey({
              sessionPublicKey: data.sessionData.publicKey,
              signature: data.sessionData.signature || "",
              sessionPrivateKey: data.sessionData.privateKey || "", // Backend may not send this for security
              validUntil,
              userAddress: connectedAddress
            });
            
            return true;
          }
        }
        return true;
      } else {
        // If backend says no valid session but we have one locally, clear it
        if (sessionKey && sessionKey.userAddress === connectedAddress) {
          console.log("Backend reports no active session, clearing local session");
          setSessionKey(null);
        }
        return false;
      }
    } catch (error) {
      console.error("Failed to check session with backend:", error);
      // On error, fall back to local check
      return localSessionCheck();
    }
  }, [connectedAddress, sessionKey, isSessionValid, setSessionKey]);
  
  // Manually force a check with the backend - for debugging - defined after checkSessionWithBackend
  const forceSessionCheck = useCallback(async () => {
    console.log("Forcing manual session check for:", connectedAddress);
    
    // If we have a valid session locally, let's return true regardless of backend check
    // This will help in cases where the backend connection fails but we have a valid session locally
    const isLocallyValid = sessionKey && isSessionValid() && sessionKey.userAddress === connectedAddress;
    
    if (isLocallyValid) {
      console.log("Local session is valid, forcing success state");
      
      // Log detailed result
      console.log("Manual session check result (LOCAL):", {
        isValid: true,
        sessionKey: sessionKey ? {
          publicKey: sessionKey.sessionPublicKey?.substring(0, 20) + '...',
          validUntil: sessionKey.validUntil,
          validUntilFormatted: new Date(sessionKey.validUntil * 1000).toISOString(),
          nowTime: Math.floor(Date.now() / 1000),
          isStillValid: sessionKey.validUntil > Math.floor(Date.now() / 1000),
          timeLeftSeconds: sessionKey.validUntil - Math.floor(Date.now() / 1000)
        } : null
      });
      
      return true;
    }
    
    // Otherwise try the backend check
    try {
      const result = await checkSessionWithBackend();
      
      // Log detailed result
      console.log("Manual session check result:", {
        isValid: result,
        sessionKey: sessionKey ? {
          publicKey: sessionKey.sessionPublicKey?.substring(0, 20) + '...',
          validUntil: sessionKey.validUntil,
          validUntilFormatted: new Date(sessionKey.validUntil * 1000).toISOString(),
          nowTime: Math.floor(Date.now() / 1000),
          isStillValid: sessionKey.validUntil > Math.floor(Date.now() / 1000),
          timeLeftSeconds: sessionKey.validUntil - Math.floor(Date.now() / 1000)
        } : null
      });
      
      return result;
    } catch (error) {
      console.error("Force check failed, falling back to local check");
      return isLocallyValid;
    }
  }, [connectedAddress, checkSessionWithBackend, sessionKey, isSessionValid]);

  // Local session check function
  const localSessionCheck = useCallback(() => {
    // Check if session is expired
    if (sessionKey && !isSessionValid()) {
      console.log("Session expired, clearing session key");
      setSessionKey(null);
      return false;
    }
    
    // Check if session is for a different wallet
    if (sessionKey && connectedAddress && sessionKey.userAddress !== connectedAddress) {
      console.log("Session belongs to different wallet, clearing session key");
      setSessionKey(null);
      return false;
    }

    return sessionKey && isSessionValid();
  }, [sessionKey, isSessionValid, connectedAddress, setSessionKey]);

  // Check session status on load and on wallet changes
  useEffect(() => {
    if (!connectedAddress) return;
    
    // IMMEDIATELY perform a local check and auto-fix the session if needed
    const autoFix = async () => {
      // Check if we have a valid session locally
      const isLocallyValid = sessionKey && isSessionValid() && sessionKey.userAddress === connectedAddress;
      
      if (isLocallyValid) {
        console.log("Auto-fixing session state - Valid local session found");
        
        // Simulate clicking the "Fix Session State" button by dispatching an event
        // This will update localStorage with the corrected state
        const event = new CustomEvent('session-autofix', { 
          detail: { 
            valid: true,
            address: connectedAddress,
            validUntil: sessionKey.validUntil
          } 
        });
        document.dispatchEvent(event);
        
        // Force localStorage update by making a direct call
        try {
          // Get the local storage setter function
          const localStorageEvent = new CustomEvent('monad-runner-fix-session', {
            detail: {
              key: "monad-runner-session-enabled",
              value: true
            }
          });
          document.dispatchEvent(localStorageEvent);
          
          console.log("Session auto-fixed successfully");
        } catch (error) {
          console.error("Failed to auto-fix session:", error);
        }
      }
    };
    
    // Run the auto-fix immediately
    autoFix();
    
    // Try the backend check, but don't rely on it for session state
    checkSessionWithBackend().then(isValid => {
      console.log(`Initial backend session check: ${isValid ? 'Valid session' : 'No valid session'}`);
    });
    
    // Set up periodic check
    const intervalId = setInterval(() => {
      const now = Date.now();
      const timeSinceLastCheck = now - lastSessionCheckRef.current;
      
      // Check at most once per 30 seconds after the initial check
      if (timeSinceLastCheck < 30000) {
        // Just do a local check more frequently
        const isValid = localSessionCheck();
        
        // If local session is valid but not enabled, try to auto-fix again
        if (isValid) {
          autoFix();
        }
        return;
      }
      
      lastSessionCheckRef.current = now;
      // Do full backend check every 30 seconds
      checkSessionWithBackend();
    }, 5000); // Run the check loop every 5 seconds
    
    return () => clearInterval(intervalId);
  }, [connectedAddress, checkSessionWithBackend, localSessionCheck, sessionKey, isSessionValid]);

  return {
    sessionKey,
    isCreatingSession,
    error,
    createSession,
    signWithSession,
    revokeSession,
    isSessionValid,
    getSessionTimeLeft,
    getSessionTimeLeftPercentage,
    forceSessionCheck, // Add the debug method
  };
};

export default useSessionKeys;