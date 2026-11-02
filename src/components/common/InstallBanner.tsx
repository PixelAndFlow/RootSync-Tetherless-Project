import { useEffect, useState } from "react";

const DISMISSED_KEY = "tetherless.installBannerDismissed";

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
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function readDismissed(): boolean {
  try { return window.localStorage.getItem(DISMISSED_KEY) === "true"; } catch { return false; }
}

function writeDismissed() {
  try { window.localStorage.setItem(DISMISSED_KEY, "true"); } catch { /* best-effort only */ }
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
    if (isStandalone() || readDismissed()) return;

    if (isIosSafari()) {
      setState({ kind: "ios" });
      return;
    }

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
    writeDismissed();
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
    <div aria-label="Install Tetherless" className="app-install-banner mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm" role="status">
      <p>
        <strong>Install Tetherless</strong>{" "}
        {state.kind === "android"
          ? "for quicker, full-screen access and better offline support."
          : "for quicker, full-screen access: tap Share, then Add to Home Screen."}
      </p>
      <div className="flex items-center gap-2">
        {state.kind === "android" && (
          <button className="ui-action" disabled={installing} onClick={() => void install()} type="button">
            {installing ? "Installing..." : "Install"}
          </button>
        )}
        <button className="ui-action-secondary" onClick={dismiss} type="button">Not now</button>
      </div>
    </div>
  );
}
