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
import { privateKeyToAccount } from "viem/accounts";

// Updated chain configuration with a version property.
export const monadTestnet = {
  id: 10143,
  name: "Monad Testnet",
  network: "monad-testnet",
  version: 1, // Added required version field for SDK 5.4.x
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
 * Expects externalSigner to be a viem account (created via privateKeyToAccount) that includes a valid privateKey.
 */
export const initializeAAWallet = async (externalSigner: Signer) => {
  validateEnvVariables();

  // Compute and attach publicKey if missing.
  if (!(externalSigner as any).publicKey) {
    const privKey = (externalSigner as any).privateKey;
    if (!privKey) {
      throw new Error("The provided signer does not have a privateKey property.");
    }
    try {
      const signingKey = new SigningKey(privKey);
      (externalSigner as any).publicKey = signingKey.publicKey;
    } catch (e) {
      throw new Error("Unable to compute publicKey from the provided signer. Ensure it has a valid privateKey.");
    }
  }

  console.log("Signer details before processing:", {
    signerType: typeof externalSigner,
    signerProperties: Object.keys(externalSigner),
    address: (externalSigner as any).address,
    publicKey: (externalSigner as any).publicKey,
  });

  const signerAddress = await externalSigner.getAddress();
  console.log("Signer address retrieved:", signerAddress);

  const entryPoint = getEntryPoint("0.7"); // Returns an object with address and version.
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID!;
  const paymasterRpc = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC!;
  const bundlerRpc = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC!;

  const publicClient = createPublicClient({
    transport: http(monadTestnet.rpcUrls.default.http[0]),
    chain: monadTestnet,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: monadTestnet,
    transport: http(paymasterRpc),
  });

  try {
    // Create ECDSA validator using the updated entryPoint object.
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: externalSigner,
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    const account = await createKernelAccount(publicClient, {
      plugins: { sudo: ecdsaValidator },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });

    console.log("Account creation details:", {
      accountAddress: account.address,
      accountType: typeof account,
      accountProperties: Object.keys(account),
    });

    // Create the kernel client with the new API options.
    const kernelClient = createKernelAccountClient({
      account,
      chain: monadTestnet,
      bundlerTransport: http(`${bundlerRpc}?provider=ULTRA_RELAY`),
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

export const getSmartAccountAddress = async (
  eoaAddress: Address,
  index: number = 0
): Promise<Address> => {
  const publicClient = createPublicClient({
    transport: http(monadTestnet.rpcUrls.default.http[0]),
    chain: monadTestnet,
  });
  if (!publicClient.chain.version) {
    publicClient.chain.version = monadTestnet.version;
  }
  const entryPoint = getEntryPoint("0.7");
  return await getKernelAddressFromECDSA(publicClient, eoaAddress, index, KERNEL_V3_1);
};
