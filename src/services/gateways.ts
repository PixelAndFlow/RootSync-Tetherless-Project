import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import type { OfflineLearningGateway } from "./offline/OfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "./trainer/TrainerDataGateway";
import type { LearnerSetupGateway } from "./setup/LearnerSetupGateway";
import { MockLearnerSetupGateway } from "./setup/MockLearnerSetupGateway";
import { MockStaffAdminGateway } from "./staff/MockStaffAdminGateway";
import type { StaffAdminGateway } from "./staff/StaffAdminGateway";

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
