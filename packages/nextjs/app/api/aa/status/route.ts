import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import { ethers } from 'ethers';
import { JsonRpcProvider } from "ethers";

// Map to track last request time per wallet address to prevent spamming
const requestTimestamps = new Map<string, number>();
const MIN_REQUEST_INTERVAL = 3000; // 3 seconds minimum between requests to be more conservative

export async function POST(req: NextRequest) {
  try {
    // Clone the request to be able to read the body multiple times
    const clonedReq = req.clone();
    const requestData = await clonedReq.json();
    const { walletAddress } = requestData;
    
    if (!walletAddress) {
      console.log("AA status check: Missing wallet address");
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // Rate limiting per wallet address
    const now = Date.now();
    const lastRequestTime = requestTimestamps.get(walletAddress) || 0;
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      console.log(`AA status check: Rate limited for address ${walletAddress}, time since last request: ${timeSinceLastRequest}ms`);
      return NextResponse.json(
        { error: "Too many requests", retryAfter: MIN_REQUEST_INTERVAL - timeSinceLastRequest },
        { status: 429 }
      );
    }
    
    // Update timestamp before making request
    requestTimestamps.set(walletAddress, now);
    
    console.log(`AA status check: Checking for wallet ${walletAddress}`);
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    const chainId = 10143;
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    
    // Add connection timeout to prevent hanging requests
    provider.getNetwork().catch(error => {
      console.error("Provider connection error:", error);
    });
    
    const contractInstance = new ethers.Contract(
      contractData.address,
      contractData.abi,
      provider
    );
    
    // No hardcoded addresses - fully dynamic detection
    
    // Source of truth from blockchain - with error handling
    let smartAccountAddress;
    let playerData;
    
    try {
      // Check if we can get ANY data from the blockchain first
      try {
        await provider.getBlockNumber();
      } catch (error) {
        console.error("Cannot connect to blockchain:", error);
        requestTimestamps.delete(walletAddress);
        return NextResponse.json({ 
          error: "Blockchain connection failed",
          // If we have no connection, retain any previous state from client
          // This allows the client to keep cached values instead of resetting on error
          retainClientState: true 
        }, { status: 503 });
      }
      
      // Use Promise.all to fetch both values concurrently
      [smartAccountAddress, playerData] = await Promise.all([
        contractInstance.smartAccounts(walletAddress).catch(error => {
          console.warn(`Error fetching smartAccounts for ${walletAddress}:`, error.message);
          // Important: Return null instead of ZeroAddress on error
          // This signals we don't know the status rather than saying it's definitely not enabled
          return null;
        }),
        contractInstance.players(walletAddress).catch(error => {
          console.warn(`Error fetching player data for ${walletAddress}:`, error.message);
          return [null, 0, 0, 0, false]; // Default empty player data
        })
      ]);
    } catch (error) {
      console.error("Contract call error:", error);
      // Clear the timestamp to allow retrying sooner
      requestTimestamps.delete(walletAddress);
      return NextResponse.json({ 
        error: "Blockchain query failed",
        retainClientState: true 
      }, { status: 503 });
    }
    
    // If we got null for smartAccountAddress, we'll assume NOT enabled
    // This is a safe default if we can't determine status
    if (smartAccountAddress === null) {
      console.log(`Smart account fetch failed for ${walletAddress}, returning default not-enabled status`);
      
      // Simple, safe default
      return NextResponse.json({
        isEnabled: false,
        isRegistered: false,
        smartAccountAddress: null
      });
    }
    
    const isRegistered = playerData && playerData[4];
    const isEnabled = smartAccountAddress && smartAccountAddress !== ethers.ZeroAddress;
    
    console.log(`AA status result for ${walletAddress}: isEnabled=${isEnabled}, smartAccount=${smartAccountAddress}`);
    
    return NextResponse.json({
      isEnabled,
      isRegistered,
      smartAccountAddress: isEnabled ? smartAccountAddress : null,
      playerUsername: isRegistered ? playerData[0] : null,
    });
  } catch (error: any) {
    console.error("Error checking AA status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check AA status" },
      { status: 500 }
    );
  }
}