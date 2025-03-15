"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSignMessage, useAccount } from "wagmi";
import UsernameModal from "./UsernameModal";
import { useScaffoldWriteContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth"; 
import useMonadRunnerContractWithAA from "~~/hooks/useMonadRunnerContractWithAA";
import {
  FaRegEdit,
  FaCheckCircle,
  FaHourglassHalf,
  FaKey,
  FaPaperPlane,
  FaExclamationTriangle,
} from "react-icons/fa";

export type ProcessStage =
  | "idle"
  | "signing"
  | "verifying-signature"
  | "retrieving-relayer-key"
  | "initializing-wallet"
  | "retrieving-keys"
  | "estimating-gas"
  | "registering-account"
  | "tx-sent"
  | "waiting-confirmation"
  | "confirmed"
  | "success"
  | "error";

interface EnableAAModalProps {
  onSuccess: (signature: string, message: string) => void;
  onClose: () => void;
  initialStage?: string;
  username?: string;
  onUsernameUpdate: (username: string) => Promise<void>;
}

const stageDetails: Record<ProcessStage, { message: string; Icon: React.ComponentType<{ className?: string }> }> = {
  idle: { message: "Ready to enable Account Abstraction", Icon: FaRegEdit },
  signing: { message: "Signing message...", Icon: FaRegEdit },
  "verifying-signature": { message: "Verifying signature...", Icon: FaCheckCircle },
  "retrieving-relayer-key": { message: "Preparing relayer service...", Icon: FaKey },
  "initializing-wallet": { message: "Initializing smart wallet...", Icon: FaHourglassHalf },
  "retrieving-keys": { message: "Retrieving secure keys...", Icon: FaKey },
  "estimating-gas": { message: "Estimating gas costs...", Icon: FaHourglassHalf },
  "registering-account": { message: "Registering smart account...", Icon: FaPaperPlane },
  "tx-sent": { message: "Transaction sent to network...", Icon: FaPaperPlane },
  "waiting-confirmation": { message: "Waiting for blockchain confirmation...", Icon: FaHourglassHalf },
  "confirmed": { message: "Transaction confirmed!", Icon: FaCheckCircle },
  success: { message: "Account Abstraction enabled successfully!", Icon: FaCheckCircle },
  error: { message: "An error occurred", Icon: FaExclamationTriangle },
};

const EnableAAModal: React.FC<EnableAAModalProps> = ({ 
  onSuccess, 
  onClose, 
  initialStage = "idle", 
  username = "", 
  onUsernameUpdate 
}) => {
  const { address: connectedAddress } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [processStage, setProcessStage] = useState<ProcessStage>(initialStage as ProcessStage);
  const [signatureMessage, setSignatureMessage] = useState<string>("");
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  
  // Refs for state tracking
  const messageRef = useRef<string>("");
  const connectionActiveRef = useRef(false);
  const processCompletedRef = useRef(false);
  const enablementStartedRef = useRef(false);
  
  // Get contract write functions
  const { writeContractAsync: registerPlayerFn } = useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: updateUsernameFn } = useScaffoldWriteContract("MonadRunnerGame");
  
  // Use the hook to get player data from the contract
  const { isRegistered, playerData } = useMonadRunnerContractWithAA();
  
  // Check if the user already has a username on-chain
  const hasOnChainUsername = !!playerData?.username;

  // Show UsernameModal if no username is provided, but check on-chain data first
  useEffect(() => {
    console.log("Username modal check state:", {
      processStage,
      username,
      hasOnChainUsername,
      showUsernameModal,
      pendingUsername: window.pendingUsername,
      isRegistered
    });
    
    // Don't automatically hide username modal if it's already showing - this is critical!
    // Only the handler functions should be able to hide it once shown
    if (showUsernameModal) {
      console.log("Username modal is already showing, keeping it open");
      return;
    }
    
    // FIRST PRIORITY: If a username was explicitly passed in props, use that
    // This handles the case where the user already set a username but canceled AA
    if (username) {
      console.log("Already have username from props:", username);
      // The username is already set from props, no need to show the modal
      return;
    }
    
    // SECOND PRIORITY: If player is registered on-chain, use that username
    if (isRegistered && hasOnChainUsername && playerData?.username) {
      console.log("Found on-chain username for registered player:", playerData.username);
      onUsernameUpdate(playerData.username);
      return;
    }
    
    // THIRD PRIORITY: Check for any pending username from previous attempts
    if (window.pendingUsername) {
      console.log("Found pending username:", window.pendingUsername);
      onUsernameUpdate(window.pendingUsername);
      return;
    }
    
    // LAST RESORT: If no username found anywhere, show the modal
    // This is the most important case - we must have a username to proceed
    console.log("No username found anywhere, showing modal");
    setShowUsernameModal(true);
  }, [username, hasOnChainUsername, playerData, onUsernameUpdate, processStage, showUsernameModal, isRegistered]);

  // Generate the signature message
  const generateMessage = useCallback(() => {
    const msg = `Enable Account Abstraction for Monad Runner\nWallet: ${connectedAddress}\nTimestamp: ${Date.now()}`;
    setSignatureMessage(msg);
    messageRef.current = msg;
    return msg;
  }, [connectedAddress]);

  // Hook for signing messages
  const { signMessage, data: signature, error: signError } = useSignMessage();

  // Debug log whenever process stage changes
  useEffect(() => {
    console.log("Process stage changed:", processStage);
  }, [processStage]);

  // Handle signature errors
  useEffect(() => {
    if (signError) {
      setProcessStage("error");
      setError(signError.message);
    }
  }, [signError]);

  // Reference to EventSource for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Main effect to handle the AA enablement process
  useEffect(() => {
    // Only run if we have all required data
    if (!signature || !connectedAddress || !username) {
      console.log("Missing data for enablement:", { 
        hasSignature: !!signature, 
        hasAddress: !!connectedAddress, 
        hasUsername: !!username 
      });
      return;
    }
    
    // Don't run if already successful
    if (processStage === "success") {
      console.log("Process already successful, not restarting");
      return;
    }
    
    // Log current state for debugging
    console.log("Starting EnableAA process with:", {
      processStage,
      enablementStarted: enablementStartedRef.current,
      processCompleted: processCompletedRef.current
    });
    
    // Mark as started
    enablementStartedRef.current = true;
    connectionActiveRef.current = true;
    
    // Track component mount state
    let isMounted = true;
    
    // Helper to update stages
    const updateStage = (stage: ProcessStage) => {
      if (!isMounted || processCompletedRef.current) return;
      setProcessStage(stage);
      console.log("Stage updated:", stage);
    };
    
    // Start the enablement process
    const runEnablement = async () => {
      try {
        // First show verifying stage
        updateStage("verifying-signature");
        
        // Function to setup and reconnect to the SSE stream
        const setupEventSource = () => {
          // Create query params for SSE stream
          const params = new URLSearchParams({
            walletAddress: connectedAddress,
            signature,
            message: messageRef.current,
            useEIP7702: "false" // Always false with new contract
          });
          
          // Close any existing event source
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
          
          // Setup SSE connection to get real-time updates
          console.log("Setting up new SSE connection");
          const eventSource = new EventSource(`/api/aa/enable/stream?${params}`);
          eventSourceRef.current = eventSource;
          
          // Track reconnection attempts
          let reconnectCount = 0;
          const maxReconnects = 5;
          
          // Handle stage events
          eventSource.addEventListener("stage", (event) => {
            try {
              if (processCompletedRef.current || !isMounted) {
                eventSource.close();
                eventSourceRef.current = null;
                return;
              }
              
              const data = JSON.parse(event.data);
              console.log("Received stage update:", data);
              
              if (data.stage && isMounted) {
                // Reset reconnect count on successful stage reception
                reconnectCount = 0;
                
                // Update TX details if provided
                if (data.txHash) {
                  setTransactionHash(data.txHash);
                }
                
                if (data.smartAccountAddress) {
                  setSmartAccountAddress(data.smartAccountAddress);
                }
                
                // Update stage
                updateStage(data.stage as ProcessStage);
                
                // If success, complete the process
                if (data.stage === "success") {
                  processCompletedRef.current = true;
                  
                  // Store in localStorage - ALWAYS use smart account address from API
                  if (connectedAddress && data.smartAccountAddress) {
                    localStorage.setItem("monad-runner-aa-enabled", "true");
                    localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                    localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress);
                    console.log(`Stored smart account address from SSE: ${data.smartAccountAddress}`);
                    
                    // Force page reload right away - this is more reliable than waiting
                    setTimeout(() => {
                      console.log("AA Enablement successful! Reloading page to update UI.");
                      window.location.reload();
                    }, 1000);
                  } else {
                    console.error("Missing smart account address in SSE, AA enablement might have failed");
                    // Don't enable AA if we're missing the smart account address
                    if (!data.smartAccountAddress) {
                      throw new Error("Missing smart account address"); 
                    }
                  }
                  
                  // Close the event source
                  eventSource.close();
                  eventSourceRef.current = null;
                  
                  // Notify parent after a small delay
                  setTimeout(() => {
                    if (isMounted) {
                      onSuccess(signature, messageRef.current);
                    }
                  }, 1000);
                }
              }
            } catch (err) {
              console.error("Error parsing SSE event:", err);
            }
          });
          
          // Handle heartbeat events
          eventSource.addEventListener("heartbeat", () => {
            console.log("Received heartbeat from server");
            // Reset reconnect count on heartbeat
            reconnectCount = 0;
          });
          
          // Handle errors and implement auto-reconnect
          eventSource.addEventListener("error", (event) => {
            console.error("SSE error:", event);
            
            // Close the current connection
            eventSource.close();
            
            // Attempt to reconnect unless we've reached max attempts or process completed
            if (reconnectCount < maxReconnects && !processCompletedRef.current && isMounted) {
              reconnectCount++;
              console.log(`Reconnection attempt ${reconnectCount} of ${maxReconnects}`);
              
              // Exponential backoff for reconnection
              const delay = Math.min(1000 * Math.pow(1.5, reconnectCount), 10000);
              
              setTimeout(() => {
                if (!processCompletedRef.current && isMounted) {
                  console.log(`Reconnecting after ${delay}ms delay`);
                  setupEventSource();
                }
              }, delay);
            } else if (!processCompletedRef.current && isMounted) {
              console.log("Max reconnection attempts reached or process completed");
              
              // Only after all reconnects fail, rely on API response
              setTimeout(() => {
                if (!processCompletedRef.current && isMounted) {
                  // Last fallback attempt with the regular API
                  startApiEnablement();
                }
              }, 1500);
            }
          });
        };
        
        // Start an API call for the actual AA enabling
        const startApiEnablement = async () => {
          try {
            const response = await fetch("/api/aa/enable", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signature,
                message: messageRef.current,
                walletAddress: connectedAddress,
                useEIP7702: false, // Always false with new contract
              }),
            });
            
            if (response.ok) {
              const data = await response.json();
              
              if (isMounted) {
                // Update TX details
                setTransactionHash(data.txHash);
                setSmartAccountAddress(data.smartAccountAddress || connectedAddress);
                
                // Mark process as complete if not already
                if (!processCompletedRef.current) {
                  // Update stage to success
                  updateStage("success");
                  processCompletedRef.current = true;
                  
                  // Store in localStorage - Always use smart account address from API
                  if (connectedAddress && data.smartAccountAddress) {
                    localStorage.setItem("monad-runner-aa-enabled", "true");
                    localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                    localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress);
                    console.log(`Stored smart account address from API: ${data.smartAccountAddress}`);
                    
                    // Don't reload - just log
                    console.log("AA Enablement successful via API! Not reloading page");
                  } else {
                    console.error("Missing smart account address in API response, AA enablement likely failed");
                    // Don't set AA enabled if we don't have the smart account address
                    updateStage("error");
                    setError("Failed to get smart account address from server. Please try again.");
                    return null; // Return early to prevent success state
                  }
                  
                  // Dispatch event - ALWAYS use the smart account address from the API
                  // Never fall back to connectedAddress as the smart account
                  window.dispatchEvent(new CustomEvent('aa-status-changed', {
                    detail: {
                      isEnabled: true,
                      address: connectedAddress,
                      smartAccountAddress: data.smartAccountAddress,
                      fromSuccess: true
                    }
                  }));
                  
                  // Notify parent after a meaningful delay to ensure state propagation
                  setTimeout(() => {
                    if (isMounted) {
                      // Force one more event dispatch with the correct smart account
                      window.dispatchEvent(new CustomEvent('aa-status-changed', {
                        detail: {
                          isEnabled: true,
                          address: connectedAddress,
                          smartAccountAddress: data.smartAccountAddress,
                          fromSuccess: true,
                          timestamp: Date.now(),
                          forceRefresh: true
                        }
                      }));
                      
                      // Always force a page reload for consistency
                      setTimeout(() => {
                        console.log("AA Enablement successful event dispatch! Reloading page to update UI.");
                        window.location.reload();
                      }, 500);
                      
                      // Give UI time to update before calling parent success handler
                      setTimeout(() => {
                        if (isMounted) {
                          onSuccess(signature, messageRef.current);
                        }
                      }, 100);
                    }
                  }, 1000);
                }
              }
              
              return data;
            } else {
              throw new Error("API call failed");
            }
          } catch (error) {
            console.error("API call error:", error);
            if (isMounted && !processCompletedRef.current) {
              updateStage("error");
              setError("Failed to enable account abstraction");
            }
          }
        };
        
        // Start both the SSE stream and the API call in parallel
        setupEventSource();
        
        // Start the API call after a short delay to allow SSE to connect first
        setTimeout(() => {
          if (!processCompletedRef.current && isMounted) {
            startApiEnablement();
          }
        }, 3000);
        
        // Set a fallback timeout - if after 20 seconds we don't have success,
        // complete the process assuming success (the API call might have worked)
        setTimeout(() => {
          if (!processCompletedRef.current && isMounted) {
            console.log("Fallback timeout reached, completing process");
            
            // Try one last API call
            startApiEnablement().then(data => {
              if (data && !processCompletedRef.current) {
                processCompletedRef.current = true;
                updateStage("success");
                
                // Store in localStorage - require valid smart account
                if (connectedAddress && data?.smartAccountAddress) {
                  localStorage.setItem("monad-runner-aa-enabled", "true");
                  localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                  localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress);
                  console.log(`Stored smart account address from fallback API: ${data.smartAccountAddress}`);
                  
                  // Force page reload right away for fallback handler too
                  setTimeout(() => {
                    console.log("AA Enablement successful via fallback! Reloading page to update UI.");
                    window.location.reload();
                  }, 1000);
                } else {
                  console.error("Missing smart account address in fallback, AA enablement likely failed");
                  // Don't set AA enabled if we don't have a valid smart account address
                  updateStage("error");
                  setError("Could not obtain smart account address. Please try again.");
                  return; // Don't proceed with success
                }
                
                // Notify parent
                setTimeout(() => {
                  if (isMounted) {
                    onSuccess(signature, messageRef.current);
                  }
                }, 500);
              }
            }).catch(() => {
              // If API failed and we get here, show error only if we're not already in success state
              if (!processCompletedRef.current) {
                updateStage("error");
                setError("Failed to confirm account abstraction status");
              }
            });
            
            // Close event source if still open
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          }
        }, 20000);
        
      } catch (error) {
        console.error("Error in enablement:", error);
        if (isMounted) {
          updateStage("error");
          setError("Error enabling account abstraction");
        }
      }
    };
    
    // Start the process
    runEnablement();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      connectionActiveRef.current = false;
    };
  }, [signature, connectedAddress, username, onSuccess]);

  // Start the signing process
  const handleSign = useCallback(async () => {
    console.log("handleSign called with state:", {
      hasOnChainUsername,
      username,
      playerUsername: playerData?.username,
      isRegistered,
      isProcessStarted: enablementStartedRef.current,
      processStage
    });
    
    // Reset enablement flags to ensure we can restart the process
    enablementStartedRef.current = false;
    processCompletedRef.current = false;
    
    // IMPORTANT: The user must have a username set, either on-chain or from the form
    const hasUsername = isRegistered || hasOnChainUsername || !!username;
    
    if (!hasUsername) {
      console.log("No username available, showing username modal");
      setShowUsernameModal(true);
      return;
    }
    
    // For on-chain usernames, make sure it's in our state
    if (hasOnChainUsername && !username && playerData?.username) {
      await onUsernameUpdate(playerData.username);
    }
    
    // Start the multi-stage AA enablement process 
    // This will show progress stages in the UI
    setProcessStage("signing");
    setError(null);
    
    try {
      if (!connectedAddress) {
        throw new Error("No wallet connected");
      }
      
      // Generate a fresh message and sign it
      const msg = generateMessage();
      console.log("Requesting signature for message:", msg);
      await signMessage({ message: msg });
      console.log("Signature received successfully");
    } catch (err: any) {
      console.error("Error during signing:", err);
      
      if (err.message?.includes("User denied")) {
        setError("You rejected the signature request");
      } else {
        setError("Unable to complete the signing process");
      }
      
      setProcessStage("error");
    }
  }, [connectedAddress, generateMessage, signMessage, username, playerData, hasOnChainUsername, onUsernameUpdate]);

  // When the UsernameModal completes, update the username on-chain before proceeding
  const handleUsernameComplete = useCallback(async (newUsername: string) => {
    console.log("Username set, processing transaction...");
    setProcessStage("signing");
    setError(null);
    
    try {
      // Update parent's state
      await onUsernameUpdate(newUsername);
      
      // IMPORTANT: Never throw errors from this function - handle all errors internally
      // Wrap the executeContractCall in a try-catch to handle errors gracefully
      const tryContractCall = async (fn: any, args: any, maxRetries = 10) => {
        let retryCount = 0;
        let success = false;
        
        const doRetry = async () => {
          try {
            // Update error message to show attempt count
            if (retryCount > 0) {
              setError(`Sending transaction... Attempt #${retryCount+1} of ${maxRetries}`);
            } else {
              setError("Sending transaction to blockchain...");
            }
            
            await fn(args);
            console.log("Contract call succeeded!");
            
            // Clear error message on success
            setError(null);
            
            success = true;
            return true;
          } catch (error: any) {
            // User rejected transaction - show the username modal again
            if (error.message?.includes("User denied") || 
                error.message?.includes("User rejected")) {
              console.log("User rejected transaction - showing username modal again");
              // Clear global state
              window.pendingUsername = "";
              window.isRateLimited = false;
              window.rateLimitRetryCount = 0;
              
              // Show the username modal again
              setShowUsernameModal(true);
              setProcessStage("idle");
              setError(null);
              
              return false;
            }
            
            // Handle rate limit errors with automatic retries
            if (error.message?.includes("requests limited") || 
                error.message?.includes("429") ||
                error.message?.includes("too many requests")) {
              
              // Save for persistent retries
              window.pendingUsername = args.args[0];
              window.isRateLimited = true;
              
              // If we haven't maxed out retries
              if (retryCount < maxRetries) {
                retryCount++;
                console.log(`Rate limited. Retrying ${retryCount}/${maxRetries}...`);
                
                // Update error message to show retry count
                setError(`Rate limited. Retrying in a moment... Attempt #${retryCount} of ${maxRetries}`);
                
                // Exponential backoff
                const delay = Math.min(2000 * Math.pow(1.5, retryCount - 1), 10000);
                
                // Wait and try again
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Recursive retry
                return doRetry();
              } else {
                console.log("Max retries reached, CANNOT proceed without username");
                setError(`Maximum retry attempts (${maxRetries}) reached. Please try again later.`);
                success = false; // Don't pretend it worked - we need a valid username
                return false;
              }
            }
            
            // Special handling for OnlyRegisteredPlayer error
            if (error.message?.includes("OnlyRegisteredPlayer")) {
              console.log("OnlyRegisteredPlayer error detected - player needs to be registered first");
              
              // If we're trying to update username, we should try register instead
              if (args.functionName === "updateUsername") {
                console.log("Switching from updateUsername to registerPlayer");
                
                try {
                  // Try registerPlayer instead
                  await registerPlayerFn({
                    functionName: "registerPlayer",
                    args: args.args
                  });
                  
                  console.log("registerPlayer succeeded after updateUsername failed");
                  
                  // Clear error message on success
                  setError(null);
                  
                  success = true;
                  return true;
                } catch (regError) {
                  console.error("registerPlayer also failed:", regError);
                  // Continue to standard error handling
                }
              }
            }
            
            // For other errors, we still can't proceed without username
            console.warn("Contract call error, can't proceed without username:", error.message);
            
            // Immediately store pending username for retry
            if (args && args.args && args.args[0]) {
              window.pendingUsername = args.args[0];
            }
            
            // If this is a timeout, display a more helpful message
            if (error.message?.includes("timed out") || error.message?.includes("timeout")) {
              setError(`Network request timed out. We'll try again.`);
            } else {
              setError(`Transaction failed: ${error.message.substring(0, 100)}...`);
            }
            
            success = false; // Don't pretend it worked - username is required
            return false;
          }
        };
        
        // Start the retry process
        await doRetry();
        return success;
      };
      
      // Try to update or register without bubbling up errors
      console.log("Attempting to set username:", newUsername);
      
      let usernameSuccess = false;
      
      // Check if the player is already registered
      if (isRegistered) {
        console.log("Player is registered, using updateUsername");
        usernameSuccess = await tryContractCall(updateUsernameFn, {
          functionName: "updateUsername",
          args: [newUsername]
        });
      } else {
        // If not registered, always use registerPlayer first
        console.log("Player is not registered, using registerPlayer directly");
        usernameSuccess = await tryContractCall(registerPlayerFn, {
          functionName: "registerPlayer",
          args: [newUsername]
        });
        
        // If registerPlayer failed, try updateUsername as a fallback
        if (!usernameSuccess) {
          console.log("Registration failed, trying updateUsername as fallback");
          usernameSuccess = await tryContractCall(updateUsernameFn, {
            functionName: "updateUsername",
            args: [newUsername]
          });
        }
      }
      
      // We can ONLY proceed if the username transaction was successful
      if (usernameSuccess) {
        console.log("Username transaction successful, returning to AA modal");
        
        // Force a small delay to ensure state updates properly
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Close the username modal only after success
        setShowUsernameModal(false);
        
        // Reset process state to idle before continuing
        setProcessStage("idle");
        
        // Reset enablement flags to allow restarting the process
        enablementStartedRef.current = false;
        processCompletedRef.current = false;
        
        // We return to the EnableAAModal with the button enabled
        // The user will need to click "Sign & Enable AA" to proceed
        console.log("Username successfully set. User can now click 'Sign & Enable AA'");
      } else {
        // CRITICAL: For ANY failure, ALWAYS stay in username modal
        console.error("Failed to register username, keeping username modal open for retry");
        
        // Reset AA process state but KEEP username modal open
        setProcessStage("idle");
        enablementStartedRef.current = false;
        processCompletedRef.current = false;
        
        // Save username for retry if available
        if (newUsername) {
          window.pendingUsername = newUsername;
          console.log("Saved pending username for retry:", newUsername);
        }
        
        // Do NOT close the username modal - keep it open for retry
        // We explicitly force it to be shown
        setShowUsernameModal(true);
        
        // Show error message that will appear on the username modal when we return to it
        console.log("Forcing username modal to remain open for retry");
      }
      
    } catch (err: any) {
      console.error("Error in username handling:", err);
      
      // For all errors, we need to preserve the username and show the modal again
      
      // Store the current username for retry if available
      if (newUsername) {
        window.pendingUsername = newUsername;
        console.log("Saved pending username for retry after error:", newUsername);
      }
      
      // If this is a user rejection, we handle it specially
      if (err.message?.includes("User denied") || 
          err.message?.includes("User rejected")) {
        console.log("User rejected transaction - returning to username modal");
        
        // Clear rate limit flags but preserve username
        window.isRateLimited = false;
        window.rateLimitRetryCount = 0;
      } else {
        // For other errors, display helpful message
        setError(`Error: ${err.message.substring(0, 100)}${err.message.length > 100 ? '...' : ''}`);
      }
      
      // Reset process state but KEEP username modal open
      setProcessStage("idle");
      enablementStartedRef.current = false;
      processCompletedRef.current = false;
      
      // CRITICAL: ALWAYS show the username modal for ANY error
      // We CANNOT proceed without a username
      setShowUsernameModal(true);
      
      console.log("Error during username registration, keeping username modal open for retry");
    }
  }, [onUsernameUpdate, updateUsernameFn, registerPlayerFn, onClose, handleSign]);
  
  // Helper function to handle username submission retry - ALWAYS go back to username modal
  const handleSubmit = useCallback((username: string) => {
    if (!username) return;
    
    // Reset ALL state
    setError(null);
    setProcessStage("idle");
    enablementStartedRef.current = false;
    processCompletedRef.current = false;
    
    // Store the username in the window object for persistent retries
    window.pendingUsername = username;
    
    // CRITICAL: Always go back to username modal first
    setTimeout(() => {
      // Clear any error state
      setError(null);
      // Show the username modal
      setShowUsernameModal(true);
    }, 100);
  }, []);

  // Handle modal close
  const handleClose = useCallback(() => {
    // Reset active connection flag
    connectionActiveRef.current = false;
    
    // Only reset completion flag if we weren't successful
    if (processStage !== "success") {
      processCompletedRef.current = false;
    } else {
      // Only update localStorage if we have a smart account address
      if (connectedAddress && smartAccountAddress) {
        localStorage.setItem("monad-runner-aa-enabled", "true");
        localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
        localStorage.setItem("monad-runner-aa-address", smartAccountAddress);
        console.log(`Stored smart account address in handleClose: ${smartAccountAddress}`);
      } else {
        console.error("Missing smart account address in handleClose, not setting AA as enabled");
        // Explicitly clear any potentially incorrect state
        localStorage.removeItem("monad-runner-aa-enabled");
      }
    }
    
    // Reset UI state and clear any pending username
    setProcessStage("idle");
    setError(null);
    
    // Clear any pending username and rate limit flags to ensure a fresh start next time
    window.pendingUsername = "";
    window.isRateLimited = false;
    window.rateLimitRetryCount = 0;
    
    // Call parent close handler
    onClose();
  }, [processStage, onClose, connectedAddress]);

  const isProcessing = processStage !== "idle" && processStage !== "success" && processStage !== "error";
  const { message: stageMessage, Icon } = stageDetails[processStage];

  return (
    <>
      {showUsernameModal ? (
        <UsernameModal
          walletAddress={connectedAddress || ""}
          onComplete={handleUsernameComplete}
          onCancel={() => {
            // When username modal is cancelled, close both modals
            setShowUsernameModal(false);
            onClose();
          }}
        />
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 max-w-md relative">
            {isProcessing && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50 rounded-xl">
                <div className="flex flex-col items-center p-6 text-center">
                  <Icon className="w-10 h-10 text-primary mb-4" />
                  <p className="text-white text-lg font-medium mb-2">{stageMessage}</p>
                  
                  {/* Show transaction hash if available */}
                  {transactionHash && ["tx-sent", "waiting-confirmation", "confirmed", "success"].includes(processStage) && (
                    <div className="mt-2 text-xs text-white/70 max-w-xs break-all">
                      <p className="mb-1">Transaction: {transactionHash.substring(0, 10)}...{transactionHash.substring(transactionHash.length - 8)}</p>
                      {smartAccountAddress && (
                        <p>Smart Account: {smartAccountAddress.substring(0, 6)}...{smartAccountAddress.substring(smartAccountAddress.length - 4)}</p>
                      )}
                    </div>
                  )}
                  
                  {/* Progress indicator */}
                  {["registering-account", "tx-sent", "waiting-confirmation"].includes(processStage) && (
                    <div className="w-64 bg-base-300 rounded-full h-2 mt-4 overflow-hidden">
                      <div className="bg-primary h-2 animate-pulse" style={{
                        width: processStage === "registering-account" ? "30%" :
                              processStage === "tx-sent" ? "60%" : 
                              processStage === "waiting-confirmation" ? "90%" : "0%"
                      }}></div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <h2 className="text-2xl font-bold mb-4">Enable Gasless Transactions</h2>
            <p className="mb-6">
              To enhance your experience, please sign the message below to enable account abstraction.
            </p>
            <div className="mb-4 p-4 bg-base-200 rounded-lg">
              <p className="font-mono text-sm break-words">{signatureMessage}</p>
            </div>
            {/* Show username requirement alert */}
            {!hasOnChainUsername && !username && (
              <div className="alert alert-warning mb-4">
                <FaExclamationTriangle className="w-5 h-5 mr-2" />
                <div className="flex flex-col w-full">
                  <span className="mb-2">
                    <strong>Username Required:</strong> You need to set an on-chain username before enabling Account Abstraction.
                  </span>
                  <button 
                    onClick={() => setShowUsernameModal(true)}
                    className="btn btn-sm btn-primary mt-1 self-end"
                  >
                    Set Username
                  </button>
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <div className="p-4 bg-base-200 rounded-lg">
                <p className="text-sm">
                  By signing, you'll create a smart contract account that:
                </p>
                <ul className="list-disc ml-5 mt-2 text-sm">
                  <li>Lets you play without paying gas</li>
                  <li>Works alongside your existing wallet</li>
                  <li>Makes transactions faster</li>
                  <li>Has a different address than your wallet</li>
                </ul>
                <p className="text-xs text-info mt-2">
                  Note: This will create a new smart account with a different address than your EOA
                </p>
              </div>
            </div>
            {processStage === "success" && (
              <div className="alert alert-success mb-4">
                <FaCheckCircle className="w-6 h-6 mr-2" />
                <span>Account Abstraction enabled successfully!</span>
              </div>
            )}
            {processStage === "error" && (
              <div className="alert alert-error mb-4">
                <FaExclamationTriangle className="w-6 h-6 mr-2" />
                <span>{error || "An unexpected error occurred"}</span>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={handleClose} className="btn btn-outline" disabled={isProcessing}>
                Cancel
              </button>
              <button
                onClick={handleSign}
                className="btn btn-secondary"
                disabled={isProcessing || !connectedAddress || processStage === "success" || (!hasOnChainUsername && !username)}
              >
                {processStage === "success" ? 
                  "Enabled" : 
                  (!hasOnChainUsername && !username) ? 
                    "Username Required" : 
                    "Sign & Enable AA"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EnableAAModal;