import { MockOfflineLearningGateway } from "./offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "./trainer/MockTrainerDataGateway";

export const offlineLearningGateway = new MockOfflineLearningGateway();
export const trainerDataGateway = new MockTrainerDataGateway();
