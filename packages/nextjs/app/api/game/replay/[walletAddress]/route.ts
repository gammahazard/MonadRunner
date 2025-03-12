import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function GET(req: NextRequest, { params }: { params: { walletAddress: string } }) {
  const requestId = `getreplay-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Replay GET API ${requestId}] Fetching replays for wallet: ${params.walletAddress}`);

  try {
    // Forward the request to your backend replay retrieval endpoint
    const response = await fetch(`${API_URL}/runnerapi/game/replay/${params.walletAddress}`, {
      method: "GET",
      headers: {
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Replay GET API ${requestId}] Backend error:`, result);
      return NextResponse.json({ error: result.error || "Failed to fetch replays" }, { status: response.status });
    }

    console.log(`[Replay GET API ${requestId}] Success:`, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[Replay GET API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process replay fetch" }, { status: 500 });
  }
}
