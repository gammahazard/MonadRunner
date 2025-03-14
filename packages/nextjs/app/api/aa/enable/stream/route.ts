import { NextRequest, NextResponse } from "next/server";

// Configure the response headers for Server-Sent Events
const headers = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Access-Control-Allow-Origin": "*",
};

// Minimum duration for each stage in milliseconds
const MIN_STAGE_DURATION = 500;

// Track active streams to prevent duplicates
const activeStreams = new Map<string, boolean>();

// Track last request time per wallet for rate limiting
const lastStreamRequests = new Map<string, number>();

// Automatically clean up old stream records every 5 minutes
setInterval(() => {
  console.log(`Cleaning up stale stream records, current count: ${activeStreams.size}`);
  // Clear active streams
  activeStreams.clear();
  // Clear rate limit tracking
  lastStreamRequests.clear();
}, 5 * 60 * 1000);

// Helper to check rate limits
function isRateLimited(walletAddress: string): { limited: boolean, waitTime: number } {
  const now = Date.now();
  const lastRequest = lastStreamRequests.get(walletAddress) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // Minimum time between stream requests per wallet: 5 seconds to be more conservative
  const minRequestInterval = 5000;
  
  if (timeSinceLastRequest < minRequestInterval) {
    return { 
      limited: true, 
      waitTime: minRequestInterval - timeSinceLastRequest 
    };
  }
  
  // Update last request time
  lastStreamRequests.set(walletAddress, now);
  return { limited: false, waitTime: 0 };
}

// Helper function to create SSE messages
function formatSSE(event: string, data: any) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Server-Sent Events implementation to stream AA enablement stages
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const walletAddress = searchParams.get("walletAddress");
  const signature = searchParams.get("signature");
  const message = searchParams.get("message");
  const useEIP7702 = searchParams.get("useEIP7702") === "true";
  
  if (!walletAddress || !signature || !message) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }
  
  // Check rate limits 
  const rateLimitCheck = isRateLimited(walletAddress);
  if (rateLimitCheck.limited) {
    return NextResponse.json({
      error: "Rate limited, please wait before retrying",
      retryAfter: rateLimitCheck.waitTime,
    }, { status: 429 });
  }

  // Prevent duplicate streams for the same wallet
  const streamKey = `${walletAddress}:${signature.substring(0, 10)}`;
  if (activeStreams.has(streamKey)) {
    return NextResponse.json({
      error: "Stream already active for this wallet and signature",
    }, { status: 400 });
  }

  // Mark stream as active
  activeStreams.set(streamKey, true);
  
  // Create a streaming response
  const stream = new ReadableStream({
    start(controller) {
      console.log(`Starting SSE stream for wallet ${walletAddress}`);
      
      // Define all stages with appropriate timing
      const stages = [
        { stage: "verifying-signature", delay: 0 },
        { stage: "retrieving-relayer-key", delay: 1000 },
        { stage: "initializing-wallet", delay: 2000 },
        { stage: "retrieving-keys", delay: 3000 },
        { stage: "estimating-gas", delay: 4000 },
        { stage: "registering-account", delay: 5000 },
        { stage: "tx-sent", delay: 8000 },
        { stage: "waiting-confirmation", delay: 10000 },
        { stage: "confirmed", delay: 12000 },
        { stage: "success", delay: 13000 }
      ];
      
      // Send initial heartbeat and first stage immediately
      controller.enqueue(new TextEncoder().encode(formatSSE("heartbeat", { timestamp: Date.now() })));
      
      // Set up stage processing
      let isClosed = false;
      
      // Process stages
      stages.forEach((stageInfo, index) => {
        setTimeout(() => {
          if (isClosed) return;
          
          try {
            console.log(`Sending stage update: ${stageInfo.stage} for wallet ${walletAddress}`);
            const data = {
              stage: stageInfo.stage,
              timestamp: Date.now(),
              walletAddress,
              smartAccountAddress: useEIP7702 ? walletAddress : undefined,
              // Add mock txHash for tx stages
              ...(stageInfo.stage === "tx-sent" ? { txHash: "0x" + "1".repeat(64) } : {})
            };
            
            // Send the stage update
            controller.enqueue(new TextEncoder().encode(formatSSE("stage", data)));
            
            // If this is the last stage, close the stream
            if (index === stages.length - 1) {
              setTimeout(() => {
                if (!isClosed) {
                  isClosed = true;
                  try {
                    controller.close();
                  } catch (e) {
                    console.log("Controller already closed, ignoring");
                  }
                  activeStreams.delete(streamKey);
                  console.log(`Stream closed for wallet ${walletAddress}`);
                }
              }, 1000);
            }
          } catch (error) {
            console.error(`Error sending stage ${stageInfo.stage}:`, error);
            if (!isClosed) {
              try {
                controller.enqueue(new TextEncoder().encode(formatSSE("error", { 
                  error: "Internal server error", 
                  stage: stageInfo.stage 
                })));
              } catch (e) {
                // Ignore errors when enqueueing
              }
            }
          }
        }, stageInfo.delay);
      });
      
      // Cleanup timer to ensure the stream gets closed
      setTimeout(() => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch (e) {
            // Ignore errors when closing
          }
          activeStreams.delete(streamKey);
          console.log(`Force closed stream for wallet ${walletAddress} after timeout`);
        }
      }, 20000); // 20 second safety timeout
    }
  });
  
  // Return the SSE response
  return new Response(stream, { headers });
}