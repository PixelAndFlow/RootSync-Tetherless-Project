import { act, render, renderHook, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerProfileProvider, useLearnerProfile } from "./LearnerProfileProvider";
import { GatewayProvider } from "./GatewayProvider";
import { createMockGateways } from "../../services/gateways";

function wrapper({ children }: { children: React.ReactNode }) {
  return <LearnerProfileProvider>{children}</LearnerProfileProvider>;
}

describe("durable student identity recovery", () => {
  const enrolled = { learnerId: "real-student", deviceId: "real-device", username: "Sam", learnerCode: "TEST-1", cohortName: "Test" };
  function liveWrapper(read = vi.fn().mockResolvedValue(enrolled)) {
    const gateways = createMockGateways();
    gateways.offlineLearning.getLearnerProfile = read;
    gateways.offlineLearningReady = Promise.resolve();
    return ({ children }: { children: React.ReactNode }) => <GatewayProvider gateways={gateways}><LearnerProfileProvider>{children}</LearnerProfileProvider></GatewayProvider>;
  }
  beforeEach(() => window.localStorage.clear());
  it("restores enrollment when the presentation cache is absent", async () => {
    const result = renderHook(useLearnerProfile, { wrapper: liveWrapper() });
    await waitFor(() => expect(result.result.current?.profile).toMatchObject(enrolled));
  });
  it("does not trust stale local identity when DDIL has no enrolled student", async () => {
    localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ ...enrolled, displayName: "Sam" }));
    const result = renderHook(useLearnerProfile, { wrapper: liveWrapper(vi.fn().mockResolvedValue(null)) });
    await waitFor(() => expect(result.result.current).toBeTruthy());
    expect(result.result.current.profile).toBeNull();
  });
  it("accepts committed live setup despite presentation-cache quota failure", async () => {
    const result = renderHook(useLearnerProfile, { wrapper: liveWrapper(vi.fn().mockResolvedValue(null)) });
    await waitFor(() => expect(result.result.current).toBeTruthy());
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      act(() => result.result.current.acceptDemoSetup(enrolled));
      expect(result.result.current.profile).toMatchObject(enrolled);
    } finally { write.mockRestore(); }
  });
  it("blocks fresh setup after a recovery read failure and offers a safe retry", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("storage unavailable")).mockResolvedValue(enrolled);
    const Wrapper = liveWrapper(read);
    function Child() { return <p>Student: {useLearnerProfile().profile?.username}</p>; }
    render(<Wrapper><Child /></Wrapper>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your data has not been cleared");
    expect(screen.queryByText("Student:")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Student: Sam")).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("LearnerProfileProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves main's recovery from a prepared mock gateway when presentation data is missing", async () => {
    const gateways = createMockGateways();
    await gateways.offlineLearning.setupDevice!({ setupCode: "DEMO-2026", username: "Jordan" });
    const wrapperWithGateway = ({ children }: { children: React.ReactNode }) => <GatewayProvider gateways={gateways}><LearnerProfileProvider>{children}</LearnerProfileProvider></GatewayProvider>;
    const result = renderHook(useLearnerProfile, { wrapper: wrapperWithGateway });
    expect(result.result.current.profile).toBeNull();
    await waitFor(() => expect(result.result.current.profile).toMatchObject({ username: "Jordan", learnerCode: "DEMO-001" }));
    expect(JSON.parse(localStorage.getItem("tetherless.learner-profile.v1")!)).toMatchObject({ username: "Jordan" });
  });

  it("does not replace an existing demo profile with the mock gateway's identity", async () => {
    const gateways = createMockGateways();
    await gateways.offlineLearning.setupDevice!({ setupCode: "DEMO-2026", username: "Gateway Student" });
    localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "local", deviceId: "local-device", displayName: "Local", username: "local" }));
    const read = vi.spyOn(gateways.offlineLearning, "getLearnerProfile");
    const wrapperWithGateway = ({ children }: { children: React.ReactNode }) => <GatewayProvider gateways={gateways}><LearnerProfileProvider>{children}</LearnerProfileProvider></GatewayProvider>;
    const result = renderHook(useLearnerProfile, { wrapper: wrapperWithGateway });
    await act(async () => {});
    expect(result.result.current.profile?.username).toBe("local");
    expect(read).not.toHaveBeenCalled();
  });

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
});
