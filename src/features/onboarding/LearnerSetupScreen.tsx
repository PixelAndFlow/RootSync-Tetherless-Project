import { Link } from "react-router-dom";

export function LearnerSetupScreen() {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-violet-300/20 bg-panel p-6 shadow-2xl shadow-black/30 sm:p-10">
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">WELCOME, RECRUIT</p>
      <h1 className="mt-3 text-3xl font-bold">Your offline cyber mission companion.</h1>
      <p className="mt-4 leading-7 text-slate-300">Set up a learner profile, download a mission, and keep learning when the connection disappears.</p>
      <Link className="mt-8 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500" to="/learner/missions">Explore missions</Link>
    </section>
  );
}
