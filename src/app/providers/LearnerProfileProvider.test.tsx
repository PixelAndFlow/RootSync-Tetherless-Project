import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LearnerProfileProvider, useLearnerProfile } from "./LearnerProfileProvider";

function wrapper({ children }: { children: React.ReactNode }) {
  return <LearnerProfileProvider>{children}</LearnerProfileProvider>;
}

describe("LearnerProfileProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("trims profile input and preserves the learner/device identity across updates and reloads", () => {
    const first = renderHook(() => useLearnerProfile(), { wrapper });
    act(() => first.result.current.saveProfile({ displayName: "  Chris  ", username: "  cwoz  " }));
    const saved = first.result.current.profile;
    expect(saved).toMatchObject({ displayName: "Chris", username: "cwoz", spanishAssist: false, highContrast: false, reducedMotion: false });
    expect(saved?.learnerId).toBeTruthy();
    expect(saved?.deviceId).toBeTruthy();

    act(() => first.result.current.setSpanishAssist(true));
    act(() => first.result.current.setHighContrast(true));
    act(() => first.result.current.setReducedMotion(true));
    const persisted = first.result.current.profile;
    expect(persisted).toMatchObject({ learnerId: saved?.learnerId, deviceId: saved?.deviceId, spanishAssist: true, highContrast: true, reducedMotion: true });
    first.unmount();

    const reloaded = renderHook(() => useLearnerProfile(), { wrapper });
    expect(reloaded.result.current.profile).toEqual(persisted);
  });

  it("starts safely when temporary browser storage is malformed", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", "not valid json");
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    expect(result.result.current.profile).toBeNull();
  });

  it("safely upgrades profiles saved before display preferences existed", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "learner", deviceId: "device", displayName: "Sam", username: "sam" }));
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    expect(result.result.current.profile).toMatchObject({ displayName: "Sam", highContrast: false, reducedMotion: false });
  });
});
