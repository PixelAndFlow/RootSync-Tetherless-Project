import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SetupProfile } from "../../services/setup/LearnerSetupGateway";
import { useOfflineLearningGatewayOptional, useOfflineLearningGatewayReadyOptional } from "./GatewayProvider";

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
  /** True only while a recovery effect below is still in flight for a device
   * that might turn out to already be set up. A route guard must wait for
   * this to settle before deciding there is no profile (issue #24). In live
   * mode this provider already blocks its own render until recovery settles
   * (see below), so this stays true only for the mock-gateway case. */
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
  const live = Boolean(useOfflineLearningGatewayReadyOptional());
  const [profile, setProfile] = useState<LearnerProfile | null>(readStoredProfile);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // Live mode never trusts a cached profile enough to skip waiting on DDIL
  // (it is the authoritative source and may say "no enrollment" despite a
  // stale local cache); mock mode only needs to wait when there is nothing
  // local yet, matching main's original issue #24 behavior.
  const [recovering, setRecovering] = useState(() => (live ? Boolean(gateway?.getLearnerProfile) : Boolean(!profile && gateway?.getLearnerProfile)));
  const [recoveryError, setRecoveryError] = useState(false);
  const [retry, setRetry] = useState(0);

  // Live identity is authoritative: recovers enrollment from DDIL's own
  // durable store, validates it, and merges this device's presentation
  // preferences back in only if they belong to the same student. Blocks
  // render below until this settles, so no screen can act on a stale or
  // incomplete profile while this is in flight.
  useEffect(() => {
    if (!live || !gateway?.getLearnerProfile) return;
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
  }, [gateway, live, retry]);

  const updateProfile = (nextProfile: LearnerProfile) => {
    // Live enrollment is already committed in DDIL. Optional presentation-cache
    // failure must never send a student back through a consumed one-time code.
    try { window.localStorage.setItem(storageKey, JSON.stringify(nextProfile)); }
    catch { /* Presentation storage is best effort; enrollment stays with the gateway. */ }
    profileRef.current = nextProfile;
    setProfile(nextProfile);
  };

  // Preserve main's mock-gateway recovery as well. Live identity is authoritative
  // above (and owns `recovering` there); demo recovery must not replace a profile
  // already present or just set up, and must still hold `recovering` for a route
  // guard (issue #24) until it knows whether a demo profile exists.
  useEffect(() => {
    if (live) return;
    if (profileRef.current || !gateway?.getLearnerProfile) { setRecovering(false); return; }
    let active = true;
    void gateway.getLearnerProfile().then((stored) => {
      if (!active || !stored || profileRef.current) return;
      updateProfile({ ...stored, displayName: stored.username, spanishAssist: false, highContrast: false, reducedMotion: false, colorTheme: "dark" });
    }).catch(() => {}).finally(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [gateway, live]);

  const value = useMemo<LearnerProfileContextValue>(() => ({
    profile,
    recovering,
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
  }), [profile, recovering, gateway]);

  // Only the live recovery path blocks rendering here: it must finish before
  // any screen sees a profile, including a stale or incomplete one. Mock-mode
  // recovery stays non-blocking (matching main's original behavior) and
  // instead exposes `recovering` on the context for a route guard to use
  // (issue #24) without holding up every screen while it resolves.
  if (live && recovering) return <p role="status">Restoring your saved student profile...</p>;
  if (recoveryError) return <section role="alert"><p>Your saved student profile could not be read. Your data has not been cleared. Check browser storage and try again.</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>;
  return <LearnerProfileContext.Provider value={value}>{children}</LearnerProfileContext.Provider>;
}

export function useLearnerProfile(): LearnerProfileContextValue {
  const value = useContext(LearnerProfileContext);
  if (!value) throw new Error("useLearnerProfile must be used inside LearnerProfileProvider.");
  return value;
}
