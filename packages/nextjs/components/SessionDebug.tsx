"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useSession } from "~~/providers/SessionProvider";
import { useLocalStorage } from "~~/hooks/useLocalStorage";

const SessionDebug: React.FC = () => {
  const { address: connectedAddress } = useAccount();
  const { 
    sessionKey, 
    isSessionEnabled: sessionEnabledFromContext, 
    isSessionValid, 
    getSessionTimeLeft,
    forceSessionCheck
  } = useSession();
  
  const [debugData, setDebugData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isSessionEnabledStorage, setIsSessionEnabledStorage] = useLocalStorage<boolean>("monad-runner-session-enabled", false, true);

  // Function to format time for display
  const formatTime = (timestamp: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get debug data from the server
  const fetchDebugData = async () => {
    if (!connectedAddress) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/session/debug?address=${connectedAddress}`);
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error("Error fetching debug data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Force a session check
  const handleForceCheck = async () => {
    if (forceSessionCheck) {
      await forceSessionCheck();
    }
  };

  return (
    <div className="p-4 bg-base-200 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Session Debug Tool</h2>
      
      <div className="flex flex-wrap gap-4 mb-4">
        <button 
          onClick={fetchDebugData} 
          className="btn btn-sm btn-primary"
          disabled={loading || !connectedAddress}
        >
          {loading ? "Loading..." : "Check Backend Session"}
        </button>
        
        <button 
          onClick={handleForceCheck} 
          className="btn btn-sm btn-secondary"
          disabled={!forceSessionCheck || !connectedAddress}
        >
          Force Session Check
        </button>

        <button 
          onClick={() => {
            // Fix isSessionEnabled in localStorage if session is valid but not enabled
            if (isSessionValid() && !isSessionEnabledStorage) {
              setIsSessionEnabledStorage(true);
              alert('Session Enabled flag set to TRUE. Refresh the page to see changes.');
            } else if (!isSessionValid() && isSessionEnabledStorage) {
              setIsSessionEnabledStorage(false);
              alert('Session Enabled flag set to FALSE. Refresh the page to see changes.');
            } else {
              alert(`No changes needed. Session Valid: ${isSessionValid()}, Session Enabled in Storage: ${isSessionEnabledStorage}`);
            }
          }} 
          className="btn btn-sm btn-accent"
        >
          Fix Session State
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-base-100 p-4 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Client State</h3>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <tbody>
                <tr>
                  <td className="font-semibold">Address</td>
                  <td>{connectedAddress || "Not connected"}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Session Enabled (Context)</td>
                  <td>{sessionEnabledFromContext ? "Yes" : "No"}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Session Enabled (Storage)</td>
                  <td>{isSessionEnabledStorage ? "Yes" : "No"}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Session Valid</td>
                  <td>{isSessionValid() ? "Yes" : "No"}</td>
                </tr>
                <tr>
                  <td className="font-semibold">Time Left</td>
                  <td>{formatTime(Math.floor(Date.now()/1000) + getSessionTimeLeft())}</td>
                </tr>
                {sessionKey && (
                  <>
                    <tr>
                      <td className="font-semibold">Session Public Key</td>
                      <td className="truncate max-w-[200px]">
                        {sessionKey.sessionPublicKey?.substring(0, 20)}...
                      </td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Valid Until (Local)</td>
                      <td>{formatTime(sessionKey.validUntil)}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">User Address</td>
                      <td>{sessionKey.userAddress}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {debugData && (
          <div className="bg-base-100 p-4 rounded-md">
            <h3 className="text-lg font-semibold mb-2">Backend State</h3>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td className="font-semibold">Has Session</td>
                    <td>{debugData.backendResponse?.hasSession ? "Yes" : "No"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Still Valid</td>
                    <td>{debugData.isStillValid ? "Yes" : "No"}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Valid Until</td>
                    <td>{formatTime(debugData.validUntilTimestamp)}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Current Time</td>
                    <td>{formatTime(debugData.nowTimestamp)}</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Time Left</td>
                    <td>{debugData.formattedTimeLeft}</td>
                  </tr>
                  {debugData.backendResponse?.sessionData && (
                    <tr>
                      <td className="font-semibold">Session Public Key</td>
                      <td className="truncate max-w-[200px]">
                        {debugData.backendResponse.sessionData.publicKey?.substring(0, 20)}...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {debugData && (
        <div className="mt-4 bg-base-100 p-4 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Raw Debug Data</h3>
          <pre className="text-xs overflow-auto max-h-[200px] bg-base-300 p-2 rounded">
            {JSON.stringify(debugData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default SessionDebug;