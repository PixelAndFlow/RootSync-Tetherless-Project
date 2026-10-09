import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import type { OfflineLearningGateway } from "./offline/OfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";
import type { TrainerDataGateway } from "./trainer/TrainerDataGateway";

export interface AppGateways {
  offlineLearning: OfflineLearningGateway;
  trainerData: TrainerDataGateway;
}

export function createMockGateways(): AppGateways {
  return {
    offlineLearning: new MockOfflineLearningGateway(),
    trainerData: new MockTrainerDataGateway(),
  };
}

// This is deliberately the only default. A production DDIL/API adapter will be
// supplied at the application boundary once the team agrees the contracts.
export const mockGateways = createMockGateways();
