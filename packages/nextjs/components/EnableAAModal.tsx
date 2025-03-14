"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSignMessage, useAccount } from "wagmi";
import UsernameModal from "./UsernameModal";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth"; 
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
  onUsernameUpdate,
}) => {
  const { address: connectedAddress } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [processStage, setProcessStage] = useState<ProcessStage>(initialStage as ProcessStage);
  const [signatureMessage, setSignatureMessage] = useState<string>("");
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageRef = useRef<string>("");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const connectionActiveRef = useRef(false);
  const processCompletedRef = useRef(false);
  
  // Get contract write functions
  const { writeContractAsync: registerPlayerFn } = useScaffoldWriteContract("MonadRunnerGame");
  const { writeContractAsync: updateUsernameFn } = useScaffoldWriteContract("MonadRunnerGame");

  // Show UsernameModal if no username is provided.
  useEffect(() => {
    if (!username) {
      setShowUsernameModal(true);
    } else {
      setShowUsernameModal(false);
    }
  }, [username]);

  const generateMessage = useCallback(() => {
    const msg = `Enable Account Abstraction for Monad Runner\nWallet: ${connectedAddress}\nTimestamp: ${Date.now()}`;
    setSignatureMessage(msg);
    messageRef.current = msg;
    return msg;
  }, [connectedAddress]);

  const { signMessage, data: signature, error: signError } = useSignMessage();

  useEffect(() => {
    // Only run this effect if we have a signature
    if (!signature || !connectedAddress || !username) return;

    // Prevent multiple simultaneous processes
    if (processCompletedRef.current || connectionActiveRef.current) {
      console.log("Process already in progress or completed");
      return;
    }

    // Mark process as started
    connectionActiveRef.current = true;

    let isMounted = true; // Track if component is still mounted

    const enableAA = async () => {
      try {
        // Prevent re-entry
        if (processCompletedRef.current) return;

        // Single POST request
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

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to enable account abstraction");
        }

        const data = await response.json();
        
        // Only update state if component is still mounted
        if (!isMounted) return;
        
        // Mark process as completed to prevent re-entry
        processCompletedRef.current = true;
        
        setTransactionHash(data.txHash);
        setSmartAccountAddress(data.smartAccountAddress || connectedAddress);
        
        setProcessStage("success");
        
        // Setup event source only once
        if (!eventSourceRef.current) {
          const query = new URLSearchParams({
            walletAddress: connectedAddress,
            signature,
            message: messageRef.current,
            useEIP7702: useEIP7702 ? "true" : "false",
          }).toString();

          const es = new EventSource(`/api/aa/enable/stream?${query}`);
          eventSourceRef.current = es;
          
          es.addEventListener("stage", (event) => {
            try {
              if (processCompletedRef.current || !isMounted) {
                es.close();
                return;
              }
              
              const data = JSON.parse(event.data);
              console.log("Received stage update:", data);
              
              if (data.stage && isMounted) {
                setProcessStage(data.stage as ProcessStage);
              }
              
              if (data.stage === "success") {
                es.close();
                eventSourceRef.current = null;
              }
            } catch (err) {
              console.error("Error parsing SSE event:", err);
            }
          });
          
          es.onerror = (err) => {
            console.error("SSE connection error:", err);
            es.close();
            eventSourceRef.current = null;
          };
        }
        
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('aa-status-changed', {
          detail: {
            isEnabled: true,
            address: connectedAddress,
            smartAccountAddress: data.smartAccountAddress || connectedAddress
          }
        }));
        
        // Call success callback with delay to avoid state updates during render
        if (isMounted) {
          const timer = setTimeout(() => {
            if (isMounted) onSuccess(signature, messageRef.current);
          }, 500);
          return () => clearTimeout(timer);
        }

      } catch (error: any) {
        console.error("Error enabling AA:", error);
        if (isMounted) {
          setProcessStage("error");
          setError(error.message || "Failed to enable account abstraction");
        }
      } finally {
        connectionActiveRef.current = false;
      }
    };

    enableAA();

    // Cleanup function
    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      connectionActiveRef.current = false;
      processCompletedRef.current = false;
    };
  }, [signature, connectedAddress, username, useEIP7702, onSuccess]);


  // Handle signature errors
  useEffect(() => {
    if (signError) {
      setProcessStage("error");
      setError(signError.message);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        connectionActiveRef.current = false;
      }
    }
  }, [signError]);

  // When the UsernameModal completes, update the username on-chain and then proceed with signing.
  const handleUsernameComplete = async (newUsername: string) => {
    try {
      // First, update the parent component's state
      await onUsernameUpdate(newUsername);
      
      setShowUsernameModal(false);
      
      // Proceed with the signing process immediately
      // The parent component will handle any contract updates needed
      handleSign();
    } catch (err: any) {
      console.error("Error updating username:", err);
      setError(err.message || "Failed to update username");
      setProcessStage("error");
    }
  };

  // Start the signing process.
  const handleSign = async () => {
    if (!username) {
      setShowUsernameModal(true);
      return;
    }
    
    // Reset state
    setProcessStage("signing");
    setError(null);
    setTransactionHash(null);
    setSmartAccountAddress(null);
    processCompletedRef.current = false;
    
    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      connectionActiveRef.current = false;
    }
    
    try {
      if (!connectedAddress) {
        throw new Error("No wallet connected");
      }
      const msg = generateMessage();
      console.log("Attempting to sign message:", { message: msg, address: connectedAddress });
      await signMessage({ message: msg });
    } catch (err: any) {
      setProcessStage("error");
      setError(err.message);
    }
  };

  const isProcessing = processStage !== "idle" && processStage !== "success" && processStage !== "error";
  const { message: stageMessage, Icon } = stageDetails[processStage];

  const handleClose = () => {
    // Clean up
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      connectionActiveRef.current = false;
    }
    
    processCompletedRef.current = false;
    setProcessStage("idle");
    setError(null);
    onClose();
  };

  return (
    <>
      {showUsernameModal && !username ? (
        <UsernameModal
          walletAddress={connectedAddress || ""}
          onComplete={handleUsernameComplete}
          onCancel={() => setShowUsernameModal(false)}
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
                disabled={isProcessing || !connectedAddress || processStage === "success"}
              >
                {processStage === "success" ? "Enabled" : `Sign & Enable ${useEIP7702 ? "EIP‑7702" : "AA"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EnableAAModal;