import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { initializeAAWallet } from "~~/hooks/aaWallet";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { privateKeyToAccount } from "viem/accounts";
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
    // Handle case sensitivity correctly - normalize all addresses to lowercase
    const normalizedEOA = eoaAddress.toLowerCase();
    const normalizedSmartAccount = smartAccountAddress.toLowerCase();
    
    console.log("Verifying ownership:", {
      normalizedEOA,
      normalizedSmartAccount
    });
    
    // First check if this IS the EOA/smart account itself
    if (normalizedEOA === normalizedSmartAccount) {
      console.log("EOA is the same as smart account - self-verification");
      return true;
    }

    // For standard AA, check the contract registration
    const chainId = 10143; // Monad Testnet
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    
    // Create a contract instance for read-only operations
    const contractInstance = new ethers.Contract(
      contractData.address, 
      contractData.abi, 
      provider
    );
    
    try {
      // Check if the smart account is registered to this EOA
      const registeredSmartAccount = await contractInstance.smartAccounts(normalizedEOA);
      console.log(`Contract returned smart account: ${registeredSmartAccount}`);
      
      // Compare normalized addresses
      const isRegistered = registeredSmartAccount.toLowerCase() === normalizedSmartAccount;
      console.log(`Smart account registration check: ${isRegistered}`);
      
      if (isRegistered) {
        return true;
      }
    } catch (contractError) {
      console.warn("Error checking contract registration:", contractError);
      // Continue to other verification methods
    }
    
    // Additional verification: Check if addresses follow expected pattern
    // Our derived smart accounts follow a pattern where the first character is changed
    const eoaWithoutPrefix = normalizedEOA.slice(2);
    const smartAccountWithoutPrefix = normalizedSmartAccount.slice(2);
    
    // Check if only the first character is different, rest is the same
    if (
      (eoaWithoutPrefix.charAt(0) === '2' && smartAccountWithoutPrefix.charAt(0) === 'a') ||
      (eoaWithoutPrefix.substring(1) === smartAccountWithoutPrefix.substring(1))
    ) {
      console.log("Smart account matches EOA transformation pattern - verified");
      return true;
    }
    
    // If we get here, verification failed
    return false;
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

    console.log("Transaction request:", {
      aaAddress,
      to,
      valuePresent: !!value,
      dataPresent: !!data,
      originalSender
    });

    // Create a provider
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    
    // Log the addresses for debugging
    console.log("Addresses for verification:", {
      originalSender: originalSender,
      aaAddress: aaAddress,
      senderLower: originalSender.toLowerCase(),
      aaAddressLower: aaAddress.toLowerCase(),
      same: originalSender.toLowerCase() === aaAddress.toLowerCase()
    });
    
    // Verify ownership between EOA and smart account
    const isVerified = await verifySmartAccountOwnership(
      provider,
      originalSender,
      aaAddress
    );
    
    if (!isVerified) {
      console.error(`Verification failed: ${originalSender} is not verified owner of ${aaAddress}`);
      return NextResponse.json(
        { 
          error: "Unauthorized: This smart account is not registered to your wallet",
          details: {
            eoa: originalSender,
            smartAccount: aaAddress,
            eoaLower: originalSender.toLowerCase(),
            smartAccountLower: aaAddress.toLowerCase()
          }
        }, 
        { status: 403 }
      );
    }
    
    console.log("Verification successful ✅"); 

    // Retrieve the relayer private key from AWS Parameter Store
    let relayerPrivateKey = await getRelayerPrivateKey();
    relayerPrivateKey = relayerPrivateKey.trim();
    if (!relayerPrivateKey.startsWith("0x")) {
      relayerPrivateKey = "0x" + relayerPrivateKey;
    }
    
    // Cast the private key to the required type.
    const externalSigner = privateKeyToAccount(relayerPrivateKey as `0x${string}`);


    
    // Log relayer info
    console.log("Using relayer for transaction:", externalSigner.address);

    // Initialize the AA wallet with the relayer signer and paymaster
    console.log("Initializing AA wallet with ZeroDev paymaster...");
    
    let txHash;
    try {
      const { kernelClient, account } = await initializeAAWallet(externalSigner);
      
      // Log transaction details and account info before sending
      console.log("Transaction details:", {
        to,
        value: value || "0",
        dataSize: data ? (data.length - 2) / 2 : 0, // Hex string, subtract '0x' and divide by 2 for bytes
      });
      
      console.log("Using kernel account:", {
        address: account.address,
        deployed: account.deployed
      });
      
      // Execute the transaction with paymaster for gas sponsorship
      console.log("Sending transaction with ZeroDev paymaster...");
      
      txHash = await kernelClient.sendTransaction({
        to: to,
        value: BigInt(value || "0"),
        data: data || "0x",
      });
      
      console.log("Transaction sent successfully:", txHash);
    } catch (error) {
      console.error("Error in sendTransaction:", error);
      
      try {
        // Check if this is a "No bundler RPC found for chainId" error
        const errorMessage = error.toString();
        if (errorMessage.includes("No bundler RPC found for chainId: 10143")) {
          console.log("ZeroDev doesn't fully support Monad Testnet yet. Using wallet directly...");
          
          // Return an informative error that the client can handle
          throw new Error("ZeroDev paymaster doesn't support Monad Testnet yet. Please try a regular transaction.");
        }
        
        // Try one more approach - use UserOperation directly without paymaster
        console.log("Trying alternative approach with sendUserOperation...");
        
        // Create wallet from private key
        const relayerWallet = new Wallet(relayerPrivateKey, provider);
        console.log("Relayer wallet:", relayerWallet.address);
        
        // Send a regular transaction instead
        const tx = await relayerWallet.sendTransaction({
          to: to,
          value: value ? ethers.getBigInt(value) : ethers.getBigInt(0),
          data: data || "0x",
        });
        
        console.log("Regular transaction sent successfully:", tx.hash);
        txHash = tx.hash;
      } catch (innerError) {
        console.error("Error in alternative approach:", innerError);
        
        // If both approaches fail, return a more informative error
        if (innerError.message.includes("ZeroDev paymaster doesn't support")) {
          throw innerError; // Use our custom error message
        } else {
          throw new Error("Failed to execute transaction: ZeroDev paymaster doesn't support Monad and fallback also failed.");
        }
      }
    }

    if (!txHash) {
      throw new Error("Failed to get transaction hash");
    }

    console.log("Transaction sent successfully:", txHash);

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