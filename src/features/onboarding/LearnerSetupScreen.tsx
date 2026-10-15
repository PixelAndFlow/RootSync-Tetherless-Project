import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";

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
  const { profile, saveProfile } = useLearnerProfile();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!displayName.trim() || !username.trim()) return;
    saveProfile({ displayName, username });
    navigate("/learner/missions");
  };

  return (
    <section className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-violet-300/20 bg-panel shadow-2xl shadow-black/30 md:grid-cols-[1.1fr_0.9fr]">
      <div className="p-6 sm:p-10">
        <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">WELCOME, RECRUIT</p>
        <h1 className="mt-3 text-3xl font-bold">Your offline cyber mission companion.</h1>
        <p className="mt-4 leading-7 text-slate-300">Set up a learner profile, download a mission, and keep learning when the connection disappears.</p>
        <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold">Your name<input autoComplete="name" className="rounded-xl border border-white/15 bg-ink px-4 py-3 text-base font-normal outline-none ring-violet-400 placeholder:text-slate-500 focus:ring-2" onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g., Alex Rivera" value={displayName} /></label>
          <label className="grid gap-2 text-sm font-semibold">Username<input autoComplete="username" className="rounded-xl border border-white/15 bg-ink px-4 py-3 text-base font-normal outline-none ring-violet-400 placeholder:text-slate-500 focus:ring-2" onChange={(event) => setUsername(event.target.value)} placeholder="Choose a username" value={username} /></label>
          <button className="mt-2 rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40" disabled={!displayName.trim() || !username.trim()} type="submit">Continue to missions</button>
        </form>
      </div>
      <aside className="onboarding-readiness border-t p-6 sm:p-10 md:border-l md:border-t-0">
        <div className="mission-ready-icon"><MissionReadyIcon /></div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em]">MISSION READY</p>
        <h2 className="mt-2 text-xl font-bold">Learning that travels with you.</h2>
        <p className="mt-3 text-sm leading-6">Your progress is saved on this device and syncs when service returns.</p>
        <ol aria-label="Your mission path" className="mission-ready-path mt-7 grid gap-4">
          <li><span>1</span><div><h3>Create profile</h3><p>Set your learner details.</p></div></li>
          <li><span>2</span><div><h3>Learn offline</h3><p>Complete mission checks at your pace.</p></div></li>
          <li><span>3</span><div><h3>Sync when ready</h3><p>Send saved progress when service returns.</p></div></li>
        </ol>
      </aside>
    </section>
  );
}
