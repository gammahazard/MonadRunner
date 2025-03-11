// app/api/game/user/[walletAddress]/stats/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function GET(
  req: NextRequest,
  { params }: { params: { walletAddress: string } }
) {
  const walletAddress = params.walletAddress;
  const requestId = `stats-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Stats API ${requestId}] Received stats request for ${walletAddress}`);

  if (!walletAddress) {
    console.warn(`[Stats API ${requestId}] Missing wallet address`);
    return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
  }

  // Basic Ethereum address validation
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!addressRegex.test(walletAddress)) {
    console.warn(`[Stats API ${requestId}] Invalid wallet address format`);
    return NextResponse.json({ error: "Invalid wallet address format" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_URL}/runnerapi/game/user/${walletAddress}/stats`, {
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
      console.error(`[Stats API ${requestId}] Backend error:`, result);
      return NextResponse.json(
        { error: result.error || "Failed to fetch user stats" },
        { status: response.status }
      );
    }

    console.log(`[Stats API ${requestId}] Success:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error(`[Stats API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process user stats request" }, { status: 500 });
  }
}