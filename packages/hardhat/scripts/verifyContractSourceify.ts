import { HardhatRuntimeEnvironment } from "hardhat/types";
import { task } from "hardhat/config";

// Add a task to verify a contract using only Sourcify
task("verify:sourcify", "Verifies a contract using Sourcify")
  .addParam("contract", "Contract address to verify")
  .addParam("network", "Network name to verify on")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { contract, network } = taskArgs;

    console.log(`Verifying contract ${contract} on ${network} using Sourcify...`);
    
    try {
      // Use the built-in Sourcify verification function
      await hre.run("verify:sourcify", {
        address: contract,
        network: network,
      });
      
      console.log(`✅ Contract ${contract} verified successfully with Sourcify!`);
    } catch (error) {
      console.error("❌ Verification failed:", error);
    }
  });

// Execute the verification script
export default async function verifyContract(hre: HardhatRuntimeEnvironment): Promise<void> {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const network = process.env.NETWORK || "monadTestnet";

  if (!contractAddress) {
    console.log("Please provide CONTRACT_ADDRESS environment variable");
    return;
  }

  await hre.run("verify:sourcify", {
    contract: contractAddress,
    network: network,
  });
}

// Allow script to be run directly
if (require.main === module) {
  // Get contract address from command line
  const contractAddress = process.argv[2];
  
  if (!contractAddress) {
    console.error("Please provide a contract address as an argument");
    process.exit(1);
  }

  // Create fake HRE
  const network = process.argv[3] || "monadTestnet";
  
  // Export CONTRACT_ADDRESS for the task to use
  process.env.CONTRACT_ADDRESS = contractAddress;
  process.env.NETWORK = network;
  
  // Run Hardhat
  require("hardhat").run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}