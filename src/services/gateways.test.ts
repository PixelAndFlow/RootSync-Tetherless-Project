import { describe, expect, it } from "vitest";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { createAppGateways } from "./gateways";
import { ApiTrainerReportsGateway } from "./trainer/ApiTrainerReportsGateway";

describe("app gateway composition", () => {
  it("keeps all gateways mock-backed when no API URL is configured", () => {
    const gateways = createAppGateways({});
    expect(gateways.staffAdmin).toBeInstanceOf(MockStaffAdminGateway);
    expect(gateways.trainerReports).toBeUndefined();
  });

  it("installs staff and trainer reports when an HTTPS API URL is configured", () => {
    const gateways = createAppGateways({ VITE_TETHERLESS_API_BASE_URL: "https://api.example.test/" });
    expect(gateways.staffAdmin).toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.trainerReports).toBeInstanceOf(ApiTrainerReportsGateway);
    expect(gateways.offlineLearning).not.toBeInstanceOf(ApiStaffAdminGateway);
    expect(gateways.trainerData).not.toBeInstanceOf(ApiStaffAdminGateway);
  });
});
