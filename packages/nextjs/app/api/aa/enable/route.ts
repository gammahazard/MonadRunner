import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSmartAccountAddress } from "~~/hooks/aaWallet";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider } from "ethers";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createPublicClient, http, hashMessage } from "viem";
import { verifyEIP6492Signature } from "@zerodev/sdk";
import { privateKeyToAccount } from "viem/accounts";

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
    });
    const { signature, message, walletAddress } = body;
    if (!signature || !message || !walletAddress) {
      console.error("Missing parameters:", { signature, message, walletAddress });
      return NextResponse.json({ error: "Missing parameters", received: body }, { status: 400 });
    }
    const chainConfig = {
      id: 10143,
      name: "Monad Testnet",
      network: "monad-testnet",
      version: 1,
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
    };
    const publicClient = createPublicClient({
      transport: http("https://testnet-rpc.monad.xyz"),
      chain: chainConfig,
    });
    console.log("Public client chain config:", publicClient.chain);
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
    console.log("Computing smart account address from user wallet:", walletAddress);
    const smartAccountAddress = await getSmartAccountAddress(walletAddress, 0);
    console.log("Computed smart account address:", smartAccountAddress);
    const { JsonRpcProvider, Wallet } = await import("ethers");
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    const relayerSigner = new Wallet(relayerPrivateKey, provider);
    console.log("Using relayerSigner with address:", relayerSigner.address);
    console.log("Registering smart account on contract");
    const chainId = 10143;
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    const { ethers } = await import("ethers");
    const contractInstance = new ethers.Contract(
      contractData.address,
      contractData.abi,
      new ethers.Wallet(relayerPrivateKey, new JsonRpcProvider("https://testnet-rpc.monad.xyz"))
    );
    console.log("Calling registerSmartAccount with params:", {
      smartAccountAddress,
      contractAddress: contractData.address,
    });
    const tx = await contractInstance.registerSmartAccount(smartAccountAddress);
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    return NextResponse.json({
      smartAccountAddress,
      txHash: tx.hash,
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error("Unhandled error in AA enable route:", error.message);
      return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    } else {
      console.error("Unknown unhandled error in AA enable route:", error);
      return NextResponse.json({ error: "Unknown internal server error" }, { status: 500 });
    }
  }
}
