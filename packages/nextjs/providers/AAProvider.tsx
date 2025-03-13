"use client";

import React, { createContext, useContext, ReactNode, useState } from "react";
import useAAWallet, { type AAWalletState } from "~~/hooks/useAAWallet";
import { useAccount } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";

interface AAContextType extends AAWalletState {
  showEnableModal: () => void;
  hideEnableModal: () => void;
  isModalOpen: boolean;
  contractAddress: string;
  contractAbi: any[];
}

const AAContext = createContext<AAContextType>({
  isAAEnabled: false,
  aaAddress: null,
  isEnabling: false,
  error: null,
  enableAA: async () => {},
  sendAATransaction: async () => "",
  showEnableModal: () => {},
  hideEnableModal: () => {},
  isModalOpen: false,
  contractAddress: "",
  contractAbi: [],
});

export const AAProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { isConnected } = useAccount();
  const aaWalletState = useAAWallet();
  const chainId = 10143;
  const contractData = deployedContracts[chainId]?.MonadRunnerGame || { address: "", abi: [] };
  React.useEffect(() => {
    if (!isConnected) {
      setIsModalOpen(false);
    }
  }, [isConnected]);
  const showEnableModal = () => setIsModalOpen(true);
  const hideEnableModal = () => setIsModalOpen(false);
  const value: AAContextType = {
    ...aaWalletState,
    showEnableModal,
    hideEnableModal,
    isModalOpen,
    contractAddress: contractData.address,
    contractAbi: contractData.abi,
  };
  return <AAContext.Provider value={value}>{children}</AAContext.Provider>;
};

export const useAA = () => useContext(AAContext);
