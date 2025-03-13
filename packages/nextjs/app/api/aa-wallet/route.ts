import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { initializeAAWallet } from "~/hooks/aaWallet"; // Adjust the import path as needed

// This is a simplified message verification
// In production, consider adding a nonce and timestamp to prevent replay attacks
const verifySignature = (message: string, signature: string, address: string): boolean => {
  try {
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signature, message, address } = body;

    if (!signature || !message || !address) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Verify the signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Create an EOA signer from the address that signed the message
    // Note: This is a temporary signer just for initializing the AA wallet
    // In production, you might want to store this more securely
    const wallet = new ethers.Wallet(ethers.id(signature)); // This is just for demo, not secure!

    // Initialize the AA wallet
    const { smartAccountAddress } = await initializeAAWallet(wallet);

    return NextResponse.json({
      success: true,
      smartAccountAddress,
    });
  } catch (error: any) {
    console.error("AA wallet creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create AA wallet" },
      { status: 500 }
    );
  }
}