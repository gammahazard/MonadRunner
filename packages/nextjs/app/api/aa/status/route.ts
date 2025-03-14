import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import deployedContracts from "~~/contracts/deployedContracts";
import { ethers } from 'ethers';
import { JsonRpcProvider } from "ethers";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json();
    
    // First, check localStorage flag (if available)
    const localStorageAAEnabled = req.cookies.get('monad-runner-aa-enabled')?.value === 'true';
    
    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }
    
    const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
    const chainId = 10143;
    const contractData = deployedContracts[chainId].MonadRunnerGame;
    
    const contractInstance = new ethers.Contract(
      contractData.address,
      contractData.abi,
      provider
    );
    
    const smartAccountAddress = await contractInstance.smartAccounts(walletAddress);
    const playerData = await contractInstance.players(walletAddress);
    
    const isRegistered = playerData && playerData[4];
    const isEnabled = smartAccountAddress && smartAccountAddress !== ethers.ZeroAddress;
    
    // Combine local storage flag with blockchain check
    const finalIsEnabled = localStorageAAEnabled || isEnabled;
    
    return NextResponse.json({
      isEnabled: finalIsEnabled,
      isRegistered,
      smartAccountAddress: finalIsEnabled ? smartAccountAddress : null,
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