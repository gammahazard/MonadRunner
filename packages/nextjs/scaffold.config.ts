import * as chains from "viem/chains";
import type { Chain } from "viem/chains";

export type ScaffoldConfig = {
  targetNetworks: readonly Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

// Define your custom Monad Testnet chain using the provided info:
const monadTestnet: Chain = {
  id: 10143, // ChainID from Monad Testnet
  name: "Monad Testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
};

const scaffoldConfig = {
  // Use Monad Testnet as your target network
  targetNetworks: [monadTestnet],
  pollingInterval: 30000,
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,
  walletConnectProjectId:
    process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
  onlyLocalBurnerWallet: true,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
