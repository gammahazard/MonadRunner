import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSmartAccountAddress } from "~~/hooks/aaWallet";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider } from "ethers";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createPublicClient, http, hashMessage } from "viem";
import { verifyEIP6492Signature } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { getUserOperationGasPrice } from "@zerodev/sdk";

// Chain configuration for Monad Testnet
const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  network: "monad-testnet",
  version: 1,
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
};

async function getRelayerPrivateKey(): Promise<string> {
  const region = process.env.AWS_REGION || "us-west-2";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS credentials in environment variables");
  }
  const ssmClient = new SSMClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const command = new GetParameterCommand({
    Name: "/monad-app/RELAYER_PRIVATE_KEY",
    WithDecryption: true,
  });
  const response = await ssmClient.send(command);
  if (!response.Parameter?.Value) {
    throw new Error("Missing relayer key in Parameter Store");
  }
  return response.Parameter.Value;
}

// Simple in-memory cache to avoid duplicate requests
const processedRequests = new Map<string, {time: number, result: any}>();

// Track last request time per wallet to enforce rate limits
const lastRequestTimes = new Map<string, number>();

// Rate limiting - clear old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  
  // Clear old cache entries
  for (const [key, value] of processedRequests.entries()) {
    // Remove entries older than 10 minutes
    if (now - value.time > 10 * 60 * 1000) {
      processedRequests.delete(key);
    }
  }
  
  // Clear old rate limit entries
  for (const [key, time] of lastRequestTimes.entries()) {
    // Remove entries older than 2 minutes
    if (now - time > 2 * 60 * 1000) {
      lastRequestTimes.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Helper to check rate limits
function isRateLimited(walletAddress: string): { limited: boolean, waitTime: number } {
  const now = Date.now();
  const lastRequest = lastRequestTimes.get(walletAddress) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // Minimum time between requests per wallet: 5 seconds to be more conservative
  const minRequestInterval = 5000;
  
  if (timeSinceLastRequest < minRequestInterval) {
    return { 
      limited: true, 
      waitTime: minRequestInterval - timeSinceLastRequest 
    };
  }
  
  // Update last request time
  lastRequestTimes.set(walletAddress, now);
  return { limited: false, waitTime: 0 };
}

export async function POST(req: NextRequest) {
  try {
    console.log("Received request to /api/aa/enable");
    const body = await req.json();
    console.log("Request body:", {
      hasSignature: !!body.signature,
      hasMessage: !!body.message,
      hasWalletAddress: !!body.walletAddress,
      useEIP7702: !!body.useEIP7702,
    });
    
    const { signature, message, walletAddress, useEIP7702 = false } = body;
    
    if (!signature || !message || !walletAddress) {
      console.error("Missing parameters:", { signature, message, walletAddress });
      return NextResponse.json({ error: "Missing parameters", received: body }, { status: 400 });
    }
    
    // Check rate limits FIRST to avoid spamming the blockchain
    const rateLimitCheck = isRateLimited(walletAddress);
    if (rateLimitCheck.limited) {
      console.log(`Rate limited request for ${walletAddress}, wait time: ${rateLimitCheck.waitTime}ms`);
      return NextResponse.json({
        error: "Rate limited, please wait before retrying",
        retryAfter: rateLimitCheck.waitTime,
        retryAfterSeconds: Math.ceil(rateLimitCheck.waitTime / 1000)
      }, { 
        status: 429,
        headers: {
          'Retry-After': Math.ceil(rateLimitCheck.waitTime / 1000).toString()
        }
      });
    }
    
    // Generate a unique key for this request
    const requestKey = `${walletAddress}:${signature.substring(0, 10)}`;
    
    // Check if we've already processed this request
    if (processedRequests.has(requestKey)) {
      const cached = processedRequests.get(requestKey);
      console.log(`Returning cached result for ${walletAddress}`);
      
      if (cached?.result.error) {
        return NextResponse.json({ error: cached.result.error }, { status: 500 });
      }
      
      return NextResponse.json(cached?.result);
    }
    
    // Setup public client for Monad Testnet
    const publicClient = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
      chain: monadTestnet,
    });
    
    // Verify signature
    console.log("Verifying signature");
    const isValid = await verifyEIP6492Signature({
      signer: walletAddress,
      hash: hashMessage(message),
      signature: signature,
      client: publicClient as any,
    });
    
    if (!isValid) {
      console.error("Signature verification failed", { walletAddress, message });
      return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
    }
    
    console.log("Retrieving relayer private key");
    let relayerPrivateKey = await getRelayerPrivateKey();
    console.log("Retrieved relayer key successfully");

    if (!relayerPrivateKey.startsWith("0x")) {
      relayerPrivateKey = "0x" + relayerPrivateKey;
    }
    
    // Different flow based on EIP-7702 flag
    console.log(`Using ${useEIP7702 ? "EIP-7702" : "legacy AA"} flow for ${walletAddress}`);
    
    let smartAccountAddress;
    if (useEIP7702) {
      // With EIP-7702, the smart account address is the same as the EOA
      smartAccountAddress = walletAddress;
    } else {
      // Legacy flow, get computed smart account address
      smartAccountAddress = await getSmartAccountAddress(walletAddress, 0);
    }
    
    console.log(`Smart account address: ${smartAccountAddress}`);
    
    // Setup ZeroDev paymaster client
    const paymasterRpc = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC;
    const bundlerRpc = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC;
    
    if (!paymasterRpc || !bundlerRpc) {
      throw new Error("Missing ZeroDev RPC endpoints in environment variables");
    }
    
    console.log("Using ZeroDev paymaster for gas sponsorship:", {
      paymasterRpc: paymasterRpc.substring(0, 40) + "...",
      bundlerRpc: bundlerRpc.substring(0, 40) + "..."
    });
    
    const { ethers } = await import("ethers");
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    const relayerSigner = new ethers.Wallet(relayerPrivateKey, provider);
    
    // Get the contract instance
    const chainId = 10143;
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    const contractInstance = new ethers.Contract(
      contractData.address,
      contractData.abi,
      relayerSigner
    );
    
    // Check if the relayer is actually authorized
    const isAuthorized = await contractInstance.isAuthorizedRelayer(relayerSigner.address);
    console.log("Is relayer authorized:", isAuthorized);
    
    if (!isAuthorized) {
      console.error("Relayer is not authorized:", relayerSigner.address);
      return NextResponse.json({ error: "Relayer is not authorized to register smart accounts" }, { status: 500 });
    }
    
    // Estimate gas cost
    try {
      const gasEstimate = await contractInstance.registerSmartAccountFor.estimateGas(
        walletAddress, 
        smartAccountAddress
      );
      
      const feeData = await provider.getFeeData();
      
      console.log("Gas cost estimation:", {
        gasEstimate: gasEstimate.toString(),
        gasPrice: feeData.gasPrice?.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        estimatedCost: ethers.formatEther((gasEstimate * (feeData.gasPrice || 0n)).toString())
      });
    } catch (err) {
      console.warn("Gas estimation failed:", err);
    }

    // Call registerSmartAccountFor
    console.log("Calling registerSmartAccountFor with params:", {
      playerAddress: walletAddress,
      smartAccountAddress: smartAccountAddress,
      contractAddress: contractData.address,
    });
    
    // Check if the account is already registered to avoid errors
    console.log(`Checking if account ${walletAddress} is already registered...`);
    try {
      const alreadyRegistered = await contractInstance.isRegistered(walletAddress);
      if (alreadyRegistered) {
        console.log(`Account ${walletAddress} is already registered, skipping registration`);
        
        // Return success without sending a transaction
        return NextResponse.json({
          smartAccountAddress,
          txHash: "0x" + "0".repeat(64) + "-alreadyRegistered",
          eip7702: useEIP7702,
          alreadyRegistered: true
        });
      }
      
      // If not registered, proceed with registration
      console.log(`Account ${walletAddress} is not registered, proceeding with registration`);
    } catch (checkError) {
      console.warn("Error checking registration status, will try registration anyway:", checkError);
    }
    
    // Add overrides to help with gas estimation
    console.log("Sending transaction to register smart account");
    const tx = await contractInstance.registerSmartAccountFor(
      walletAddress, 
      smartAccountAddress,
      { gasLimit: 300000 } // Add a gas limit to avoid estimation issues
    );
    console.log("Transaction sent:", tx.hash);
    
    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    // Prepare the success response
    const result = {
      smartAccountAddress,
      txHash: tx.hash,
      eip7702: useEIP7702
    };
    
    // Cache the result using the same key we generated earlier
    processedRequests.set(`${walletAddress}:${signature.substring(0, 10)}`, { 
      time: Date.now(), 
      result 
    });
    
    // Return success response
    return NextResponse.json(result);
  } catch (error: unknown) {
    // Record the error in the cache too
    // Make sure signature and walletAddress are still in scope
    try {
      // Only cache if we have the data to create a key
      if (typeof walletAddress === 'string' && typeof signature === 'string') {
        const errorResult = { error: error instanceof Error ? error.message : "Unknown error" };
        const cacheKey = `${walletAddress}:${signature.substring(0, 10)}`;
        processedRequests.set(cacheKey, {
          time: Date.now(),
          result: errorResult
        });
        console.log(`Cached error result for ${walletAddress}`);
      }
    } catch (cacheError) {
      console.error("Error while trying to cache error result:", cacheError);
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // For specific missing revert data errors (which may still succeed), return a special status
    if (errorMessage.includes("missing revert data") || 
        errorMessage.includes("CALL_EXCEPTION")) {
      console.warn("Contract call error in AA enable route (may still be successful):", errorMessage);
      
      // Return a more optimistic response - the frontend will check actual status
      return NextResponse.json({ 
        smartAccountAddress: typeof walletAddress === 'string' ? walletAddress : null,
        txHash: "0x" + "0".repeat(64) + "-errorIgnored",
        errorIgnored: true,
        warning: "Transaction may have succeeded despite error"
      }, { status: 200 });
    }
    
    // For other errors, return the regular error
    if (error instanceof Error) {
      console.error("Unhandled error in AA enable route:", error.message, error.stack);
      return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    } else {
      console.error("Unknown unhandled error in AA enable route:", error);
      return NextResponse.json({ error: "Unknown internal server error" }, { status: 500 });
    }
  }
}