// app/api/aa/enable/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { initializeAAWallet } from "~~/hooks/aaWallet";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider, Wallet, verifyMessage } from "ethers";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { ethers } from "ethers";

/**
 * Retrieves the relayer private key from AWS Parameter Store.
 * Ensure that the parameter is stored as a SecureString with the name:
 *   /monad-app/RELAYER_PRIVATE_KEY
 */
async function getRelayerPrivateKey(): Promise<string> {
  const region = process.env.AWS_REGION || "us-west-2";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing AWS credentials in environment variables");
  }
  
  // Log the region and accessKeyId for debugging (remove or secure in production)
  console.log("Using AWS credentials:", { accessKeyId, region });

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
    // Parse input parameters from the request.
    const { signature, message, walletAddress } = await req.json();
    if (!signature || !message || !walletAddress) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Verify the user's signature.
    const recoveredAddress = verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
    }

    // Retrieve the relayer private key securely from AWS Parameter Store.
    const relayerPrivateKey = await getRelayerPrivateKey();

    // Create an ethers provider for Monad Testnet.
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");

    // Instantiate a secure external signer using the relayer key.
    const externalSigner = new Wallet(relayerPrivateKey, provider);

    // Initialize the AA wallet using the secure external signer.
    // (The externalSigner is only used on the server for relaying transactions.)
    const { account } = await initializeAAWallet(externalSigner);

    // Register the AA wallet on chain by calling your contract's method.
    // Ensure that your contract includes a method (e.g. registerSmartAccount) to store the AA address.
    const chainId = 10143;
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    // Create a contract instance using externalSigner as the signer.
    const contractInstance = new ethers.Contract(contractData.address, contractData.abi, externalSigner);
    const tx = await contractInstance.registerSmartAccount(account.address);
    await tx.wait();

    return NextResponse.json({
      smartAccountAddress: account.address,
      txHash: tx.hash,
    });
  } catch (error: any) {
    console.error("Error enabling AA wallet:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
