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
  useEIP7702?: boolean;
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
  useEIP7702 = true, 
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
    // If process is in an error state, don't show the username modal automatically
    if (processStage === "error") {
      return;
    }
    
    // If we have an on-chain username, use that to avoid requesting it again
    if (hasOnChainUsername && !username) {
      console.log("Found on-chain username:", playerData?.username);
      onUsernameUpdate(playerData?.username || "");
      setShowUsernameModal(false);
      return;
    }
    
    // Check for any pending username from previous attempts
    if (!username && window.pendingUsername) {
      console.log("Found pending username:", window.pendingUsername);
      onUsernameUpdate(window.pendingUsername);
    }
    
    // If no username from props or on-chain, show the modal
    if (!username && !hasOnChainUsername) {
      console.log("No username found, showing modal");
      setShowUsernameModal(true);
    } else {
      setShowUsernameModal(false);
    }
  }, [username, hasOnChainUsername, playerData, onUsernameUpdate, processStage]);

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
            useEIP7702: useEIP7702 ? "true" : "false"
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
                  
                  // Store in localStorage
                  if (connectedAddress) {
                    localStorage.setItem("monad-runner-aa-enabled", "true");
                    localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                    localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress || connectedAddress);
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
                useEIP7702,
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
                  
                  // Store in localStorage
                  if (connectedAddress) {
                    localStorage.setItem("monad-runner-aa-enabled", "true");
                    localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                    localStorage.setItem("monad-runner-aa-address", data.smartAccountAddress || connectedAddress);
                  }
                  
                  // Dispatch event
                  window.dispatchEvent(new CustomEvent('aa-status-changed', {
                    detail: {
                      isEnabled: true,
                      address: connectedAddress,
                      smartAccountAddress: data.smartAccountAddress || connectedAddress,
                      fromSuccess: true
                    }
                  }));
                  
                  // Notify parent after a small delay
                  setTimeout(() => {
                    if (isMounted) {
                      onSuccess(signature, messageRef.current);
                    }
                  }, 500);
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
                
                // Store in localStorage
                if (connectedAddress) {
                  localStorage.setItem("monad-runner-aa-enabled", "true");
                  localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
                  localStorage.setItem("monad-runner-aa-address", data?.smartAccountAddress || connectedAddress);
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
  }, [signature, connectedAddress, username, useEIP7702, onSuccess]);

  // Start the signing process
  const handleSign = useCallback(async () => {
    console.log("handleSign called with state:", {
      hasOnChainUsername,
      username,
      playerUsername: playerData?.username,
      isProcessStarted: enablementStartedRef.current,
      processStage
    });
    
    // Reset enablement flags to ensure we can restart the process
    enablementStartedRef.current = false;
    processCompletedRef.current = false;
    
    // IMPORTANT: The user must have a username set, either on-chain or from the form
    const hasUsername = hasOnChainUsername || !!username;
    
    if (!hasUsername) {
      console.log("No username available, showing username modal");
      setShowUsernameModal(true);
      return;
    }
    
    // For on-chain usernames, make sure it's in our state
    if (hasOnChainUsername && !username && playerData?.username) {
      await onUsernameUpdate(playerData.username);
    }
    
    // Start signing
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
            
            // For other errors, we still can't proceed without username
            console.warn("Contract call error, can't proceed without username:", error.message);
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
      
      // First try to update, then fall back to register if needed
      let usernameSuccess = await tryContractCall(updateUsernameFn, {
        functionName: "updateUsername",
        args: [newUsername]
      });
      
      // If update failed, it might be because the player is not registered
      if (!usernameSuccess) {
        console.log("Update failed, trying registration instead");
        usernameSuccess = await tryContractCall(registerPlayerFn, {
          functionName: "registerPlayer",
          args: [newUsername]
        });
      }
      
      // We can ONLY proceed if the username transaction was successful
      if (usernameSuccess) {
        console.log("Username transaction successful, proceeding to signing");
        
        // Close the username modal
        setShowUsernameModal(false);
        
        // Reset process state to idle before continuing
        setProcessStage("idle");
        
        // Reset enablement flags to allow restarting the process
        enablementStartedRef.current = false;
        processCompletedRef.current = false;
        
        // Move to signing stage with a slight delay
        setTimeout(() => {
          console.log("Proceeding to signing process");
          handleSign();
        }, 500);
      } else {
        // For ANY failure, even after retries, ALWAYS return to username modal
        console.error("Failed to register username, going back to username modal");
        
        // Reset ALL state
        setProcessStage("idle");
        setError(null);
        enablementStartedRef.current = false;
        processCompletedRef.current = false;
        
        // Save username for retry if available
        if (newUsername) {
          window.pendingUsername = newUsername;
        }
        
        // CRITICAL: Always go back to the username modal for ANY username failure
        setShowUsernameModal(true);
      }
      
    } catch (err: any) {
      console.error("Error in username handling:", err);
      
      // Handle user rejection - show username modal again
      if (err.message?.includes("User denied") || 
          err.message?.includes("User rejected")) {
        console.log("User rejected transaction - returning to username modal");
        
        // Clear rate limit flags
        window.pendingUsername = "";
        window.isRateLimited = false;
        window.rateLimitRetryCount = 0;
        
        // Show the username modal again
        setShowUsernameModal(true);
        setProcessStage("idle");
        setError(null);
        return;
      }
      
      // We CANNOT proceed without username - always go back to username modal for ALL errors
      console.log("Error during username registration, showing username modal:", err.message);
      
      // Store the current username for retry if available
      if (newUsername) {
        window.pendingUsername = newUsername;
      }
      
      // Reset ALL state
      setProcessStage("idle");
      setError(null);
      enablementStartedRef.current = false;
      processCompletedRef.current = false;
      
      // CRITICAL: Always go back to the username modal when there are errors
      // with username setting - we CANNOT proceed without a username
      setShowUsernameModal(true);
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
      // Update localStorage
      if (connectedAddress) {
        localStorage.setItem("monad-runner-aa-enabled", "true");
        localStorage.setItem("monad-runner-aa-wallet", connectedAddress);
        localStorage.setItem("monad-runner-aa-address", connectedAddress);
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
      {showUsernameModal && !username ? (
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
                  By signing, you'll {useEIP7702 ? "upgrade your existing wallet account" : "create a smart account"} that:
                </p>
                <ul className="list-disc ml-5 mt-2 text-sm">
                  <li>Lets you play without paying gas</li>
                  <li>Works with your existing wallet</li>
                  <li>Makes transactions faster</li>
                  {useEIP7702 && <li>Uses EIP-7702 to upgrade your regular wallet</li>}
                </ul>
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
                    `Sign & Enable ${useEIP7702 ? "EIP‑7702" : "AA"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EnableAAModal;