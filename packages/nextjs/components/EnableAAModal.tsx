"use client";

import React, { useState, useEffect } from "react";
import { useSignMessage } from "wagmi";

interface EnableAAModalProps {
  onSuccess: (signature: string, message: string) => void;
  onClose: () => void;
}

const EnableAAModal: React.FC<EnableAAModalProps> = ({ onSuccess, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const message = "Enable account abstraction for Monad Runner"; // Optionally include a nonce in production

  // Set up the useSignMessage hook without initial config.
  const { signMessage, data, error: signError } = useSignMessage();

  // When the signature data becomes available, call onSuccess.
  useEffect(() => {
    if (data) {
      setLoading(false);
      onSuccess(data, message);
    }
  }, [data, message, onSuccess]);

  // Update error state if an error occurs.
  useEffect(() => {
    if (signError) {
      setLoading(false);
      setError(signError.message);
    }
  }, [signError]);

  const handleSign = async () => {
    setLoading(true);
    setError(null);
    try {
      await signMessage({ message });
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass backdrop-blur-md p-8 rounded-xl border border-base-300 max-w-md">
        <h2 className="text-2xl font-bold mb-4">Enable Gasless Transactions</h2>
        <p className="mb-6">
          To enhance your experience, please sign the message below to enable account abstraction.
        </p>
        <div className="mb-4">
          <p className="font-mono text-sm break-words">{message}</p>
        </div>
        {error && <p className="text-error">{error}</p>}
        <div className="flex justify-between">
          <button onClick={onClose} className="btn btn-outline" disabled={loading}>
            Cancel
          </button>
          <button onClick={handleSign} className="btn btn-secondary" disabled={loading}>
            {loading ? "Signing..." : "Sign & Enable AA"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnableAAModal;
