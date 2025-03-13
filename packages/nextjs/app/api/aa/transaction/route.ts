import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { initializeAAWallet } from "~~/hooks/aaWallet";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

/**
 * Retrieves the relayer private key from AWS Parameter Store.
 */
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

// Verify that the smart account is owned by the EOA
async function verifySmartAccountOwnership(
  provider: JsonRpcProvider,
  eoaAddress: string,
  smartAccountAddress: string
): Promise<boolean> {
  try {
    const chainId = 10143; // Monad Testnet
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    
    // Create a contract instance for read-only operations
    const contractInstance = new ethers.Contract(
      contractData.address, 
      contractData.abi, 
      provider
    );
    
    // Check if the smart account is registered to this EOA
    const registeredSmartAccount = await contractInstance.smartAccounts(eoaAddress);
    
    return registeredSmartAccount.toLowerCase() === smartAccountAddress.toLowerCase();
  } catch (error) {
    console.error("Error verifying smart account ownership:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Parse input parameters from the request
    const { aaAddress, to, value, data, originalSender } = await req.json();
    
    if (!aaAddress || !to || !originalSender) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Create a provider
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    
    // Verify ownership between EOA and smart account
    const isVerified = await verifySmartAccountOwnership(
      provider,
      originalSender,
      aaAddress
    );
    
    if (!isVerified) {
      return NextResponse.json(
        { error: "Unauthorized: This smart account is not registered to your wallet" }, 
        { status: 403 }
      );
    }

    // Retrieve the relayer private key from AWS Parameter Store
    const relayerPrivateKey = await getRelayerPrivateKey();
    
    // Instantiate the relayer signer
    const externalSigner = new Wallet(relayerPrivateKey, provider);

    // Initialize the AA wallet with the relayer signer
    const { kernelClient } = await initializeAAWallet(externalSigner);
    
    // Execute the transaction
    const txHash = await kernelClient.sendTransaction({
      to: to,
      value: BigInt(value || "0"),
      data: data || "0x",
    });

    // Log the transaction for auditing
    console.log(`Transaction sent: ${txHash} for account ${aaAddress}, requested by ${originalSender}`);

    return NextResponse.json({
      success: true,
      txHash: txHash,
    });
  } catch (error: any) {
    console.error("Error processing AA transaction:", error);
    return NextResponse.json(
      { error: error.message || "Transaction failed" }, 
      { status: 500 }
    );
  }
}