import { describe, expect, it } from "vitest";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { createAppGateways } from "./gateways";

describe("app gateway composition", () => {
  it("keeps all gateways mock-backed when no API URL is configured", () => {
    expect(createAppGateways({}).staffAdmin).toBeInstanceOf(MockStaffAdminGateway);
  });

  it("swaps only the staff boundary when an HTTPS API URL is configured", () => {
    const gateways = createAppGateways({ VITE_TETHERLESS_API_BASE_URL: "https://api.example.test/" });
    expect(gateways.staffAdmin).toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.offlineLearning).not.toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.trainerData).not.toBeInstanceOf(ApiStaffAdminGateway);
  });
});
