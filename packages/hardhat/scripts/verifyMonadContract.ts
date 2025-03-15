import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Script to verify a contract on Monad testnet
 * Usage: npx hardhat run scripts/verifyMonadContract.ts --network monad
 */
async function main() {
  const hre = require("hardhat");
  
  // Get the contract address from command line or env variable
  const contractAddress = process.argv[2] || process.env.CONTRACT_ADDRESS;
  
  if (!contractAddress) {
    console.error("Please provide a contract address as a command line argument or set CONTRACT_ADDRESS environment variable");
    process.exit(1);
  }
  
  console.log(`Verifying contract at address: ${contractAddress}`);
  
  try {
    // The MonadRunnerGame contract has no constructor arguments
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [] // Empty since the MonadRunnerGame constructor has no args
    });
    
    console.log("Contract verified successfully!");
  } catch (error: any) {
    console.error("Verification failed:", error.message);
  }
}

// We recommend this pattern to be able to use async/await everywhere
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });