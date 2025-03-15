"use client";

import React from "react";
import SessionDebug from "~~/components/SessionDebug";

export default function SessionDebugPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Session Debug Page</h1>
      <p className="mb-8">
        This page helps debug session key issues between the frontend and backend.
      </p>
      
      <SessionDebug />
      
      <div className="mt-8 p-4 bg-base-200 rounded-lg">
        <h2 className="text-xl font-bold mb-2">How to use this tool</h2>
        <ul className="list-disc pl-6">
          <li className="mb-2">Click "Check Backend Session" to verify the session status on the server</li>
          <li className="mb-2">Click "Force Session Check" to manually trigger a session check from the frontend and update local state</li>
          <li className="mb-2">Compare the client state (from browser) with the backend state to identify mismatches</li>
          <li className="mb-2">If the backend shows a valid session but the frontend doesn't, try refreshing the page or forcing a check</li>
        </ul>
      </div>
    </div>
  );
}