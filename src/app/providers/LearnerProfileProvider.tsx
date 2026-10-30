import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SetupProfile } from "../../services/setup/LearnerSetupGateway";
import { useOptionalOfflineLearningGateway } from "./GatewayProvider";

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
  const gateway = useOptionalOfflineLearningGateway();
  const [profile, setProfile] = useState<LearnerProfile | null>(readStoredProfile);
  const [recovering, setRecovering] = useState(Boolean(gateway?.getLearnerProfile));
  const [recoveryError, setRecoveryError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!gateway?.getLearnerProfile) return;
    let cancelled = false;
    setRecovering(true);
    setRecoveryError(false);
    void gateway.getLearnerProfile().then((stored) => {
      if (cancelled) return;
      if (stored && [stored.learnerId, stored.deviceId, stored.username].some((field) => typeof field !== "string" || !field.trim())) throw new Error("Saved enrollment is incomplete");
      // IndexedDB owns enrollment. A stale presentation cache cannot establish identity.
      const preferences = readStoredProfile();
      const sameStudent = preferences?.learnerId === stored?.learnerId && preferences?.deviceId === stored?.deviceId;
      setProfile(stored ? {
        learnerId: stored.learnerId, deviceId: stored.deviceId, username: stored.username,
        displayName: sameStudent ? preferences!.displayName : stored.username,
        learnerCode: stored.learnerCode, cohortName: stored.cohortName,
        spanishAssist: sameStudent ? preferences!.spanishAssist : false,
        highContrast: sameStudent ? preferences!.highContrast : false,
        reducedMotion: sameStudent ? preferences!.reducedMotion : false,
        colorTheme: sameStudent ? preferences!.colorTheme : "dark",
      } : null);
      setRecovering(false);
    }).catch(() => { if (!cancelled) { setRecoveryError(true); setRecovering(false); } });
    return () => { cancelled = true; };
  }, [gateway, retry]);

  const updateProfile = (nextProfile: LearnerProfile) => {
    // Live enrollment is already committed in DDIL. Optional presentation-cache
    // failure must never send a student back through a consumed one-time code.
    try { window.localStorage.setItem(storageKey, JSON.stringify(nextProfile)); }
    catch (error) { if (!gateway?.getLearnerProfile) throw error; }
    setProfile(nextProfile);
  };

  const value = useMemo<LearnerProfileContextValue>(() => ({
    profile,
    // Presentation fields only; credentials remain exclusively in DDIL.
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
  }), [profile, gateway]);

  if (recovering) return <p role="status">Restoring your saved student profile...</p>;
  if (recoveryError) return <section role="alert"><p>Your saved student profile could not be read. Your data has not been cleared. Check browser storage and try again.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>;
  return <LearnerProfileContext.Provider value={value}>{children}</LearnerProfileContext.Provider>;
}

export function useLearnerProfile(): LearnerProfileContextValue {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("useLearnerProfile must be used inside LearnerProfileProvider.");
  return value;
}
