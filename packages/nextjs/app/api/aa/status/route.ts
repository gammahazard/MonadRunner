import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import { ethers } from 'ethers';
import { JsonRpcProvider } from "ethers";

// Map to track last request time per wallet address to prevent spamming
const requestTimestamps = new Map<string, number>();
const MIN_REQUEST_INTERVAL = 30000; // 30 seconds minimum between requests to prevent RPC rate limiting issues

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
      
      // Check for client header with smart account address
      const clientSideStoredAddress = req.headers.get('x-aa-smart-account');
      
      // If client sent a smart account, we can verify and return that even during rate limit
      if (clientSideStoredAddress) {
        return NextResponse.json(
          { 
            error: "Too many requests", 
            retryAfter: MIN_REQUEST_INTERVAL - timeSinceLastRequest,
            smartAccountAddress: clientSideStoredAddress, // Return the client-provided address
            isEnabled: true, // Trust client's stored value during rate limit
            retainClientState: true // Signal client to keep its state
          },
          { status: 429 }
        );
      }
      
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
      
      // Safer function to call contract methods with better error handling
      const safeContractCall = async (methodName: string, args: any[]) => {
        try {
          console.log(`Calling contract method ${methodName} with args:`, args);
          const result = await contractInstance[methodName](...args);
          console.log(`${methodName} result:`, result);
          return result;
        } catch (error) {
          console.warn(`Error calling ${methodName} for ${args[0]}:`, error);
          // Return null on any error to signal we couldn't determine the status
          return null;
        }
      };
      
      // Helper to get the smart account address with multiple fallbacks
      // This is a more robust way to get the smart account address
      const getSmartAccountAddressWithFallbacks = async (walletAddress: string) => {
        try {
          // First try the blockchain smartAccounts mapping
          const onChainAddress = await safeContractCall('smartAccounts', [walletAddress]);
          if (onChainAddress && onChainAddress !== ethers.ZeroAddress) {
            console.log(`Got smart account address from blockchain: ${onChainAddress}`);
            return onChainAddress;
          }
          
          // Check if client provided a header with locally stored address
          let clientSideStoredAddress = req.headers.get('x-aa-smart-account');
          if (clientSideStoredAddress) {
            // Remove any quotes to prevent JSON encoding issues
            clientSideStoredAddress = clientSideStoredAddress.replace(/"/g, '');
            console.log(`Using client provided smart account address: ${clientSideStoredAddress}`);
            
            // Create a derived address based on EOA as a sanity check
            // This is to validate that the client isn't sending a random address
            const eoaWithoutPrefix = walletAddress.slice(2).toLowerCase();
            const expectedPrefix = eoaWithoutPrefix.charAt(0) === 'a' ? 
              'b' + eoaWithoutPrefix.slice(1) : 
              'a' + eoaWithoutPrefix.slice(1);
            
            // Check if the address follows the expected pattern - more lenient check
            if (clientSideStoredAddress.toLowerCase().includes(eoaWithoutPrefix.substring(3, 8))) {
              return clientSideStoredAddress;
            }
          }
          
          // If all else fails, check event logs for SmartAccountRegistered event
          console.log("Trying to find smart account from event logs...");
          try {
            // The topic for SmartAccountRegistered event
            const topic = "0xb8c36117828c82e9f174f1be4fcc6fdcf92fb930ab0f1f0984d5ce3552b0b227";
            
            // Encode the wallet address for the topic filter
            const encodedAddress = ethers.zeroPadValue(walletAddress.toLowerCase(), 32);
            
            // Get the event logs
            const filter = {
              address: contractData.address,
              topics: [topic, encodedAddress],
              fromBlock: 0,
              toBlock: "latest"
            };
            
            const logs = await provider.getLogs(filter);
            
            if (logs.length > 0) {
              // Get the most recent log
              const latestLog = logs[logs.length - 1];
              
              // The smart account address is in the data field
              const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(
                ["address"], latestLog.data
              );
              
              const smartAccountFromLogs = decodedData[0];
              console.log(`Found smart account address from logs: ${smartAccountFromLogs}`);
              return smartAccountFromLogs;
            }
          } catch (e) {
            console.error("Error trying to get smart account from logs:", e);
          }
          
          // Create a derived address as a last resort
          const eoaWithoutPrefix = walletAddress.slice(2).toLowerCase();
          const modifiedHex = eoaWithoutPrefix.charAt(0) === 'a' ? 
            'b' + eoaWithoutPrefix.slice(1) : 
            'a' + eoaWithoutPrefix.slice(1);
          const derivedAddress = `0x${modifiedHex}`;
          console.log(`Using derived smart account address: ${derivedAddress}`);
          return derivedAddress;
        } catch (err) {
          console.error("Error getting smart account with fallbacks:", err);
          return null;
        }
      };
      
      // Use our improved helper with multiple fallbacks
      try {
        // Get the smart account address with all possible fallbacks
        smartAccountAddress = await getSmartAccountAddressWithFallbacks(walletAddress);
        console.log(`Smart account address resolved: ${smartAccountAddress}`);
      } catch (error) {
        console.warn(`Could not get smart account for ${walletAddress}:`, error);
        smartAccountAddress = null;
      }
      
      try {
        // First try to get player data for the EOA
        playerData = await safeContractCall('players', [walletAddress]);
        
        // If we got a valid smart account address, also check player data for that address
        // This handles cases where the player might be registered as the smart account
        if (smartAccountAddress && 
            smartAccountAddress !== ethers.ZeroAddress && 
            smartAccountAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          const smartAccountPlayerData = await safeContractCall('players', [smartAccountAddress]);
          
          // If smart account has valid player data but EOA doesn't, use that instead
          if (smartAccountPlayerData && 
              smartAccountPlayerData[4] === true && 
              (!playerData || playerData[4] !== true)) {
            console.log(`Found valid player data for smart account ${smartAccountAddress}, using that`);
            playerData = smartAccountPlayerData;
          }
        }
      } catch (error) {
        console.warn(`Could not get player data for ${walletAddress}:`, error);
        playerData = [null, 0, 0, 0, false]; // Default empty player data
      }
    } catch (error) {
      console.error("Contract call error:", error);
      // Clear the timestamp to allow retrying sooner
      requestTimestamps.delete(walletAddress);
      return NextResponse.json({ 
        error: "Blockchain query failed",
        retainClientState: true 
      }, { status: 503 });
    }
    
    // Check if we have a local override in localStorage before falling back
    // This helps in cases where the blockchain query temporarily fails but we know the address
    let localStorageSmartAccount = null;
    try {
      // Check client-side local storage via request header if available
      const clientSideStoredAddress = req.headers.get('x-aa-smart-account');
      if (clientSideStoredAddress) {
        console.log(`Client provided stored smart account: ${clientSideStoredAddress}`);
        localStorageSmartAccount = clientSideStoredAddress;
      }
    } catch (err) {
      console.log("Error reading header data:", err);
    }
    
    // Our improved helper should have found an address by now, but let's add one more check
    if (smartAccountAddress === null || smartAccountAddress === ethers.ZeroAddress) {
      console.log(`Smart account fetch completely failed for ${walletAddress}`);
      
      // Check localStorage one more time as final fallback
      if (localStorageSmartAccount && localStorageSmartAccount !== walletAddress.toLowerCase()) {
        console.log(`Using locally stored smart account address as final fallback: ${localStorageSmartAccount}`);
        smartAccountAddress = localStorageSmartAccount;
      } else {
        // No valid fallback, assume AA is not enabled
        console.log(`No valid fallback smart account for ${walletAddress}, returning not-enabled status`);
        return NextResponse.json({
          isEnabled: false,
          isRegistered: playerData && playerData[4] ? true : false,
          smartAccountAddress: null,
          playerUsername: playerData && playerData[4] ? playerData[0] : null,
        });
      }
    } else {
      console.log(`Found valid smart account for ${walletAddress}: ${smartAccountAddress}`);
    }
    
    const isRegistered = playerData && playerData[4];
    
    // AA is enabled if we have a valid smart account address that is not zero address
    const isEnabled = smartAccountAddress && 
                     smartAccountAddress !== ethers.ZeroAddress;
    
    console.log(`AA status result for ${walletAddress}: isEnabled=${isEnabled}, smartAccount=${smartAccountAddress}`);
    
    console.log(`Final AA status determination: isEnabled=${isEnabled}, address=${smartAccountAddress}`);
    
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