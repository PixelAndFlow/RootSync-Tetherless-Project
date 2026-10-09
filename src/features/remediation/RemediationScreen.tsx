import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnswerCard } from "../../components/learner/AnswerCard";
import { SpanishAssistToggle } from "../../components/learner/SpanishAssistToggle";
import { moduleLibrary } from "../../content/modules";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { offlineLearningGateway } from "../../services/gateways";
import type { AttemptRecord, LearnerModuleRecord } from "../../types/learning";

export function RemediationScreen() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { profile, setSpanishAssist } = useLearnerProfile();
  const module = moduleLibrary.find((candidate) => candidate.module_id === moduleId) ?? moduleLibrary[0];
  const [record, setRecord] = useState<LearnerModuleRecord | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const started = useRef(false);

  useEffect(() => { if (profile) void offlineLearningGateway.getLearnerModuleRecord(profile.learnerId, module.module_id).then(setRecord); }, [module.module_id, profile]);
  const questionIds = record?.initialMissedQuestionIds.filter((id) => !record.masteredQuestionIds.includes(id)) ?? [];
  const questions = module.questions.filter((question) => questionIds.includes(question.id));
  useEffect(() => {
    if (!profile || !record || !questions.length || started.current) return;
    started.current = true;
    void offlineLearningGateway.startRemediation({ learnerId: profile.learnerId, moduleId: module.module_id, questionIds }).then(setAttempt);
  }, [module.module_id, profile, questionIds, questions.length, record]);

  if (!profile) return <section className="rounded-3xl border border-white/10 bg-panel p-8"><Link to="/learner">Set up learner profile →</Link></section>;
  if (!record) return <section className="rounded-3xl border border-white/10 bg-panel p-8">Loading your local learning record…</section>;
  if (!questions.length) return <section className="rounded-3xl border border-emerald-300/20 bg-panel p-8"><p className="text-xs font-bold tracking-[0.18em] text-emerald-200">MASTERY COMPLETE</p><h1 className="mt-3 text-3xl font-bold">No missed questions need practice.</h1><Link className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold" to={`/learner/missions/${module.module_id}/results`}>Return to debrief</Link></section>;

  const question = questions[index];
  const selected = answers[question.id];
  const answerIsCorrect = selected === question.correct_choice;
  const choose = (choiceId: string) => {
    if (revealed[question.id] || !attempt) return;
    const isCorrect = choiceId === question.correct_choice;
    setAnswers((current) => ({ ...current, [question.id]: choiceId }));
    setRevealed((current) => ({ ...current, [question.id]: true }));
    void offlineLearningGateway.saveAnswer({ learnerId: profile.learnerId, moduleId: module.module_id, attemptId: attempt.id, answer: { questionId: question.id, selectedChoiceId: choiceId, isCorrect, answeredAt: new Date().toISOString() } });
  };
  const finish = async () => {
    if (!attempt) return;
    const correctQuestionIds = questions.filter((candidate) => answers[candidate.id] === candidate.correct_choice).map((candidate) => candidate.id);
    await offlineLearningGateway.completeAttempt({ learnerId: profile.learnerId, moduleId: module.module_id, attemptId: attempt.id, questionsTotal: module.questions.length, correctQuestionIds });
    navigate(`/learner/missions/${module.module_id}/results`);
  };

  return <section className="mx-auto max-w-3xl rounded-3xl border border-violet-300/20 bg-panel p-6 shadow-2xl shadow-black/25 sm:p-8"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.18em] text-violet-200">PRACTICE MISSED QUESTIONS</p><h1 className="mt-2 text-3xl font-bold">Strengthen your mastery.</h1><p className="mt-2 text-sm text-slate-400">Question {index + 1} of {questions.length} · Your first score stays unchanged.</p></div><SpanishAssistToggle enabled={profile.spanishAssist} onChange={setSpanishAssist} /></div><article className="mt-7 rounded-2xl border border-white/10 bg-ink/40 p-5 sm:p-6"><h2 className="text-xl font-bold leading-8">{question.prompt.en}</h2>{profile.spanishAssist && question.prompt.es && <p className="mt-3 text-slate-400">{question.prompt.es}</p>}<div className="mt-6 grid gap-3">{question.choices.map((choice, choiceIndex) => <AnswerCard choice={choice} index={choiceIndex} isCorrect={choice.id === question.correct_choice} key={choice.id} onChoose={() => choose(choice.id)} revealed={Boolean(revealed[question.id])} selected={selected === choice.id} spanishAssist={profile.spanishAssist} />)}</div>{revealed[question.id] && <div className={`mt-5 rounded-xl border p-4 text-sm ${answerIsCorrect ? "border-emerald-300/30 bg-emerald-300/10" : "border-rose-300/30 bg-rose-300/10"}`}><strong>{answerIsCorrect ? "Correct." : "Keep practicing."}</strong><p className="mt-1">{question.feedback.en}</p></div>}</article><div className="mt-6 flex justify-between"><button className="rounded-xl border border-white/15 px-4 py-3 font-bold disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(index - 1)} type="button">← Previous</button>{index === questions.length - 1 ? <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-40" disabled={Object.keys(revealed).length !== questions.length} onClick={() => void finish()} type="button">Update mastery</button> : <button className="rounded-xl bg-violet-600 px-4 py-3 font-bold disabled:opacity-40" disabled={!revealed[question.id]} onClick={() => setIndex(index + 1)} type="button">Next question →</button>}</div></section>;
}
