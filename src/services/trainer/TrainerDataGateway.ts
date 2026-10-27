import type { ModuleCohortSummary, TrainerLearnerSummary, TrainerModuleDetail } from "../../types/trainer";

/**
 * Dashboard reads (API Spec v1.30 section 9.1). One interface, two implementations:
 * ApiTrainerDataGateway (the server's reports) and MockTrainerDataGateway (fixtures
 * for running the app with no backend). Both return the same shapes.
 */
export interface TrainerDataGateway {
  /** One row per learner per module in the cohort. */
  listLearners(input: { cohortId: string; moduleId?: string }): Promise<TrainerLearnerSummary[]>;
  getLearnerModuleDetail(learnerId: string, moduleId: string): Promise<TrainerModuleDetail>;
  getModuleCohortSummary(input: { cohortId: string; moduleId: string }): Promise<ModuleCohortSummary>;
}
