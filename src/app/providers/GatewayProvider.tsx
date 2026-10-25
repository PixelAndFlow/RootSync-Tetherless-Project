import { createContext, useContext } from "react";
import { appGateways, type AppGateways } from "../../services/gateways";
import type { OfflineLearningGateway } from "../../services/offline/OfflineLearningGateway";
import type { TrainerDataGateway } from "../../services/trainer/TrainerDataGateway";
import type { StaffAdminGateway } from "../../services/staff/StaffAdminGateway";

const GatewayContext = createContext<AppGateways | null>(null);

interface GatewayProviderProps {
  children: React.ReactNode;
  gateways?: AppGateways;
}

/** Keeps UI code independent of the current mock adapters and future DDIL/API adapters. */
export function GatewayProvider({ children, gateways = appGateways }: GatewayProviderProps) {
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

export function useLearnerSetupGateway() {
  return useAppGateways().learnerSetup;
}

export function useStaffAdminGateway(): StaffAdminGateway | undefined {
  return useAppGateways().staffAdmin;
}
