import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import type { OfflineLearningGateway } from "./offline/OfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "./trainer/TrainerDataGateway";
import type { TrainerReportsGateway } from "./trainer/ApiTrainerReportsGateway";
import type { LearnerSetupGateway } from "./setup/LearnerSetupGateway";
import { MockLearnerSetupGateway } from "./setup/MockLearnerSetupGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import type { StaffAdminGateway } from "./staff/StaffAdminGateway";
import { readFrontendRuntimeConfig } from "./integration/runtimeConfig";

export interface AppGateways {
  offlineLearning: OfflineLearningGateway;
  trainerData: TrainerDataGateway;
  trainerReports?: TrainerReportsGateway;
  /** Optional while the production DDIL setup signature is coordinated. */
  learnerSetup?: LearnerSetupGateway;
  /** Optional until Marc's staff API adapter is installed at the app boundary. */
  staffAdmin?: StaffAdminGateway;
}

export function createMockGateways(): AppGateways {
  return {
    offlineLearning: new MockOfflineLearningGateway(),
    trainerData: new MockTrainerDataGateway(),
    learnerSetup: new MockLearnerSetupGateway(),
    staffAdmin: new MockStaffAdminGateway(),
  };
}

// This is deliberately the only default. A production DDIL/API adapter will be
// supplied at the application boundary once the team agrees the contracts.
export const mockGateways = createMockGateways();

/**
 * Live mode is explicitly enabled only by VITE_TETHERLESS_API_BASE_URL.
 * Learner/DDIL remains mock-backed; trainer reports share the staff session.
 */
export function createAppGateways(environment: Record<string, string | boolean | undefined> = import.meta.env): AppGateways {
  const config = readFrontendRuntimeConfig(environment);
  if (config.mode === "integration" && config.apiBaseUrl) {
    const staffAdmin = new ApiStaffAdminGateway(config.apiBaseUrl);
    return { ...createMockGateways(), staffAdmin, trainerReports: staffAdmin.reports() };
  }
  return mockGateways;
}

export const appGateways = createAppGateways();
