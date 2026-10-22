import { createContext, useContext, useMemo, useState } from "react";
import type { SetupProfile } from "../../services/setup/LearnerSetupGateway";

export interface LearnerProfile {
  learnerId: string;
  deviceId: string;
  displayName: string;
  username: string;
  learnerCode?: string;
  cohortName?: string;
  spanishAssist: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  colorTheme: "dark" | "light";
}

interface LearnerProfileContextValue {
  profile: LearnerProfile | null;
  saveProfile: (input: Pick<LearnerProfile, "displayName" | "username">) => void;
  acceptDemoSetup: (input: SetupProfile) => void;
  setSpanishAssist: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setColorTheme: (theme: LearnerProfile["colorTheme"]) => void;
  resetProfile: () => void;
}

const storageKey = "tetherless.learner-profile.v1";
const LearnerProfileContext = createContext<LearnerProfileContextValue | null>(null);

function readStoredProfile(): LearnerProfile | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return null;
    const storedProfile = JSON.parse(value) as Partial<LearnerProfile>;
    if (typeof storedProfile.learnerId !== "string" || !storedProfile.learnerId || typeof storedProfile.deviceId !== "string" || !storedProfile.deviceId || typeof storedProfile.displayName !== "string" || !storedProfile.displayName || typeof storedProfile.username !== "string" || !storedProfile.username) return null;
    return {
      learnerId: storedProfile.learnerId,
      deviceId: storedProfile.deviceId,
      displayName: storedProfile.displayName,
      username: storedProfile.username,
      learnerCode: typeof storedProfile.learnerCode === "string" ? storedProfile.learnerCode : undefined,
      cohortName: typeof storedProfile.cohortName === "string" ? storedProfile.cohortName : undefined,
      spanishAssist: Boolean(storedProfile.spanishAssist),
      highContrast: Boolean(storedProfile.highContrast),
      reducedMotion: Boolean(storedProfile.reducedMotion),
      colorTheme: storedProfile.colorTheme === "light" ? "light" : "dark",
    };
  } catch {
    return null;
  }
}

export function LearnerProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<LearnerProfile | null>(readStoredProfile);

  const updateProfile = (nextProfile: LearnerProfile) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextProfile));
    setProfile(nextProfile);
  };

  const value = useMemo<LearnerProfileContextValue>(() => ({
    profile,
    // This provider persists DEMO presentation/profile data only. Real credentials
    // and profile recovery belong to Naquan's adapter, never to React/localStorage.
    acceptDemoSetup: (input) => updateProfile({
      learnerId: input.learnerId,
      deviceId: input.deviceId,
      username: input.username,
      learnerCode: input.learnerCode,
      cohortName: input.cohortName,
      displayName: input.username,
      spanishAssist: profile?.spanishAssist ?? false,
      highContrast: profile?.highContrast ?? false,
      reducedMotion: profile?.reducedMotion ?? false,
      colorTheme: profile?.colorTheme ?? "dark",
    }),
    saveProfile: ({ displayName, username }) => updateProfile({
      learnerId: profile?.learnerId ?? crypto.randomUUID(),
      deviceId: profile?.deviceId ?? crypto.randomUUID(),
      displayName: displayName.trim(),
      username: username.trim(),
      learnerCode: profile?.learnerCode,
      cohortName: profile?.cohortName,
      spanishAssist: profile?.spanishAssist ?? false,
      highContrast: profile?.highContrast ?? false,
      reducedMotion: profile?.reducedMotion ?? false,
      colorTheme: profile?.colorTheme ?? "dark",
    }),
    setSpanishAssist: (spanishAssist) => {
      if (profile) updateProfile({ ...profile, spanishAssist });
    },
    setHighContrast: (highContrast) => {
      if (profile) updateProfile({ ...profile, highContrast });
    },
    setReducedMotion: (reducedMotion) => {
      if (profile) updateProfile({ ...profile, reducedMotion });
    },
    setColorTheme: (colorTheme) => {
      if (profile) updateProfile({ ...profile, colorTheme });
    },
    resetProfile: () => {
      window.localStorage.removeItem(storageKey);
      setProfile(null);
    },
  }), [profile]);

  return <LearnerProfileContext.Provider value={value}>{children}</LearnerProfileContext.Provider>;
}

export function useLearnerProfile(): LearnerProfileContextValue {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("useLearnerProfile must be used inside LearnerProfileProvider.");
  return value;
}
