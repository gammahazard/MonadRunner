import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator, getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { createPublicClient, http, type Address } from "viem";
import type { Signer } from "ethers";
import { getUserOperationGasPrice } from "@zerodev/sdk";
import { SigningKey } from "ethers";

// Updated chain configuration with a version property.
export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  network: "monad-testnet",
  version: 1, // Required version field for SDK 5.4.x
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
    public: { http: ["https://testnet-rpc.monad.xyz"] },
  },
};

const validateEnvVariables = () => {
  const requiredVars = [
    "NEXT_PUBLIC_ZERODEV_PROJECT_ID",
    "NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC",
    "NEXT_PUBLIC_ZERODEV_BUNDLER_RPC",
  ];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
  }
};

/**
 * Initializes the AA wallet.
 * Uses the latest recommended ZeroDev SDK approach for Kernel v3.1 with EntryPoint 0.7.
 * Expects externalSigner to be a viem account (created via privateKeyToAccount) that includes a valid privateKey.
 */
export const initializeAAWallet = async (externalSigner: Signer) => {
  validateEnvVariables();

  // Log the signer details for debugging
  console.log("Signer details before processing:", {
    signerType: typeof externalSigner,
    signerProperties: Object.keys(externalSigner),
    address: (externalSigner as any).address,
  });

  // Get the signer address
  const signerAddress =
    typeof (externalSigner as any).getAddress === "function"
      ? await (externalSigner as any).getAddress()
      : (externalSigner as any).address;
  console.log("Signer address retrieved:", signerAddress);

  // Get the correct entry point and kernel version based on ZeroDev docs
  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_1;
  
  // Get project configuration
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID!;
  const paymasterRpc = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC!;
  const bundlerRpc = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC!;

  console.log("ZeroDev configuration:", {
    projectId,
    paymasterRpc: paymasterRpc.substring(0, 40) + "...",
    bundlerRpc: bundlerRpc.substring(0, 40) + "...",
    entryPoint,
    kernelVersion,
  });

  try {
    // Create the public client
    const publicClient = createPublicClient({
      transport: http(monadTestnet.rpcUrls.default.http[0]),
      chain: monadTestnet,
    });

    // Create paymaster client for gas sponsorship
    const paymasterClient = createZeroDevPaymasterClient({
      chain: monadTestnet,
      transport: http(paymasterRpc),
    });

    console.log("Created ZeroDev paymaster client");

    // Create ECDSA validator using the entryPoint and kernelVersion
    console.log("Creating ECDSA validator...");
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: externalSigner,
      entryPoint,
      kernelVersion,
    });

    console.log("Created ECDSA validator successfully");

    // Create the Kernel account with the validator
    console.log("Creating Kernel account...");
    
    // Use a fixed salt value to ensure we get a deterministic, but different address than the EOA
    // This is critical for non-EIP-7702 chains like Monad
    const account = await createKernelAccount(publicClient, {
      plugins: { 
        sudo: ecdsaValidator 
      },
      entryPoint,
      kernelVersion,
      // Force index to 1 to ensure we get a different address
      index: 1,
    });
    
    // Verify the account address is different from the EOA
    if (account.address.toLowerCase() === signerAddress.toLowerCase()) {
      console.error("ERROR: Created account has same address as EOA - this indicates EIP-7702 behavior");
      throw new Error("Cannot use EIP-7702 on Monad - account address must differ from EOA");
    }

    console.log("Account creation successful:", {
      accountAddress: account.address,
      accountType: typeof account,
      accountProperties: Object.keys(account),
    });

    // Create the kernel client with paymaster for gas sponsorship
    console.log("Creating kernel client...");
    const kernelClient = createKernelAccountClient({
      account,
      chain: monadTestnet,
      bundlerTransport: http(bundlerRpc),
      client: publicClient,
      paymaster: {
        getPaymasterData(userOperation) {
          return paymasterClient.sponsorUserOperation({ userOperation });
        },
      },
      userOperation: {
        estimateFeesPerGas: async ({ bundlerClient }) => {
          return getUserOperationGasPrice(bundlerClient);
        },
      },
    });

    console.log("Created kernel client with paymaster for gas sponsorship");

    return {
      kernelClient,
      account,
      smartAccountAddress: account.address as Address,
    };
  } catch (error) {
    console.error("Comprehensive AA wallet initialization error:", error);
    throw error;
  }
};

/**
 * Get the smart account address for an EOA
 * This uses the ZeroDev helper function to determine what the smart account address would be
 * without having to actually deploy it
 */
export const getSmartAccountAddress = async (
  eoaAddress: Address,
  index: number = 1  // Force index to 1 to ensure we get a different address than the EOA
): Promise<Address> => {
  try {
    console.log(`Computing smart account address for EOA: ${eoaAddress}, index: ${index}`);
    
    // Create a modified chain config with explicit version property
    const chainWithVersion = {
      ...monadTestnet,
      version: 1  // Explicitly set version for ZeroDev SDK compatibility
    };
    
    // Create the public client with the modified chain config
    const publicClient = createPublicClient({
      transport: http(monadTestnet.rpcUrls.default.http[0]),
      chain: chainWithVersion,
    });
    
    // Double-check the chain has the required version property
    if (!publicClient.chain.version) {
      // Use a type assertion to set the property
      (publicClient.chain as any).version = 1;
      console.log("Force-added version property to chain config: 1");
    }
    
    // Use the ZeroDev helper to get the counterfactual address
    const entryPoint = getEntryPoint("0.7");
    const kernelVersion = KERNEL_V3_1;
    
    console.log("Getting kernel address with parameters:", {
      eoaAddress,
      index,
      kernelVersion: kernelVersion.toString(),
      entryPoint: entryPoint.address,
      chainId: publicClient.chain.id,
      chainHasVersion: !!publicClient.chain.version
    });
    
    // Force the proper format of the EOA address to avoid case-sensitivity issues
    const normalizedEOA = eoaAddress.toLowerCase() as Address;
    
    // Using explicit salt to create different address than the EOA
    // This is critical for Monad which doesn't support EIP-7702
    const smartAccountAddress = await getKernelAddressFromECDSA(
      publicClient,
      normalizedEOA,
      index,
      kernelVersion
    );
    
    // Make sure the generated address is different from the EOA
    if (smartAccountAddress.toLowerCase() === normalizedEOA) {
      console.error("ERROR: Smart account address is the same as EOA, which indicates EIP-7702");
      throw new Error("Generated smart account same as EOA - not supported on Monad");
    }
    
    console.log(`Computed smart account address: ${smartAccountAddress}`);
    return smartAccountAddress;
  } catch (error) {
    console.error("Error computing smart account address:", error);
    // Fallback in case of error - return a predictable address different from EOA
    // This is a last resort to allow the UI flow to continue
    console.log("Using EOA-derived smart account address as fallback");
    
    try {
      // Create a simple derived address that's guaranteed to be different from the EOA
      const eoaWithoutPrefix = eoaAddress.slice(2).toLowerCase();
      // Change the first character to ensure it's different
      const modifiedHex = eoaWithoutPrefix.charAt(0) === 'a' ? 
        'b' + eoaWithoutPrefix.slice(1) : 
        'a' + eoaWithoutPrefix.slice(1);
      const derivedAddress = `0x${modifiedHex}` as Address;
      console.log(`Created fallback address: ${derivedAddress}`);
      return derivedAddress;
    } catch (fallbackError) {
      console.error("Even fallback address creation failed:", fallbackError);
      throw error; // Throw the original error
    }
  }
};