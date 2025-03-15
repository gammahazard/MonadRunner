import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.gummybera.com/runnerapi/session/register";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userAddress, publicKey, signature, validUntil } = body;
    
    // Add request ID for debugging
    const requestId = `register-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Session Proxy ${requestId}] Session registration for ${userAddress}`);
    
    // Basic validation before forwarding
    if (!userAddress || !publicKey || !signature || !validUntil) {
      console.warn(`[Session Proxy ${requestId}] Missing required parameters`);
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }
    
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
      
      console.log(`[Session Proxy ${requestId}] Forwarding registration to API for ${userAddress}`);
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
        console.log(`[Session Proxy ${requestId}] Registration successful`);
      } else {
        console.error(`[Session Proxy ${requestId}] Registration failed:`, data.error || "Unknown error");
      }
      
      // Return the API response with the same status code
      return NextResponse.json(data, { status: response.status });
    } catch (apiError: any) {
      console.error(`[Session Proxy ${requestId}] API connection error:`, apiError);
      return NextResponse.json({ 
        error: "Failed to connect to backend server", 
        details: apiError.message 
      }, { status: 502 });
    }
  } catch (error: any) {
    console.error(`[Session Proxy] Error in session registration:`, error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}