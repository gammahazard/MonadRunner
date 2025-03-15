// app/api/session/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { JsonRpcProvider, ethers } from "ethers";
import { storeSession } from "../sessionStore";
import deployedContracts from "~~/contracts/deployedContracts";

export async function POST(req: NextRequest) {
  const requestId = `session-register-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Session API ${requestId}] Received session key registration request`);

  try {
    const {
      userAddress,
      publicKey,
      signature,
      validUntil,
      registerOnChain
    } = await req.json();

    // Basic validation
    if (!userAddress || !publicKey || !signature || !validUntil) {
      console.warn(`[Session API ${requestId}] Missing required parameters`);
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Validate Ethereum addresses
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(userAddress) || !addressRegex.test(publicKey)) {
      console.warn(`[Session API ${requestId}] Invalid address format`);
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Validate timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    if (validUntil <= currentTime) {
      console.warn(`[Session API ${requestId}] Session expiration must be in the future`);
      return NextResponse.json(
        { error: "Session expiration must be in the future" },
        { status: 400 }
      );
    }

    // Verify signature - the signature should be of the message "Register session key {publicKey} for {userAddress} until {validUntil}"
    const message = `Register session key ${publicKey} for ${userAddress} until ${validUntil}`;
    
    // Verify that the signature is from the user
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
        console.warn(`[Session API ${requestId}] Invalid signature: ${recoveredAddress} != ${userAddress}`);
        return NextResponse.json(
          { error: "Invalid signature - signer does not match user address" },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error(`[Session API ${requestId}] Error verifying signature:`, error);
      return NextResponse.json(
        { error: "Invalid signature format" },
        { status: 400 }
      );
    }

    console.log(`[Session API ${requestId}] Signature verified, registering session for ${userAddress}`);

    // Register the session in our backend
    storeSession({
      userAddress: userAddress.toLowerCase(),
      publicKey: publicKey.toLowerCase(),
      signature,
      validUntil,
      createdAt: currentTime
    });

    // If requested, also register the session key on-chain
    if (registerOnChain) {
      try {
        console.log(`[Session API ${requestId}] Registering session key on-chain`);
        
        // Create a provider
        const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
        
        // We need the relayer to submit this transaction
        const relayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
        if (!relayerPrivateKey) {
          throw new Error("Relayer private key not configured");
        }
        
        const relayerWallet = new ethers.Wallet(relayerPrivateKey, provider);
        
        // Get contract instance
        const chainId = 10143; // Monad Testnet
        const contractData = deployedContracts[chainId].MonadRunnerGame;
        const contract = new ethers.Contract(
          contractData.address,
          contractData.abi,
          relayerWallet
        );
        
        // Check if the player exists
        const playerExists = await contract.players(userAddress).then((player: any) => player.exists);
        if (!playerExists) {
          console.warn(`[Session API ${requestId}] Player not registered on-chain`);
          
          // Continue with session registration in our backend, but return a warning
          return NextResponse.json({
            success: true,
            sessionRegistered: true,
            onChainRegistered: false,
            warning: "Player not registered on-chain. The session key is registered in our backend, but not on-chain. On-chain actions will require direct transactions."
          });
        }
        
        // Register the session key on-chain
        const tx = await contract.registerSessionKey(publicKey, validUntil);
        console.log(`[Session API ${requestId}] Transaction sent: ${tx.hash}`);
        
        // Wait for transaction confirmation
        const receipt = await tx.wait();
        console.log(`[Session API ${requestId}] Transaction confirmed: ${receipt.hash}`);
        
        return NextResponse.json({
          success: true,
          sessionRegistered: true,
          onChainRegistered: true,
          txHash: receipt.hash
        });
      } catch (error: any) {
        console.error(`[Session API ${requestId}] Error registering on-chain:`, error);
        
        // Return partial success - registered in backend but not on-chain
        return NextResponse.json({
          success: true,
          sessionRegistered: true,
          onChainRegistered: false,
          error: error.message || "Failed to register session key on-chain"
        });
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      sessionRegistered: true,
      userAddress,
      publicKey,
      validUntil
    });
  } catch (error: any) {
    console.error(`[Session API ${requestId}] Error:`, error);
    return NextResponse.json(
      { error: error.message || "Failed to register session key" },
      { status: 500 }
    );
  }
}