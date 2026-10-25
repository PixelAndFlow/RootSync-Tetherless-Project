import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockGateways } from "../../services/gateways";
import { GatewayProvider, useOfflineLearningGateway, useTrainerDataGateway } from "./GatewayProvider";

function GatewayProbe({ expected }: { expected: ReturnType<typeof createMockGateways> }) {
  const offlineLearning = useOfflineLearningGateway();
  const trainerData = useTrainerDataGateway();
  return <p>{offlineLearning === expected.offlineLearning && trainerData === expected.trainerData ? "custom gateways active" : "wrong gateways"}</p>;
}

describe("GatewayProvider", () => {
  it("uses injected adapters instead of coupling screens to the default mocks", () => {
    const gateways = createMockGateways();
    render(<GatewayProvider gateways={gateways}><GatewayProbe expected={gateways} /></GatewayProvider>);
    expect(screen.getByText("custom gateways active")).toBeInTheDocument();
  });
});
