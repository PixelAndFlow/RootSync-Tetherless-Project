/** API Spec v1.30 §8.1 LearnerProfile. Retained here since LearnerProfileProvider and the setup screen both predate that naming. */
export interface SetupProfile {
  learnerId: string;
  deviceId: string;
  username: string;
  learnerCode: string;
  cohortName: string;
}

export function setupValidation(input: { setupCode: string; username: string }): { setupCode?: string; username?: string } {
  return {
    setupCode: input.setupCode.trim() ? undefined : "Enter the setup code supplied by your trainer.",
    username: /^[a-zA-Z0-9_. -]{2,24}$/.test(input.username.trim()) ? undefined : "Use 2–24 letters, numbers, spaces, dots, dashes or underscores.",
  };
}
