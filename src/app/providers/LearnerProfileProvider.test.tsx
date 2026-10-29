import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { GatewayProvider } from "./GatewayProvider";
import { createMockGateways } from "../../services/gateways";
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
    expect(saved).toMatchObject({ displayName: "Chris", username: "cwoz", spanishAssist: false, highContrast: false, reducedMotion: false, colorTheme: "dark" });
    expect(saved?.learnerId).toBeTruthy();
    expect(saved?.deviceId).toBeTruthy();

    act(() => first.result.current.setSpanishAssist(true));
    act(() => first.result.current.setHighContrast(true));
    act(() => first.result.current.setReducedMotion(true));
    act(() => first.result.current.setColorTheme("light"));
    const persisted = first.result.current.profile;
    expect(persisted).toMatchObject({ learnerId: saved?.learnerId, deviceId: saved?.deviceId, spanishAssist: true, highContrast: true, reducedMotion: true, colorTheme: "light" });
    first.unmount();

    const reloaded = renderHook(() => useLearnerProfile(), { wrapper });
    expect(reloaded.result.current.profile).toEqual(persisted);
  });

  it("starts safely when temporary browser storage is malformed", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", "not valid json");
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    expect(result.result.current.profile).toBeNull();
  });

  it("does not persist unexpected credentials supplied alongside demo setup fields", () => {
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    const input = { learnerId: "demo", deviceId: "device", username: "test", learnerCode: "DEMO-001", cohortName: "Demo", device_token: "secret", setup_code: "secret-code" };
    act(() => result.result.current.acceptDemoSetup(input));
    const stored = window.localStorage.getItem("tetherless.learner-profile.v1")!;
    expect(stored).not.toContain("secret");
    expect(result.result.current.profile).toMatchObject({ learnerCode: "DEMO-001", cohortName: "Demo" });
  });

  it("rejects malformed typed profile fields", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: 7, deviceId: "device", displayName: {}, username: "test" }));
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    expect(result.result.current.profile).toBeNull();
  });

  it("safely upgrades profiles saved before display preferences existed", () => {
    window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "learner", deviceId: "device", displayName: "Sam", username: "sam" }));
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    expect(result.result.current.profile).toMatchObject({ displayName: "Sam", highContrast: false, reducedMotion: false, colorTheme: "dark" });
  });

  it("clears only the local learner profile for a development demo reset", () => {
    const result = renderHook(() => useLearnerProfile(), { wrapper });
    act(() => result.result.current.saveProfile({ displayName: "Chris", username: "cwoz" }));
    act(() => result.result.current.resetProfile());
    expect(result.result.current.profile).toBeNull();
    expect(window.localStorage.getItem("tetherless.learner-profile.v1")).toBeNull();
  });

  it("recovers identity from the gateway when localStorage has nothing to show", async () => {
    const gateways = createMockGateways();
    await gateways.offlineLearning.setupDevice!({ setupCode: "DEMO-2026", username: "Jordan" });
    function wrapperWithGateway({ children }: { children: React.ReactNode }) {
      return <GatewayProvider gateways={gateways}><LearnerProfileProvider>{children}</LearnerProfileProvider></GatewayProvider>;
    }
    const result = renderHook(() => useLearnerProfile(), { wrapper: wrapperWithGateway });
    expect(result.result.current.profile).toBeNull();
    await waitFor(() => expect(result.result.current.profile).not.toBeNull());
    expect(result.result.current.profile).toMatchObject({ username: "Jordan", learnerCode: "DEMO-001", cohortName: "Frontend demo cohort" });
    expect(JSON.parse(window.localStorage.getItem("tetherless.learner-profile.v1")!)).toMatchObject({ username: "Jordan" });
  });

  it("never overrides a profile already found in localStorage with the gateway's", async () => {
    const gateways = createMockGateways();
    await gateways.offlineLearning.setupDevice!({ setupCode: "DEMO-2026", username: "Gateway Learner" });
    window.localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({
      learnerId: "local-learner", deviceId: "local-device", displayName: "Local Learner", username: "local",
    }));
    function wrapperWithGateway({ children }: { children: React.ReactNode }) {
      return <GatewayProvider gateways={gateways}><LearnerProfileProvider>{children}</LearnerProfileProvider></GatewayProvider>;
    }
    const result = renderHook(() => useLearnerProfile(), { wrapper: wrapperWithGateway });
    expect(result.result.current.profile).toMatchObject({ username: "local" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.result.current.profile).toMatchObject({ username: "local" });
  });
});
