// app/api/game/score/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function POST(req: NextRequest) {
  const requestId = `score-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Score API ${requestId}] Received score submission`);

  try {
    const data = await req.json();
    const { walletAddress, score } = data;

    if (!walletAddress) {
      console.warn(`[Score API ${requestId}] Missing wallet address`);
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    if (score === undefined) {
      console.warn(`[Score API ${requestId}] Missing score`);
      return NextResponse.json({ error: "Score is required" }, { status: 400 });
    }

    // Basic Ethereum address validation
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(walletAddress)) {
      console.warn(`[Score API ${requestId}] Invalid wallet address format`);
      return NextResponse.json({ error: "Invalid wallet address format" }, { status: 400 });
    }

    // Basic score validation
    if (typeof score !== "number" || score < 0) {
      console.warn(`[Score API ${requestId}] Invalid score format`);
      return NextResponse.json({ error: "Score must be a positive number" }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/runnerapi/game/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId
      },
      body: JSON.stringify({ walletAddress, score }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Score API ${requestId}] Backend error:`, result);
      return NextResponse.json(
        { error: result.error || "Failed to submit score" },
        { status: response.status }
      );
    }

    console.log(`[Score API ${requestId}] Success:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error(`[Score API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process score submission" }, { status: 500 });
  }
}