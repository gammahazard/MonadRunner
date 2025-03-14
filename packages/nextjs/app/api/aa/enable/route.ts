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
    
    // Use the new registerSmartAccountFor function that allows relayers to register on behalf of players
    const tx = await contractInstance.registerSmartAccountFor(walletAddress, smartAccountAddress);
    console.log("Transaction sent:", tx.hash);
    
    // Wait for transaction confirmation
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    // Return success response
    return NextResponse.json({
      smartAccountAddress,
      txHash: tx.hash,
      eip7702: useEIP7702
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Unhandled error in AA enable route:", error.message, error.stack);
      return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    } else {
      console.error("Unknown unhandled error in AA enable route:", error);
      return NextResponse.json({ error: "Unknown internal server error" }, { status: 500 });
    }
  }
}