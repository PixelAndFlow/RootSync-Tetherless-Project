import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnswerCard } from "../../components/learner/AnswerCard";
import { SpanishAssistToggle } from "../../components/learner/SpanishAssistToggle";
import { useResumableModule } from "../missions/useResumableModule";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { useOfflineLearningGateway } from "../../app/providers/GatewayProvider";
import type { AttemptRecord, LearnerModuleRecord } from "../../types/learning";
import { gamificationAwards } from "../../utils/gamification";
import { ConfirmationDialog } from "../../components/common/ConfirmationDialog";
import { EmptyState, LoadingState } from "../../components/common/PageState";
import type { TetherlessModule } from "../../types/content";

export function RemediationScreen() {
  const { moduleId } = useParams();
  return <RemediationContent key={moduleId} />;
}

function RemediationContent() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { profile, setSpanishAssist } = useLearnerProfile();
  const offlineLearningGateway = useOfflineLearningGateway();
  const [retry, setRetry] = useState(0);
  const { data: assignedModule, record: savedRecord, activeAttempt, loading: moduleLoading, error: moduleError } = useResumableModule(moduleId, profile?.learnerId, "remediation", retry);
  const [attemptModule, setAttemptModule] = useState<TetherlessModule | null>(null);
  const module = attemptModule ?? assignedModule;
  const [record, setRecord] = useState<LearnerModuleRecord | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [practiceIds, setPracticeIds] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const mutation = useRef(false);
  const [exitOpen, setExitOpen] = useState(false);
  const exitRef = useRef<HTMLButtonElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!profile || !assignedModule || started.current) return;
    started.current = true;
    setStartError(false);
    void (async () => {
      await offlineLearningGateway.startSession({ learnerId: profile.learnerId, deviceId: profile.deviceId });
      const saved = savedRecord;
      const active = activeAttempt;
      if (active && offlineLearningGateway.getModule && (active.contentVersion === undefined || !active.questionIds?.length)) throw new Error("Saved practice content is unavailable");
      const content = assignedModule;
      const ids = active?.questionIds ?? content.questions.filter((question) => saved?.initialMissedQuestionIds.includes(question.id) && !saved.masteredQuestionIds.includes(question.id)).map((question) => question.id);
      if (ids.some((id) => !content.questions.some((question) => question.id === id))) throw new Error("Saved practice questions are unavailable");
      const created = ids.length ? active ?? await offlineLearningGateway.startRemediation({ learnerId: profile.learnerId, moduleId: content.module_id, contentVersion: content.content_version, questionIds: ids }) : null;
      setRecord(saved);
      setAttemptModule(content);
      setPracticeIds(ids);
      setAttempt(created);
      const savedAnswers = Object.fromEntries((created?.answers ?? []).map((answer) => [answer.questionId, answer.selectedChoiceId]));
      setAnswers(savedAnswers);
      setRevealed(Object.fromEntries((created?.answers ?? []).map((answer) => [answer.questionId, true])));
      const ordered = content.questions.filter((question) => ids.includes(question.id));
      const next = ordered.findIndex((question) => !savedAnswers[question.id]);
      setIndex(next < 0 ? Math.max(0, ordered.length - 1) : next);
      setPrepared(true);
    })().catch(() => { started.current = false; setStartError(true); });
  }, [assignedModule, savedRecord, activeAttempt, profile, offlineLearningGateway, retry]);
  const questions = module ? module.questions.filter((question) => practiceIds.includes(question.id)) : [];

  if (!profile) return <section className="rounded-3xl border border-white/10 bg-panel p-8"><Link to="/learner">Set up Student profile →</Link></section>;
  if (moduleLoading) return <LoadingState label="Loading mission content…" />;
  if (startError || moduleError) return <section role="alert"><p>Practice could not be prepared. Your saved answers have not been cleared. Check device storage and downloaded content, then try again.</p><button className="ui-action mt-4" type="button" onClick={() => { started.current = false; setStartError(false); setRetry((value) => value + 1); }}>Try again</button></section>;
  if (!module) return <EmptyState actionLabel="Mission library" actionTo="/learner/missions" detail="This mission could not be loaded. Check your connection and try again." title="Mission unavailable." />;
  if (!prepared) return <LoadingState label="Loading your local learning record..." />;
  if (!record) return <EmptyState title="No completed mission to practice yet." detail="Complete a mission first, then return to practice missed questions." actionLabel="Mission library" actionTo="/learner/missions" />;
  if (!questions.length) return <section className="rounded-3xl border border-emerald-300/20 bg-panel p-8"><p className="text-xs font-bold tracking-[0.18em] text-emerald-200">MASTERY COMPLETE</p><h1 className="mt-3 text-3xl font-bold">No missed questions need practice.</h1><Link className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold" to={`/learner/missions/${module.module_id}/results`}>Return to debrief</Link></section>;

  const awards = gamificationAwards(module);
  const question = questions[index];
  const selected = answers[question.id];
  const answerIsCorrect = selected === question.correct_choice;
  const choose = async (choiceId: string) => {
    if (revealed[question.id] || mutation.current || !attempt) return;
    mutation.current = true;
    const isCorrect = choiceId === question.correct_choice;
    setSavingQuestionId(question.id);
    setSaveError(null);
    try {
      await offlineLearningGateway.saveAnswer({ learnerId: profile.learnerId, moduleId: module.module_id, attemptId: attempt.id, xpAward: awards.questionXp, answer: { questionId: question.id, selectedChoiceId: choiceId, isCorrect, answeredAt: new Date().toISOString() } });
      setAnswers((current) => ({ ...current, [question.id]: choiceId }));
      setRevealed((current) => ({ ...current, [question.id]: true }));
    } catch {
      setSaveError("Your answer was not saved. Please choose an answer again.");
    } finally {
      setSavingQuestionId(null);
      mutation.current = false;
    }
  };
  const finish = async () => {
    if (!attempt || mutation.current) return;
    mutation.current = true;
    setFinishing(true);
    setFinishError(false);
    const correctQuestionIds = questions.filter((candidate) => answers[candidate.id] === candidate.correct_choice).map((candidate) => candidate.id);
    try { await offlineLearningGateway.completeAttempt({ learnerId: profile.learnerId, moduleId: module.module_id, attemptId: attempt.id, questionsTotal: module.questions.length, correctQuestionIds, sectorMasteryAwards: awards.sectorAwards, missionMasteryAward: awards.missionAward });
    navigate(`/learner/missions/${module.module_id}/results`);
    } catch { setFinishError(true); }
    finally { mutation.current = false; setFinishing(false); }
  };

  const isSavingAnswer = savingQuestionId === question.id;

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-violet-300/20 bg-panel p-6 shadow-2xl shadow-black/25 sm:p-8">
      <button className="ui-action-secondary mb-3" disabled={Boolean(savingQuestionId) || finishing} onClick={() => setExitOpen(true)} ref={exitRef} type="button">Exit practice</button>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-violet-200">PRACTICE MISSED QUESTIONS</p>
          <h1 className="mt-2 text-3xl font-bold">Strengthen your mastery.</h1>
          <p className="mt-2 text-sm text-slate-400">Question {index + 1} of {questions.length} - Your first score stays unchanged.</p>
        </div>
        <SpanishAssistToggle enabled={profile.spanishAssist} onChange={setSpanishAssist} />
      </div>
      <article className="mt-7 rounded-2xl border border-white/10 bg-ink/40 p-5 sm:p-6">
        <h2 className="text-xl font-bold leading-8">{question.prompt.en}</h2>
        {profile.spanishAssist && question.prompt.es && <p className="mt-3 text-slate-400">{question.prompt.es}</p>}
        <div className="mt-6 grid gap-3">
          {question.choices.map((choice, choiceIndex) => (
            <AnswerCard choice={choice} disabled={Boolean(savingQuestionId)} index={choiceIndex} isCorrect={choice.id === question.correct_choice} key={choice.id} onChoose={() => void choose(choice.id)} revealed={Boolean(revealed[question.id])} selected={selected === choice.id} spanishAssist={profile.spanishAssist} />
          ))}
        </div>
        {isSavingAnswer && <p aria-live="polite" className="mt-4 text-sm text-cyan-100">Saving your answer locally...</p>}
        {saveError && <p aria-live="assertive" className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 p-4 text-sm text-rose-100">{saveError}</p>}
        {finishError && <p role="alert">Practice completion could not be saved locally. Your saved answers remain available. Try Update mastery again.</p>}
        {revealed[question.id] && <div className={`mt-5 rounded-xl border p-4 text-sm ${answerIsCorrect ? "border-emerald-300/30 bg-emerald-300/10" : "border-rose-300/30 bg-rose-300/10"}`}><strong>{answerIsCorrect ? "Correct. Saved locally." : "Keep practicing. Saved locally."}</strong><p className="mt-1">{question.feedback.en}</p></div>}
      </article>
      <div className="mt-6 flex justify-between">
        <button className="rounded-xl border border-white/15 px-4 py-3 font-bold disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(index - 1)} type="button">Previous</button>
        {index === questions.length - 1
          ? <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-40" disabled={Object.keys(revealed).length !== questions.length || finishing || Boolean(savingQuestionId)} onClick={() => void finish()} type="button">{finishing ? "Saving completion..." : "Update mastery"}</button>
          : <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-40" disabled={!revealed[question.id]} onClick={() => setIndex(index + 1)} type="button">Next question</button>}
      </div>
      {exitOpen && <ConfirmationDialog title="Exit practice?" detail="Your saved answers remain in this unfinished practice session. Return to practice to continue. In demo mode, progress resets on reload." confirmLabel="Exit to mission debrief" onCancel={() => setExitOpen(false)} onConfirm={() => navigate(`/learner/missions/${module.module_id}/results`)} returnFocusTo={exitRef.current} />}
    </section>
  );
}
