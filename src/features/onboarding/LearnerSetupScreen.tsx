import { FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { useOfflineLearningGateway, useOfflineLearningGatewayReady } from "../../app/providers/GatewayProvider";
import { setupValidation } from "../../services/setup/LearnerSetupGateway";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";

function MissionReadyIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="32" viewBox="0 0 32 32" width="32">
      <path d="M16 3.5 26 7.7v7.1c0 6.4-4.3 11.7-10 13.7-5.7-2-10-7.3-10-13.7V7.7l10-4.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="m11.3 15.9 3.1 3.1 6.5-6.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function LearnerSetupScreen() {
  const navigate = useNavigate();
  const { profile, acceptDemoSetup } = useLearnerProfile();
  const gateway = useOfflineLearningGateway();
  const gatewayReady = useOfflineLearningGatewayReady();
  const live = Boolean(gatewayReady);
  const [setupCode, setSetupCode] = useState("");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<{ setupCode?: string; username?: string }>({});
  const [storageError, setStorageError] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !gateway.setupDevice || profile) return;
    const validation = setupValidation({ setupCode, username });
    setFieldErrors(validation);
    if (validation.setupCode || validation.username) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setStorageError(false);
    try {
      if (gatewayReady) await gatewayReady;
      const result = await gateway.setupDevice({ setupCode, username });
      try { acceptDemoSetup(result); }
      catch { setStorageError(true); return; }
      setSetupCode("");
      navigate("/learner/missions");
    } catch (reason) { setError(reason); }
    finally { setBusy(false); submitting.current = false; }
  };

  return (
    <section className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-violet-300/20 bg-panel shadow-2xl shadow-black/30 md:grid-cols-[1.1fr_0.9fr]">
      <div className="p-6 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">WELCOME, RECRUIT</p>
        <h1 className="mt-3 text-3xl font-bold">Your offline cyber mission companion.</h1>
        <p className="mt-4 leading-7 text-slate-300">Enter the setup code from your Trainer and choose a username. Real Student setup requires an internet connection.</p>
        {!live && <p className="mt-4 text-sm">Demo preview: use <strong>DEMO-2026</strong>. This repeatable code does not register a real Student. Mission progress is simulated in memory and resets on reload.</p>}
        {profile ? <div className="mt-8 grid gap-4"><p>{live ? "This student profile is already set up on this device." : "This demo Student profile is already set up."}</p><Link className="ui-action" to="/learner/missions">Continue to missions</Link><Link className="ui-action-secondary" to="/learner/settings">View Student profile and settings</Link></div> : <form aria-busy={busy} className="mt-8 grid gap-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-sm font-semibold" htmlFor="setup-code">Setup code</label>
          <input id="setup-code" autoComplete="off" spellCheck={false} disabled={busy} aria-invalid={Boolean(fieldErrors.setupCode)} aria-describedby={fieldErrors.setupCode ? "setup-code-error" : undefined} className="integration-input" onChange={(event) => setSetupCode(event.target.value)} placeholder="Enter your setup code" value={setupCode} />
          {fieldErrors.setupCode && <p id="setup-code-error" role="alert">{fieldErrors.setupCode}</p>}
          <label className="grid gap-2 text-sm font-semibold" htmlFor="setup-username">Username</label>
          <input id="setup-username" autoComplete="username" disabled={busy} aria-invalid={Boolean(fieldErrors.username)} aria-describedby="username-help" className="integration-input" onChange={(event) => setUsername(event.target.value)} placeholder="Choose a username" value={username} />
          <p id="username-help" className="text-sm" role={fieldErrors.username ? "alert" : undefined}>{fieldErrors.username ?? "2–24 letters, numbers, spaces, dots, dashes or underscores."}</p>
          {error !== null && <ApiErrorNotice error={error} />}
          {storageError && <p role="alert">The demo profile could not be saved on this device. Check browser storage permissions and try again. Existing data has not been cleared.</p>}
          {!gateway.setupDevice && <p role="alert">Device setup is not connected. The team must supply the setup adapter.</p>}
          <button className="ui-action mt-2" disabled={busy || !gateway.setupDevice} type="submit">{busy ? "Setting up…" : "Continue to missions"}</button>
        </form>}
      </div>
      <aside className="onboarding-readiness border-t p-6 sm:p-10 md:border-l md:border-t-0">
        <div className="mission-ready-icon"><MissionReadyIcon /></div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em]">MISSION READY</p>
        <h2 className="mt-2 text-xl font-bold">Learning that travels with you.</h2>
        <p className="mt-3 text-sm leading-6">{live ? "Download assigned missions while connected. Answers are saved locally on this device and can synchronize when service returns. Keep this app's browser data to preserve unsynced work." : "Designed for learning on your device and syncing when service returns. This preview does not yet provide real offline storage or synchronization."}</p>
        <ol aria-label="Your mission path" className="mission-ready-path mt-7 grid gap-4">
          <li><span>1</span><div><h3>Create profile</h3><p>Use your setup code and choose a username.</p></div></li>
          <li><span>2</span><div><h3>Study offline</h3><p>Complete mission checks at your pace.</p></div></li>
          <li><span>3</span><div><h3>Sync when ready</h3><p>Send saved progress when service returns.</p></div></li>
        </ol>
      </aside>
    </section>
  );
}
