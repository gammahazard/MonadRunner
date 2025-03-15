import { NextRequest, NextResponse } from "next/server";

// A debugging route to check session state
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const address = url.searchParams.get('address');

    if (!address) {
      return NextResponse.json({
        error: "Address parameter is required"
      }, { status: 400 });
    }

    // Check backend status
    const backendResponse = await fetch(`https://api.gummybera.com/runnerapi/session/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAddress: address
      })
    });

    const backendData = await backendResponse.json();

    // Get current time to check validity
    const now = Math.floor(Date.now() / 1000);
    let validUntilTimestamp = 0;
    
    if (backendData?.sessionData?.validUntil) {
      validUntilTimestamp = Math.floor(new Date(backendData.sessionData.validUntil).getTime() / 1000);
    }

    // Return debug information
    return NextResponse.json({
      address,
      backendResponse: backendData,
      validUntilTimestamp,
      nowTimestamp: now,
      isStillValid: validUntilTimestamp > now,
      timeDifferenceSeconds: validUntilTimestamp - now,
      formattedTimeLeft: formatTime(Math.max(0, validUntilTimestamp - now))
    });
  } catch (error: any) {
    console.error("Session debug error:", error);
    return NextResponse.json({
      error: error.message || "Internal server error"
    }, { status: 500 });
  }
}

// Format seconds to HH:MM:SS
function formatTime(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return [hours, minutes, secs]
    .map(val => val.toString().padStart(2, "0"))
    .join(":");
}