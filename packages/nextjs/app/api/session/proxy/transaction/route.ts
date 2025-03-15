import { NextRequest, NextResponse } from "next/server";

// Use the MongoDB API endpoint for transactions
const API_URL = "https://api.gummybera.com/runnerapi/session/transaction";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { 
      userAddress, 
      publicKey, 
      signature, 
      contractAddress,
      functionName, 
      args = [] 
    } = body;
    
    // IMPORTANT: Always make sure contractAddress is defined
    if (!contractAddress) {
      contractAddress = "0x775dc8Be07165261E1ef6371854F600bb01B24E6";
      console.log("No contract address provided, using default:", contractAddress);
    }
    
    // Add request ID and timestamp for debugging
    const requestId = `tx-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Session Proxy ${requestId}] Transaction request for ${functionName} from ${userAddress}`);
    
    // Validate required parameters
    if (!userAddress || !publicKey || !signature) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }
    
    // Forward the request to the MongoDB API server
    console.log(`[Session Proxy ${requestId}] Forwarding ${functionName} request to API`);
    console.log(`[Session Proxy ${requestId}] Request data:`, {
      userAddress, 
      publicKey: publicKey?.substring(0, 20) + '...',
      contractAddress: contractAddress || "0x775dc8Be07165261E1ef6371854F600bb01B24E6",
      functionName,
      args
    });
    
    try {
      // Set any API key from environment if available
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      };
      
      if (process.env.API_KEY) {
        headers["x-api-key"] = process.env.API_KEY;
      }
      
      // Make sure we include the contract address in the API call
      const apiPayload = {
        ...body,
        contractAddress: contractAddress
      };
      
      const response = await fetch(API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(apiPayload),
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
        console.log(`[Session Proxy ${requestId}] Transaction successful:`, data.txHash || "No txHash returned");
      } else {
        console.error(`[Session Proxy ${requestId}] Transaction failed:`, data.error || "Unknown error");
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
    console.error("Error processing session transaction:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}