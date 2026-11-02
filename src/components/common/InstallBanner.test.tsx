import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallBanner } from "./InstallBanner";

const DISMISSED_KEY = "tetherless.installBannerDismissed";
const originalUserAgent = navigator.userAgent;
const originalStandalone = Object.getOwnPropertyDescriptor(Navigator.prototype, "standalone");

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

/** Real WebKit/iOS Safari always defines this; Chromium never does, even under device emulation. */
function setIosStandaloneProperty(value: boolean) {
  Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, value });
}

class FakeBeforeInstallPromptEvent extends Event {
  prompt = vi.fn().mockResolvedValue(undefined);
  userChoice = Promise.resolve({ outcome: "accepted" as const });
  constructor() { super("beforeinstallprompt", { cancelable: true }); }
}

beforeEach(() => {
  window.localStorage.clear();
  setMatchMedia(false);
  setUserAgent("Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");
});

afterEach(() => {
  setUserAgent(originalUserAgent);
  if (originalStandalone) Object.defineProperty(Navigator.prototype, "standalone", originalStandalone);
  else Reflect.deleteProperty(Navigator.prototype, "standalone");
});

describe("InstallBanner", () => {
  it("renders nothing until beforeinstallprompt fires on Android/Chrome", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });

  it("shows an Install button after beforeinstallprompt fires, and calls prompt() on click", async () => {
    render(<InstallBanner />);
    const event = new FakeBeforeInstallPromptEvent();
    act(() => { window.dispatchEvent(event); });

    const banner = await screen.findByRole("status", { name: /Install Tetherless/ });
    expect(banner).toHaveTextContent("better offline support");

    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("hides and remembers dismissal when 'Not now' is clicked", async () => {
    render(<InstallBanner />);
    act(() => { window.dispatchEvent(new FakeBeforeInstallPromptEvent()); });
    await screen.findByRole("status", { name: /Install Tetherless/ });

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("true");
  });

  it("never shows once dismissed, even across remounts", () => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    render(<InstallBanner />);
    act(() => { window.dispatchEvent(new FakeBeforeInstallPromptEvent()); });
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });

  it("shows Add to Home Screen instructions on iOS Safari, with no Install button (no beforeinstallprompt exists there)", async () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
    setIosStandaloneProperty(false);
    render(<InstallBanner />);
    const banner = await screen.findByRole("status", { name: /Install Tetherless/ });
    expect(banner).toHaveTextContent("tap Share, then Add to Home Screen");
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
  });

  it("stays hidden on iOS Chrome (CriOS), which can't reliably install a PWA via Add to Home Screen", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1");
    setIosStandaloneProperty(false);
    render(<InstallBanner />);
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });

  it("stays hidden on a Chromium browser spoofing an iPhone Safari user agent (e.g. Playwright's device emulation), since navigator.standalone is WebKit-only", () => {
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
    render(<InstallBanner />);
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });

  it("never shows when already running installed (standalone display mode)", () => {
    setMatchMedia(true);
    render(<InstallBanner />);
    act(() => { window.dispatchEvent(new FakeBeforeInstallPromptEvent()); });
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });

  it("hides again once appinstalled fires", async () => {
    render(<InstallBanner />);
    act(() => { window.dispatchEvent(new FakeBeforeInstallPromptEvent()); });
    await screen.findByRole("status", { name: /Install Tetherless/ });

    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByRole("status", { name: /Install Tetherless/ })).not.toBeInTheDocument();
  });
});
