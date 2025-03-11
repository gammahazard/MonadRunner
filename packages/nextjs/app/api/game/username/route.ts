// app/api/game/username/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function POST(req: NextRequest) {
  const requestId = `username-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Username API ${requestId}] Received username update request`);

  try {
    const data = await req.json();
    const { walletAddress, username } = data;

    if (!walletAddress) {
      console.warn(`[Username API ${requestId}] Missing wallet address`);
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    if (!username) {
      console.warn(`[Username API ${requestId}] Missing username`);
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Basic Ethereum address validation
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(walletAddress)) {
      console.warn(`[Username API ${requestId}] Invalid wallet address format`);
      return NextResponse.json({ error: "Invalid wallet address format" }, { status: 400 });
    }

    // Username validation
    if (username.length > 20) {
      console.warn(`[Username API ${requestId}] Username too long`);
      return NextResponse.json({ error: "Username must be 20 characters or less" }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/runnerapi/user/update-username`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId
      },
      body: JSON.stringify({ walletAddress, username }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Username API ${requestId}] Backend error:`, result);
      return NextResponse.json(
        { error: result.error || "Failed to update username" },
        { status: response.status }
      );
    }

    console.log(`[Username API ${requestId}] Success:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error(`[Username API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process username update" }, { status: 500 });
  }
}