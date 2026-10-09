import { useEffect, useState } from "react";
import { trainerDataGateway } from "../../services/gateways";
import type { TrainerLearnerSummary } from "../../types/trainer";

export function TrainerDashboardScreen() {
  const [learners, setLearners] = useState<TrainerLearnerSummary[]>([]);

  useEffect(() => { void trainerDataGateway.listLearners().then(setLearners); }, []);

  return (
    <section>
      <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">TRAINER VIEW · FIXTURE DATA</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Learning visibility, without exposing DDIL internals.</h1>
      <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-4">Learner</th><th className="px-5 py-4">Initial</th><th className="px-5 py-4">Mastery</th><th className="px-5 py-4">Answered</th><th className="px-5 py-4">Sync</th></tr></thead>
          <tbody>{learners.map((learner) => <tr className="border-b border-white/5" key={learner.learnerId}><td className="px-5 py-4 font-semibold">{learner.displayName}</td><td className="px-5 py-4">{learner.initialScorePercent}%</td><td className="px-5 py-4">{learner.currentMasteryPercent}%</td><td className="px-5 py-4">{learner.questionsAnswered}/{learner.questionsTotal}</td><td className="px-5 py-4 text-emerald-300">{learner.syncStatus}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
