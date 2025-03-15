import { NextRequest, NextResponse } from "next/server";

const API_URL = "https://api.gummybera.com/runnerapi/session/revoke";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Forward the request to the API server
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    // Get the response data
    const data = await response.json();
    
    // Return the response with the same status code
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Error proxying session revocation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}