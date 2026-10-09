import { createContext, useContext } from "react";
import { mockGateways, type AppGateways } from "../../services/gateways";
import type { OfflineLearningGateway } from "../../services/offline/OfflineLearningGateway";
import type { TrainerDataGateway } from "../../services/trainer/TrainerDataGateway";

const GatewayContext = createContext<AppGateways | null>(null);

interface GatewayProviderProps {
  children: React.ReactNode;
  gateways?: AppGateways;
}

/** Keeps UI code independent of the current mock adapters and future DDIL/API adapters. */
export function GatewayProvider({ children, gateways = mockGateways }: GatewayProviderProps) {
  return <GatewayContext.Provider value={gateways}>{children}</GatewayContext.Provider>;
}

function useAppGateways(): AppGateways {
  const gateways = useContext(GatewayContext);
  if (!gateways) throw new Error("Gateway hooks must be used inside GatewayProvider.");
  return gateways;
}

export function useOfflineLearningGateway(): OfflineLearningGateway {
  return useAppGateways().offlineLearning;
}

export function useTrainerDataGateway(): TrainerDataGateway {
  return useAppGateways().trainerData;
}
