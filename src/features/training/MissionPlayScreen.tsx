import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ProgressBar } from "../../components/common/ProgressBar";
import { StatusChip } from "../../components/common/StatusChip";
import { AnswerCard } from "../../components/learner/AnswerCard";
import { SpanishAssistToggle } from "../../components/learner/SpanishAssistToggle";
import { EngagementStrip } from "../../components/gamification/EngagementStrip";
import { SectorMap } from "../../components/gamification/SectorMap";
import { moduleLibrary } from "../../content/modules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { offlineLearningGateway } from "../../services/gateways";
import type { AttemptRecord, EngagementSummary, SyncSummary } from "../../types/learning";
import { gamificationAwards } from "../../utils/gamification";

const presentationCopy: Record<string, string> = {
  kahoot_cards: "Quick check",
  mission_alert: "Mission alert",
  security_alert: "Security alert",
  policy_card: "Policy card",
  code_card: "Code card",
  evidence_diff: "Evidence check",
  boss_question: "Final challenge",
  image_choice: "Visual choice",
};

export function MissionPlayScreen() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { profile, setSpanishAssist } = useLearnerProfile();
  const module = moduleLibrary.find((candidate) => candidate.module_id === moduleId) ?? moduleLibrary[0];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({ status: "synced", pendingEventCount: 0 });
  const [engagement, setEngagement] = useState<EngagementSummary>({ xp: 0, currentStreak: 0, bestStreak: 0, xpAwardedQuestionIds: [], completedSectorIds: [], earnedBadgeIds: [] });
  const startedFor = useRef<string | null>(null);

  useEffect(() => offlineLearningGateway.subscribeToSyncStatus(setSyncSummary), []);
  useEffect(() => {
    const attemptKey = profile ? `${profile.learnerId}:${module.module_id}` : null;
    if (!profile || startedFor.current === attemptKey) return;
    startedFor.current = attemptKey;
    void Promise.all([
      offlineLearningGateway.startSession({ learnerId: profile.learnerId, deviceId: profile.deviceId }),
      offlineLearningGateway.startAttempt({ learnerId: profile.learnerId, moduleId: module.module_id, kind: "full" }),
    ]).then(([, createdAttempt]) => setAttempt(createdAttempt));
  }, [module.module_id, profile]);

  if (!profile) return <Navigate replace to="/learner" />;

  const question = module.questions[index];
  const awards = gamificationAwards(module);
  const selectedChoice = answers[question.id];
  const answerIsCorrect = selectedChoice === question.correct_choice;
  const completionPercent = ((index + 1) / module.questions.length) * 100;
  const checkedCount = Object.keys(revealed).length;

  const chooseAnswer = async (choiceId: string) => {
    if (revealed[question.id]) return;
    const isCorrect = choiceId === question.correct_choice;
    setAnswers((current) => ({ ...current, [question.id]: choiceId }));
    setRevealed((current) => ({ ...current, [question.id]: true }));
    if (attempt) {
      await offlineLearningGateway.saveAnswer({
        learnerId: profile.learnerId,
        moduleId: module.module_id,
        attemptId: attempt.id,
        answer: { questionId: question.id, selectedChoiceId: choiceId, isCorrect, answeredAt: new Date().toISOString() },
        xpAward: awards.questionXp,
      });
      const updatedRecord = await offlineLearningGateway.getLearnerModuleRecord(profile.learnerId, module.module_id);
      if (updatedRecord) setEngagement(updatedRecord.engagement);
    }
  };

  const move = (nextIndex: number) => setIndex(Math.max(0, Math.min(module.questions.length - 1, nextIndex)));

  const finishAttempt = async () => {
    if (!attempt) return;
    const correctQuestionIds = module.questions
      .filter((candidate) => answers[candidate.id] === candidate.correct_choice)
      .map((candidate) => candidate.id);
    await offlineLearningGateway.completeAttempt({
      learnerId: profile.learnerId,
      moduleId: module.module_id,
      attemptId: attempt.id,
      questionsTotal: module.questions.length,
      correctQuestionIds,
      sectorMasteryAwards: awards.sectorAwards,
      missionMasteryAward: awards.missionAward,
    });
    navigate(`/learner/missions/${module.module_id}/results`);
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-panel shadow-2xl shadow-black/25">
        <header className="border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.18em] text-cyan-300">RECRUIT MISSION · {question.topic.replaceAll("_", " ")}</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">{module.title.en}</h1><p className="mt-1 text-sm text-slate-400">{module.subtitle?.en}</p></div><div className="flex gap-2"><SpanishAssistToggle enabled={profile.spanishAssist} onChange={setSpanishAssist} /><div className="hidden sm:block"><StatusChip status={syncSummary.status} /></div></div></div>
          <div className="mt-5 max-w-sm"><EngagementStrip engagement={engagement} /></div>
          <div className="mt-6"><ProgressBar label={`Question ${index + 1} of ${module.questions.length}`} value={completionPercent} /></div>
        </header>
        <div className="p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3"><span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100">{presentationCopy[question.presentation] ?? "Mission question"}</span><button className={`text-sm font-semibold ${flagged[question.id] ? "text-amber-200" : "text-slate-400 hover:text-slate-200"}`} onClick={() => setFlagged((current) => ({ ...current, [question.id]: !current[question.id] }))} type="button">⚑ {flagged[question.id] ? "Flagged" : "Flag question"}</button></div>
          <article className={`rounded-2xl border bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 sm:p-6 ${question.presentation === "boss_question" ? "border-amber-300/40" : "border-white/10"}`}><h2 className="text-xl font-bold leading-8 sm:text-2xl">{question.prompt.en}</h2>{profile.spanishAssist && question.prompt.es && <p className="mt-3 text-base leading-7 text-slate-400">{question.prompt.es}</p>}{question.scenario && <div className="mt-5 rounded-xl border border-violet-300/20 bg-violet-400/10 p-4"><p className="text-sm font-semibold text-violet-100">{question.scenario.en}</p>{profile.spanishAssist && question.scenario.es && <p className="mt-2 text-sm text-violet-200/70">{question.scenario.es}</p>}</div>}
            <div className="mt-6 grid gap-3">{question.choices.map((choice, choiceIndex) => <AnswerCard choice={choice} index={choiceIndex} isCorrect={choice.id === question.correct_choice} key={choice.id} onChoose={() => void chooseAnswer(choice.id)} revealed={Boolean(revealed[question.id])} selected={selectedChoice === choice.id} spanishAssist={profile.spanishAssist} />)}</div>
            {revealed[question.id] && <div className={`mt-5 rounded-xl border p-4 text-sm leading-6 ${answerIsCorrect ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-50" : "border-rose-300/30 bg-rose-300/10 text-rose-50"}`}><p className="font-bold">{answerIsCorrect ? "Correct — mission insight saved locally." : "Not quite — review the mission insight."}</p><p className="mt-1">{question.feedback.en}</p>{profile.spanishAssist && question.feedback.es && <p className="mt-2 text-current/75">{question.feedback.es}</p>}</div>}
          </article>
          <div className="mt-6 flex items-center justify-between gap-3"><button className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30" disabled={index === 0} onClick={() => move(index - 1)} type="button">← Previous</button>{index === module.questions.length - 1 ? <button className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40" disabled={checkedCount !== module.questions.length || !attempt} onClick={() => void finishAttempt()} type="button">View mission debrief</button> : <button className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40" disabled={!revealed[question.id]} onClick={() => move(index + 1)} type="button">Next question →</button>}</div>
        </div>
      </div>
      <aside className="rounded-3xl border border-white/10 bg-panel p-5 lg:sticky lg:top-24 lg:h-fit"><div className="flex items-center justify-between"><div><h2 className="font-bold">Mission navigation</h2><p className="mt-1 text-xs leading-5 text-slate-400">Jump between checked questions.</p></div><span className="text-xs font-bold text-cyan-200">{checkedCount}/{module.questions.length}</span></div><div className="mt-5 grid grid-cols-5 gap-2">{module.questions.map((candidate, candidateIndex) => <button aria-label={`Question ${candidateIndex + 1}`} className={`relative h-10 rounded-lg border text-xs font-bold transition ${candidateIndex === index ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : revealed[candidate.id] ? "border-violet-300/40 bg-violet-300/10 text-violet-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25"}`} key={candidate.id} onClick={() => move(candidateIndex)} type="button">{candidateIndex + 1}{flagged[candidate.id] && <span className="absolute right-1 top-0.5 text-amber-200">•</span>}</button>)}</div><div className="mt-5 border-t border-white/10 pt-5"><p className="mb-3 text-xs font-bold tracking-[0.14em] text-slate-400">SECTOR CHECKPOINTS</p><SectorMap answeredQuestionIds={Object.keys(answers)} completedSectorIds={engagement.completedSectorIds} sectors={module.gamification?.sectors ?? []} /></div><div className="mt-5 border-t border-white/10 pt-5"><StatusChip status={syncSummary.status} /><p className="mt-3 text-xs leading-5 text-slate-400">XP rewards engagement only. They never change your score or mastery.</p></div></aside>
    </section>
  );
}
