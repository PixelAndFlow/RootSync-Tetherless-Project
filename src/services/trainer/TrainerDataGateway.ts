import type {
  ModuleCohortSummary,
  TrainerLearnerSummary,
  TrainerModuleDetail,
} from "../../types/trainer";

export interface TrainerDataGateway {
  listLearners(): Promise<TrainerLearnerSummary[]>;
  getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail>;
  getModuleCohortSummary(moduleId: string): Promise<ModuleCohortSummary>;
}
