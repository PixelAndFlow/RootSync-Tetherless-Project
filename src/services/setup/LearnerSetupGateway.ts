/** Isolated frontend preparation boundary, NOT a replacement for the agreed DDIL contract. */
export interface SetupProfile {
  learnerId: string;
  deviceId: string;
  username: string;
  learnerCode: string;
  cohortName: string;
}

export interface LearnerSetupGateway {
  readonly mode: "mock";
  setupDevice(input: { setupCode: string; username: string }): Promise<SetupProfile>;
}

export function setupValidation(input: { setupCode: string; username: string }): { setupCode?: string; username?: string } {
  return {
    setupCode: input.setupCode.trim() ? undefined : "Enter the setup code supplied by your trainer.",
    username: /^[a-zA-Z0-9_. -]{2,24}$/.test(input.username.trim()) ? undefined : "Use 2–24 letters, numbers, spaces, dots, dashes or underscores.",
  };
}
