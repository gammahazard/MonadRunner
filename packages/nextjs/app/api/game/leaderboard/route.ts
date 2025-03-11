// app/api/game/leaderboard/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function GET(req: NextRequest) {
  const requestId = `leaderboard-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Leaderboard API ${requestId}] Received leaderboard request`);
  
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") || "10";

  try {
    const response = await fetch(`${API_URL}/runnerapi/game/leaderboard?limit=${limit}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Leaderboard API ${requestId}] Backend error:`, result);
      return NextResponse.json(
        { error: result.error || "Failed to fetch leaderboard" },
        { status: response.status }
      );
    }

    console.log(`[Leaderboard API ${requestId}] Success:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error(`[Leaderboard API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process leaderboard request" }, { status: 500 });
  }
}