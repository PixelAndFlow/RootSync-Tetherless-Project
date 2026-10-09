import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";

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
      <aside className="border-t border-white/10 bg-gradient-to-br from-violet-600/25 via-violet-500/10 to-cyan-400/10 p-6 sm:p-10 md:border-l md:border-t-0">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-2xl">◈</span>
        <h2 className="mt-6 text-xl font-bold">Your progress stays with you.</h2>
        <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-300"><li>• Work through missions at your pace.</li><li>• Receive feedback while offline.</li><li>• Sync your completed work later.</li></ul>
      </aside>
    </section>
  );
}
