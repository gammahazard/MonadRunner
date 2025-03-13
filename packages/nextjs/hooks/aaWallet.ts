// aaWallet.ts (Client-side production version)
import {
    createKernelAccount,
    createKernelAccountClient,
    createZeroDevPaymasterClient,
  } from "@zerodev/sdk";
  import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
  import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
  import { createPublicClient, http } from "viem";
  import type { Chain } from "viem/chains";
  import type { Signer } from "ethers";
  
  // We assume that public values are available via NEXT_PUBLIC_ variables.
  const PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
  if (!PROJECT_ID) {
    throw new Error("Missing ZeroDev project ID (NEXT_PUBLIC_ZERODEV_PROJECT_ID)");
  }
  
  // Define your chain configuration for Monad Testnet.
  const monadTestnet: Chain = {
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: {
      name: "Monad",
      symbol: "MON",
      decimals: 18,
    },
    rpcUrls: {
      default: { http: ["https://testnet-rpc.monad.xyz"] },
      public: { http: ["https://testnet-rpc.monad.xyz"] },
    },
    blockExplorers: {
      default: { name: "MonadScan", url: "https://testnet.monadexplorer.com" },
    },
    testnet: true,
  };
  
  // Create a public client using the Monad Testnet RPC.
  const publicClient = createPublicClient({
    transport: http("https://testnet-rpc.monad.xyz"),
    chain: monadTestnet,
  });
  
  /**
   * Initialize the AA wallet using the external signer (from the user’s wallet).
   * @param externalSigner - The signer from the user’s wallet (obtained via useWalletClient)
   * @returns An object with the Kernel account client and the smart account.
   */
  export const initializeAAWallet = async (externalSigner: Signer) => {
    // Get the entryPoint for ERC-4337 (using version "0.7")
    const entryPoint = getEntryPoint("0.7");
  
    // Create the ECDSA validator using the external signer.
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, { signer: externalSigner, entryPoint });
  
    // Create the Kernel (smart) account.
    const account = await createKernelAccount(publicClient, {
      plugins: { sudo: ecdsaValidator },
      entryPoint,
      kernelVersion: KERNEL_V3_1,
    });
  
    // Get public (non-sensitive) RPC endpoints from environment variables.
    const PAYMASTER_RPC = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC;
    const BUNDLER_RPC = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC;
    if (!PAYMASTER_RPC || !BUNDLER_RPC) {
      throw new Error("Missing ZeroDev paymaster or bundler RPC URLs (NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC, NEXT_PUBLIC_ZERODEV_BUNDLER_RPC)");
    }
  
    // Set up the ZeroDev paymaster client.
    const paymasterClient = createZeroDevPaymasterClient({
      chain: monadTestnet,
      transport: http(PAYMASTER_RPC),
    });
  
    // Create the Kernel account client that sends UserOperations.
    const kernelClient = createKernelAccountClient({
      account,
      chain: monadTestnet,
      bundlerTransport: http(`${BUNDLER_RPC}?provider=ULTRA_RELAY`),
      client: publicClient,
      paymaster: {
        getPaymasterData: async (userOperation) => {
          try {
            return await paymasterClient.sponsorUserOperation({ userOperation });
          } catch (error) {
            return {} as any;
          }
        },
      },
      userOperation: {
        estimateFeesPerGas: async () => ({
          maxFeePerGas: BigInt(0),
          maxPriorityFeePerGas: BigInt(0),
        }),
      },
    });
  
    return { kernelClient, account };
  };
  