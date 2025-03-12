import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function POST(req: NextRequest) {
  const requestId = `replay-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Replay API ${requestId}] Received replay submission`);

  try {
    const data = await req.json();
    const { walletAddress, score, replayData } = data;

    if (!walletAddress) {
      console.warn(`[Replay API ${requestId}] Missing wallet address`);
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    if (score === undefined) {
      console.warn(`[Replay API ${requestId}] Missing score`);
      return NextResponse.json({ error: "Score is required" }, { status: 400 });
    }

    if (!Array.isArray(replayData)) {
      console.warn(`[Replay API ${requestId}] Invalid replay data`);
      return NextResponse.json({ error: "Replay data must be an array" }, { status: 400 });
    }

    // Forward the replay data to your backend replay endpoint
    const response = await fetch(`${API_URL}/runnerapi/game/replay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId,
      },
      body: JSON.stringify({ walletAddress, score, replayData }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Replay API ${requestId}] Backend error:`, result);
      return NextResponse.json({ error: result.error || "Failed to submit replay" }, { status: response.status });
    }

    console.log(`[Replay API ${requestId}] Success:`, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[Replay API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process replay submission" }, { status: 500 });
  }
}
