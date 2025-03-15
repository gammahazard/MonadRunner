// app/api/game/score/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.gummybera.com";

export async function POST(req: NextRequest) {
  const requestId = `score-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Score API ${requestId}] Received score submission`);

  try {
    const data = await req.json();
    const { 
      walletAddress, 
      score, 
      replayData, 
      sessionPublicKey, 
      signature 
    } = data;

    // Validate required fields
    if (!walletAddress) {
      console.warn(`[Score API ${requestId}] Missing wallet address`);
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    if (score === undefined) {
      console.warn(`[Score API ${requestId}] Missing score`);
      return NextResponse.json({ error: "Score is required" }, { status: 400 });
    }

    if (!replayData) {
      console.warn(`[Score API ${requestId}] Missing replay data`);
      return NextResponse.json({ error: "Replay data is required" }, { status: 400 });
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
    
    // If using session key, forward to session transaction API
    if (sessionPublicKey && signature) {
      console.log(`[Score API ${requestId}] Session key provided, forwarding to session API`);
      
      try {
        // First check if the player is registered by calling the contract
        const checkPlayerResponse = await fetch(`${API_URL}/runnerapi/contract/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY as string,
            "Origin": req.headers.get("origin") || "",
            "X-Real-IP": req.headers.get("x-real-ip") || "",
            "x-request-id": requestId
          },
          body: JSON.stringify({
            contractAddress: "0x775dc8Be07165261E1ef6371854F600bb01B24E6",
            functionName: "players",
            args: [walletAddress]
          })
        });
        
        if (!checkPlayerResponse.ok) {
          console.warn(`[Score API ${requestId}] Failed to check player registration status`);
        } else {
          const playerData = await checkPlayerResponse.json();
          console.log(`[Score API ${requestId}] Player data:`, playerData);
          
          // Check if player exists in the contract
          if (!playerData.result || !playerData.result.exists) {
            console.error(`[Score API ${requestId}] Player ${walletAddress} not registered on-chain`);
            return NextResponse.json({
              error: "Player not registered on-chain. Please register before submitting scores."
            }, { status: 400 });
          }
        }
        
        // Generate a unique replay hash instead of using a hardcoded one
        const replayHash = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')}`;
          
        // Forward to session transaction API
        const sessionResponse = await fetch(`${API_URL}/runnerapi/session/transaction`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": API_KEY as string,
            "Origin": req.headers.get("origin") || "",
            "X-Real-IP": req.headers.get("x-real-ip") || "",
            "x-request-id": requestId
          },
          body: JSON.stringify({
            userAddress: walletAddress,
            publicKey: sessionPublicKey,
            signature,
            contractAddress: "0x775dc8Be07165261E1ef6371854F600bb01B24E6", // Hardcoded contract address
            functionName: "submitScoreFor",
            args: [
              walletAddress, 
              score.toString() || "1", 
              replayHash // Use a random unique hash to avoid collisions
            ]
          })
        });
        
        if (!sessionResponse.ok) {
          const errorData = await sessionResponse.json();
          throw new Error(errorData.error || "Session transaction failed");
        }
        
        const result = await sessionResponse.json();
        console.log(`[Score API ${requestId}] Session score submission successful:`, result);
        
        return NextResponse.json(result);
      } catch (error: any) {
        console.error(`[Score API ${requestId}] Error with session submission:`, error);
        return NextResponse.json({ 
          error: error.message || "Failed to submit score with session key" 
        }, { status: 500 });
      }
    }
    
    // If no session key, use the regular API
    console.log(`[Score API ${requestId}] Using regular API to submit score`);
    
    const response = await fetch(`${API_URL}/runnerapi/game/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY as string,
        "Origin": req.headers.get("origin") || "",
        "X-Real-IP": req.headers.get("x-real-ip") || "",
        "x-request-id": requestId
      },
      body: JSON.stringify({ walletAddress, score, replayData }),
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

  } catch (error: any) {
    console.error(`[Score API ${requestId}] Error:`, error);
    return NextResponse.json({ error: "Failed to process score submission" }, { status: 500 });
  }
}