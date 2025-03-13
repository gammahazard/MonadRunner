import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import { JsonRpcProvider } from "ethers";

export async function POST(req: NextRequest) {
  try {
    // Parse input parameters from the request
    const { walletAddress } = await req.json();
    
    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    // Create a provider for Monad Testnet
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    
    // Get the contract info
    const chainId = 10143; // Monad Testnet
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    
    // Create a contract instance for read-only operations
    const contractInstance = new ethers.Contract(
      contractData.address, 
      contractData.abi, 
      provider
    );
    
    // Check if the user has a registered smart account
    const smartAccountAddress = await contractInstance.smartAccounts(walletAddress);
    
    const isEnabled = smartAccountAddress && smartAccountAddress !== ethers.ZeroAddress;
    
    return NextResponse.json({
      isEnabled,
      smartAccountAddress: isEnabled ? smartAccountAddress : null,
    });
  } catch (error: any) {
    console.error("Error checking AA status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check AA status" }, 
      { status: 500 }
    );
  }
}