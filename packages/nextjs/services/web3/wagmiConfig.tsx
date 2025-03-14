import { createStorage, createConfig } from "wagmi";
import { wagmiConnectors } from "./wagmiConnectors";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY } from "~~/scaffold.config";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// Ensure mainnet is included for ENS, ETH price, etc.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

// ** Fix: Only use localStorage on the client side **
const storage = typeof window !== "undefined" ? window.localStorage : undefined;

export const wagmiConfig = createConfig({
  chains: enabledChains,
  connectors: wagmiConnectors,
  ssr: true,
  storage: createStorage({
    storage: storage, // ** Fix: Prevents crash during SSR **
  }),
  client({ chain }) {
    let rpcFallbacks = [http()];
    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    if (alchemyHttpUrl) {
      const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
      // If using default Scaffold-ETH 2 API key, we prioritize the default RPC
      rpcFallbacks = isUsingDefaultKey ? [http(), http(alchemyHttpUrl)] : [http(alchemyHttpUrl), http()];
    }
    return createClient({
      chain,
      transport: fallback(rpcFallbacks),
      ...(chain.id !== (hardhat as Chain).id
        ? { pollingInterval: scaffoldConfig.pollingInterval }
        : {}),
    });
  },
});
