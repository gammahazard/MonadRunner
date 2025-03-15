import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.gummybera.com/runnerapi/session/status";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userAddress } = body;
    
    // Add request ID for debugging
    const requestId = `status-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    if (!userAddress) {
      return NextResponse.json({ error: "User address is required" }, { status: 400 });
    }
    
    console.log(`[Session Proxy ${requestId}] Checking session status for ${userAddress}`);
    
    // Forward the request to the MongoDB API server
    try {
      // Set any API key from environment if available
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      };
      
      if (process.env.API_KEY) {
        headers["x-api-key"] = process.env.API_KEY;
      }
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      
      // Get the response data
      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error(`[Session Proxy ${requestId}] Failed to parse API response:`, e);
        data = { error: "Invalid response from API" };
      }
      
      // Log the result
      if (response.ok) {
        console.log(`[Session Proxy ${requestId}] Status check result:`, data.hasSession ? "Active session" : "No active session");
      } else {
        console.error(`[Session Proxy ${requestId}] Status check failed:`, data.error || "Unknown error");
      }
      
      // Return the API response with the same status code
      return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
      console.error(`[Session Proxy ${requestId}] API connection error:`, error);
      return NextResponse.json(
        { error: "Failed to connect to backend server", details: error.message },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error("Error processing session status request:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}