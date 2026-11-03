import { useEffect, useState } from "react";

const ANDROID_DISMISSED_KEY = "tetherless.installBannerDismissed.android";
const IOS_DISMISSED_KEY = "tetherless.installBannerDismissed.ios";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  const standaloneDisplayMode = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  return standaloneDisplayMode || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iOS never fires beforeinstallprompt (issue #9) — Safari is the only iOS
 * browser whose share sheet reliably creates a true standalone install, so
 * that's the one case this shows static instructions for instead of a button.
 *
 * UA-sniffing alone isn't enough: Chromium's iPhone device-emulation profiles
 * (e.g. Playwright's, used by our own visual-regression suite) spoof an iOS
 * Safari user agent while still running Chromium. `navigator.standalone` is a
 * real WebKit/iOS-Safari-only property that Chromium never defines, even
 * under that emulation, so requiring it keeps this from false-triggering there.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const iosUserAgent = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iosUserAgent && "standalone" in navigator;
}

/**
 * Android's dismissal is permanent (localStorage): a real one-tap native
 * install exists there, so repeatedly re-nagging after an explicit "Not now"
 * adds friction without adding a better path to install.
 *
 * iOS has no native prompt at all — Add to Home Screen is a manual, easy to
 * forget sequence — so its dismissal is session-only (sessionStorage): it
 * comes back on every fresh visit until the learner actually installs,
 * rather than going silent forever after one dismissal.
 */
function readDismissed(kind: "android" | "ios"): boolean {
  try {
    const storage = kind === "android" ? window.localStorage : window.sessionStorage;
    const key = kind === "android" ? ANDROID_DISMISSED_KEY : IOS_DISMISSED_KEY;
    return storage.getItem(key) === "true";
  } catch { return false; }
}

function writeDismissed(kind: "android" | "ios") {
  try {
    const storage = kind === "android" ? window.localStorage : window.sessionStorage;
    const key = kind === "android" ? ANDROID_DISMISSED_KEY : IOS_DISMISSED_KEY;
    storage.setItem(key, "true");
  } catch { /* best-effort only */ }
}

type BannerState =
  | { kind: "hidden" }
  | { kind: "android"; prompt: BeforeInstallPromptEvent }
  | { kind: "ios" };

/**
 * App-owned fallback for issue #9: Chrome suppresses beforeinstallprompt
 * after the first engagement and can lag re-detecting an uninstall, and iOS
 * Safari never fires it at all. This banner doesn't depend on either firing
 * reliably a second time.
 */
export function InstallBanner() {
  const [state, setState] = useState<BannerState>({ kind: "hidden" });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    if (isIosSafari()) {
      if (!readDismissed("ios")) setState({ kind: "ios" });
      return;
    }

    if (readDismissed("android")) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setState({ kind: "android", prompt: event as BeforeInstallPromptEvent });
    }
    function onInstalled() {
      setState({ kind: "hidden" });
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    if (state.kind === "android" || state.kind === "ios") writeDismissed(state.kind);
    setState({ kind: "hidden" });
  }

  async function install() {
    if (state.kind !== "android") return;
    setInstalling(true);
    try {
      await state.prompt.prompt();
      await state.prompt.userChoice;
    } finally {
      setInstalling(false);
      setState({ kind: "hidden" });
    }
  }

  if (state.kind === "hidden") return null;

  return (
    <div aria-label="Install Tetherless" className="app-install-banner mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm" role="status">
      {state.kind === "android" ? (
        <p><strong>Install Tetherless</strong> for quicker, full-screen access and better offline support.</p>
      ) : (
        <div>
          <p><strong>Install Tetherless</strong> for offline access and full-screen play — it only takes a few taps:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-300">
            <li>Tap the <strong>Share</strong> icon in Safari&rsquo;s toolbar.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> in the top right.</li>
          </ol>
        </div>
      )}
      <div className="flex items-center gap-2">
        {state.kind === "android" && (
          <button className="ui-action" disabled={installing} onClick={() => void install()} type="button">
            {installing ? "Installing..." : "Install"}
          </button>
        )}
        <button className="ui-action-secondary" onClick={dismiss} type="button">
          {state.kind === "ios" ? "Remind me later" : "Not now"}
        </button>
      </div>
    </div>
  );
}
