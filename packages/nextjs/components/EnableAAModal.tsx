"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSignMessage, useAccount } from "wagmi";

interface EnableAAModalProps {
  onSuccess: (signature: string, message: string) => void;
  onClose: () => void;
}

type ProcessStage =
  | "idle"
  | "signing"
  | "verifying-signature"
  | "initializing-wallet"
  | "retrieving-keys"
  | "registering-account"
  | "success"
  | "error";

const stageMessages: Record<ProcessStage, string> = {
  idle: "Ready to enable Account Abstraction",
  signing: "Signing message...",
  "verifying-signature": "Verifying signature...",
  "initializing-wallet": "Initializing smart wallet...",
  "retrieving-keys": "Retrieving secure keys...",
  "registering-account": "Registering smart account...",
  success: "Account Abstraction enabled successfully!",
  error: "An error occurred",
};

const EnableAAModal: React.FC<EnableAAModalProps> = ({ onSuccess, onClose }) => {
  const { address: connectedAddress } = useAccount();
  const [error, setError] = useState<string | null>(null);
  const [processStage, setProcessStage] = useState<ProcessStage>("idle");
  const [signatureMessage, setSignatureMessage] = useState<string>("");
  const [requestSent, setRequestSent] = useState(false);

  const generateMessage = useCallback(() => {
    const message = `Enable Account Abstraction for Monad Runner\nWallet: ${connectedAddress}\nTimestamp: ${Date.now()}`;
    setSignatureMessage(message);
    return message;
  }, [connectedAddress]);

  const { signMessage, data: signature, error: signError } = useSignMessage();

  useEffect(() => {
    if (connectedAddress) {
      generateMessage();
    }
  }, [connectedAddress, generateMessage]);

  useEffect(() => {
    if (signature && connectedAddress) {
      setProcessStage("verifying-signature");
      console.log("Signature generated:", {
        signature,
        message: signatureMessage,
        address: connectedAddress,
      });
      if (!requestSent) {
        setRequestSent(true);
        onSuccess(signature, signatureMessage);
      }
    }
  }, [signature, signatureMessage, onSuccess, connectedAddress, requestSent]);

  useEffect(() => {
    if (signError) {
      setProcessStage("error");
      setError(signError.message);
      setRequestSent(false);
    }
  }, [signError]);

  const handleSign = async () => {
    setProcessStage("signing");
    setError(null);
    setRequestSent(false);
    try {
      if (!connectedAddress) {
        throw new Error("No wallet connected");
      }
      const message = generateMessage();
      console.log("Attempting to sign message:", { message, address: connectedAddress });
      await signMessage({ message });
    } catch (err: any) {
      setProcessStage("error");
      setError(err.message);
      setRequestSent(false);
    }
  };

  const isProcessing = processStage !== "idle" && processStage !== "success" && processStage !== "error";

  const handleClose = () => {
    setProcessStage("idle");
    setError(null);
    setRequestSent(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 max-w-md relative">
        {isProcessing && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="flex flex-col items-center">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="text-white mt-4 text-center">{stageMessages[processStage]}</p>
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
            <p className="text-sm">By signing, you'll create a smart account that:</p>
            <ul className="list-disc ml-5 mt-2 text-sm">
              <li>Lets you play without paying gas</li>
              <li>Works with your existing wallet</li>
              <li>Makes transactions faster</li>
            </ul>
          </div>
        </div>
        {processStage === "success" && (
          <div className="alert alert-success mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Account Abstraction enabled successfully!</span>
          </div>
        )}
        {processStage === "error" && (
          <div className="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error || "An unexpected error occurred"}</span>
          </div>
        )}
        <div className="flex justify-between">
          <button onClick={handleClose} className="btn btn-outline" disabled={isProcessing}>
            Cancel
          </button>
          <button onClick={handleSign} className="btn btn-secondary" disabled={isProcessing || !connectedAddress || processStage === "success"}>
            {processStage === "success" ? "Enabled" : "Sign & Enable AA"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnableAAModal;
