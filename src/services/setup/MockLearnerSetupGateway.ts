import { ApiError } from "../api/ApiError";
import { setupValidation, type LearnerSetupGateway, type SetupProfile } from "./LearnerSetupGateway";

export const DEMO_SETUP_CODE = "DEMO-2026";

/** Repeatable synthetic demo only. Does not redeem server codes or store tokens. */
export class MockLearnerSetupGateway implements LearnerSetupGateway {
  readonly mode = "mock" as const;
  private readonly learnerId = crypto.randomUUID();
  private readonly deviceId = crypto.randomUUID();
  async setupDevice(input: { setupCode: string; username: string }): Promise<SetupProfile> {
    const errors = setupValidation(input);
    if (errors.username) throw new ApiError("USERNAME_INVALID", 422);
    if (input.setupCode.trim().toUpperCase() !== DEMO_SETUP_CODE) throw new ApiError("SETUP_CODE_INVALID", 422);
    return { learnerId: this.learnerId, deviceId: this.deviceId, username: input.username.trim(), learnerCode: "DEMO-001", cohortName: "Frontend demo cohort" };
  }
}
