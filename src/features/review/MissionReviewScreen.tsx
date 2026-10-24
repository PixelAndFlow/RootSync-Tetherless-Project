import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnswerCard } from "../../components/learner/AnswerCard";
import { SpanishAssistToggle } from "../../components/learner/SpanishAssistToggle";
import { moduleLibrary } from "../../content/modules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { useOfflineLearningGateway } from "../../app/providers/GatewayProvider";
import type { LearnerModuleRecord } from "../../types/learning";
import { EmptyState, LoadingState } from "../../components/common/PageState";

export function MissionReviewScreen() {
  const { moduleId } = useParams();
  const [searchParams] = useSearchParams();
  const { profile, setSpanishAssist } = useLearnerProfile();
  const offlineLearningGateway = useOfflineLearningGateway();
  const module = moduleLibrary.find((candidate) => candidate.module_id === moduleId) ?? moduleLibrary[0];
  const scope = searchParams.get("scope") === "correct" || searchParams.get("scope") === "missed" ? searchParams.get("scope") : "all";
  const [record, setRecord] = useState<LearnerModuleRecord | null>(null);
  const [index, setIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { if (!profile) return; void offlineLearningGateway.getLearnerModuleRecord(profile.learnerId, module.module_id).then(setRecord).finally(() => setIsLoading(false)); }, [module.module_id, profile]);
  const firstAttempt = record?.attempts.find((attempt) => attempt.kind === "full" && attempt.status === "completed");
  const questions = useMemo(() => module.questions.filter((question) => {
    const answer = firstAttempt?.answers.find((candidate) => candidate.questionId === question.id);
    return scope === "correct" ? answer?.isCorrect : scope === "missed" ? !answer?.isCorrect : true;
  }), [firstAttempt, module.questions, scope]);

  if (!profile) return <section className="rounded-3xl border border-white/10 bg-panel p-8"><Link to="/learner">Set up Student profile →</Link></section>;
  if (isLoading) return <LoadingState label="Loading saved mission record…" />;
  if (!firstAttempt) return <EmptyState actionLabel="Return to mission" actionTo={`/learner/missions/${module.module_id}/play`} detail="Complete a full mission attempt before opening a read-only review." title="No saved attempt is available." />;
  if (!questions.length) return <EmptyState actionLabel="Return to debrief" actionTo={`/learner/missions/${module.module_id}/results`} detail="No questions match this review filter." title="Nothing matches this review." />;
  const question = questions[index];
  const selected = firstAttempt.answers.find((answer) => answer.questionId === question.id)?.selectedChoiceId;
  const heading = scope === "correct" ? "Review correct answers" : scope === "missed" ? "Review initially missed answers" : "Review all answers";

  return <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl shadow-black/25 sm:p-8"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.18em] text-cyan-300">READ-ONLY REVIEW</p><h1 className="mt-2 text-3xl font-bold">{heading}</h1><p className="mt-2 text-sm text-slate-400">Question {index + 1} of {questions.length} · This view never changes score, mastery, XP, or answer history.</p></div><SpanishAssistToggle enabled={profile.spanishAssist} onChange={setSpanishAssist} /></div><article className="mt-7 rounded-2xl border border-white/10 bg-ink/40 p-5 sm:p-6"><h2 className="text-xl font-bold leading-8">{question.prompt.en}</h2>{profile.spanishAssist && question.prompt.es && <p className="mt-3 text-slate-400">{question.prompt.es}</p>}<div className="mt-6 grid gap-3">{question.choices.map((choice, choiceIndex) => <AnswerCard choice={choice} index={choiceIndex} isCorrect={choice.id === question.correct_choice} key={choice.id} onChoose={() => undefined} revealed selected={selected === choice.id} spanishAssist={profile.spanishAssist} />)}</div><div className="mt-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50"><strong>Mission insight</strong><p className="mt-1">{question.feedback.en}</p>{profile.spanishAssist && question.feedback.es && <p className="mt-2 text-cyan-100/70">{question.feedback.es}</p>}</div></article><div className="mt-6 flex items-center justify-between"><button className="rounded-xl border border-white/15 px-4 py-3 font-bold disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(index - 1)} type="button">← Previous</button>{index === questions.length - 1 ? <Link className="rounded-xl bg-violet-600 px-4 py-3 font-bold" to={`/learner/missions/${module.module_id}/results`}>Back to debrief</Link> : <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold" onClick={() => setIndex(index + 1)} type="button">Next answer →</button>}</div></section>;
}
