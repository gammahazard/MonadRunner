import { NextRequest, NextResponse } from "next/server";

// Minimum duration for each stage in milliseconds
const MIN_STAGE_DURATION = 500;

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const walletAddress = searchParams.get("walletAddress");
    const signature = searchParams.get("signature");
    const message = searchParams.get("message");
    const useEIP7702 = searchParams.get("useEIP7702") === "true";
  
    if (!walletAddress || !signature || !message) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }
  
    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");
  
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        
        const safeEnqueue = (stage: string, data: object = {}) => {
          if (isClosed) return;
          
          try {
            const payload = `event: stage\ndata: ${JSON.stringify({ stage, ...data })}\n\n`;
            controller.enqueue(new TextEncoder().encode(payload));
          } catch (err) {
            console.error("Enqueue error:", err);
          }
        };
  
        const safeClose = () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch (err) {
              console.error("Close error:", err);
            }
          }
        };
  
        try {
          const stages = [
            { name: "verifying-signature", duration: 1000 },
            { name: "initializing-wallet", duration: 1000, data: { smartAccountAddress: walletAddress } },
            { name: "retrieving-keys", duration: 1000 },
            { name: "estimating-gas", duration: 1000 },
            { name: "registering-account", duration: 1000 },
            { name: "tx-sent", duration: 2000, data: { txHash: "0x" + "1".repeat(64) } },
            { name: "waiting-confirmation", duration: 2000 },
            { name: "confirmed", duration: 1000 },
            { name: "success", duration: 2000 }
          ];
  
          for (const stage of stages) {
            if (isClosed) break;
            
            safeEnqueue(stage.name, stage.data || {});
            
            // Simulate stage duration
            await new Promise(resolve => setTimeout(resolve, stage.duration));
          }
        } catch (err) {
          console.error("Stream error:", err);
          safeEnqueue("error", { error: err.message });
        } finally {
          safeClose();
        }
      },
    });
  
    return new NextResponse(stream, { headers });
  }