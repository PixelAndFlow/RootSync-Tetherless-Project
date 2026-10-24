import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import type { OfflineLearningGateway } from "./offline/OfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "./trainer/TrainerDataGateway";
import type { LearnerSetupGateway } from "./setup/LearnerSetupGateway";
import { MockLearnerSetupGateway } from "./setup/MockLearnerSetupGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import { ApiStaffAdminGateway } from "./staff/ApiStaffAdminGateway";
import type { StaffAdminGateway } from "./staff/StaffAdminGateway";
import { readFrontendRuntimeConfig } from "./integration/runtimeConfig";

export interface AppGateways {
  offlineLearning: OfflineLearningGateway;
  trainerData: TrainerDataGateway;
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
 * marc-frontend-integration-test only: swaps staffAdmin for the real adapter
 * when VITE_TETHERLESS_API_BASE_URL is set (see .env.example). Offline
 * learning, trainer data and learner setup stay mock — only staff sign-in and
 * password change hit the real server. Falls back to mock on any config error
 * so a bad env var never blocks the rest of the app from loading.
 */
export function createAppGateways(): AppGateways {
  try {
    const config = readFrontendRuntimeConfig();
    if (config.mode === "integration" && config.apiBaseUrl) {
      return { ...createMockGateways(), staffAdmin: new ApiStaffAdminGateway(config.apiBaseUrl) };
    }
  } catch (error) {
    console.error("Falling back to mock gateways: invalid VITE_TETHERLESS_API_BASE_URL.", error);
  }
  return mockGateways;
}

export const appGateways = createAppGateways();
