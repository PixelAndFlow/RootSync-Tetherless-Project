import { createContext, useContext, useMemo, useState } from "react";

export interface LearnerProfile {
  learnerId: string;
  deviceId: string;
  displayName: string;
  username: string;
  spanishAssist: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

interface LearnerProfileContextValue {
  profile: LearnerProfile | null;
  saveProfile: (input: Pick<LearnerProfile, "displayName" | "username">) => void;
  setSpanishAssist: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  resetProfile: () => void;
}

const storageKey = "tetherless.learner-profile.v1";
const LearnerProfileContext = createContext<LearnerProfileContextValue | null>(null);

function readStoredProfile(): LearnerProfile | null {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return null;
    const storedProfile = JSON.parse(value) as Partial<LearnerProfile>;
    if (!storedProfile.learnerId || !storedProfile.deviceId || !storedProfile.displayName || !storedProfile.username) return null;
    return {
      learnerId: storedProfile.learnerId,
      deviceId: storedProfile.deviceId,
      displayName: storedProfile.displayName,
      username: storedProfile.username,
      spanishAssist: Boolean(storedProfile.spanishAssist),
      highContrast: Boolean(storedProfile.highContrast),
      reducedMotion: Boolean(storedProfile.reducedMotion),
    };
  } catch {
    return null;
  }
}

export function LearnerProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<LearnerProfile | null>(readStoredProfile);

  const updateProfile = (nextProfile: LearnerProfile) => {
    setProfile(nextProfile);
    window.localStorage.setItem(storageKey, JSON.stringify(nextProfile));
  };

  const value = useMemo<LearnerProfileContextValue>(() => ({
    profile,
    saveProfile: ({ displayName, username }) => updateProfile({
      learnerId: profile?.learnerId ?? crypto.randomUUID(),
      deviceId: profile?.deviceId ?? crypto.randomUUID(),
      displayName: displayName.trim(),
      username: username.trim(),
      spanishAssist: profile?.spanishAssist ?? false,
      highContrast: profile?.highContrast ?? false,
      reducedMotion: profile?.reducedMotion ?? false,
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
    resetProfile: () => {
      setProfile(null);
      window.localStorage.removeItem(storageKey);
    },
  }), [profile]);

  return <LearnerProfileContext.Provider value={value}>{children}</LearnerProfileContext.Provider>;
}

export function useLearnerProfile(): LearnerProfileContextValue {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("useLearnerProfile must be used inside LearnerProfileProvider.");
  return value;
}
