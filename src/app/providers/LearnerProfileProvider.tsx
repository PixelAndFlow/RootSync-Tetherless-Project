import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SetupProfile } from "../../services/setup/LearnerSetupGateway";
import { useOfflineLearningGatewayOptional } from "./GatewayProvider";

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
  /** True only while the gateway-recovery effect below is still in flight for a
   * device that might turn out to already be set up. A route guard must wait
   * for this to settle before deciding there is no profile (issue #24). */
  recovering: boolean;
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
  const gateway = useOfflineLearningGatewayOptional();
  const [profile, setProfile] = useState<LearnerProfile | null>(readStoredProfile);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [recovering, setRecovering] = useState(() => Boolean(!profile && gateway?.getLearnerProfile));

  const updateProfile = (nextProfile: LearnerProfile) => {
    try { window.localStorage.setItem(storageKey, JSON.stringify(nextProfile)); }
    catch {
      // Best effort. A learner whose gateway-side setup already succeeded
      // must not get stuck here just because this browser's storage is full
      // or unavailable — only persistence across reload is lost, not the
      // current session, and the gateway reconciliation effect below can
      // recover identity from its own durable store on the next mount.
    }
    setProfile(nextProfile);
  };

  const acceptDemoSetup = (input: SetupProfile) => updateProfile({
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
  });
  const acceptDemoSetupRef = useRef(acceptDemoSetup);
  acceptDemoSetupRef.current = acceptDemoSetup;

  // Recovers identity from the gateway's own durable store (IndexedDB, in live
  // mode) when localStorage has nothing to show — cleared, never written, or
  // corrupted — but the device already completed setup there. Without this,
  // a learner who clears/loses localStorage (or whose earlier setup write to
  // it failed) is shown the setup screen again for a device the backend
  // already considers claimed, with no way to recover the original identity.
  // Runs once on mount; never overwrites a profile that appeared locally in
  // the meantime (checked via profileRef, not the closed-over `profile`).
  useEffect(() => {
    if (profile || !gateway || !gateway.getLearnerProfile) { setRecovering(false); return; }
    let active = true;
    gateway.getLearnerProfile().then((recovered) => {
      if (active && recovered && !profileRef.current) acceptDemoSetupRef.current(recovered);
    }).catch(() => {}).finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway]);

  const value = useMemo<LearnerProfileContextValue>(() => ({
    profile,
    recovering,
    // This provider persists DEMO presentation/profile data only. Real
    // credentials belong to Naquan's adapter, never to React/localStorage —
    // profile recovery now defers to the gateway above when local data is missing.
    acceptDemoSetup,
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
  }), [profile, recovering]);

  return <LearnerProfileContext.Provider value={value}>{children}</LearnerProfileContext.Provider>;
}

export function useLearnerProfile(): LearnerProfileContextValue {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("useLearnerProfile must be used inside LearnerProfileProvider.");
  return value;
}
