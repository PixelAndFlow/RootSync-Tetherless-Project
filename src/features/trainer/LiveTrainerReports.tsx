import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { ReturnLink } from "../../components/common/ReturnLink";
import { MetricCard } from "../../components/trainer/MetricCard";
import { performanceLabels, type ReportLearner, type ReportModule, type TrainerReportsGateway } from "../../services/trainer/ApiTrainerReportsGateway";
import type { Cohort } from "../../types/staff";

const percent = (value: number | null) => value === null ? "—" : `${value}%`;
const completion = (value: ReportModule["completionStatus"]) => value === "not_started" ? "Not started" : value === "in_progress" ? "In progress" : "Completed";
const activeTime = (seconds: number) => `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;

function ReportError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="mt-5"><p className="mb-2">Report data could not be loaded.</p><ApiErrorNotice error={error} /><button type="button" className="ui-action-secondary mt-3" onClick={retry}>Retry</button></div>;
}

export function LiveTrainerDashboard({ reports }: { reports: TrainerReportsGateway }) {
  const { session } = useStaffSession();
  const staff = useStaffAdminGateway();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [rows, setRows] = useState<ReportLearner[] | null>(null);
  const [cohortError, setCohortError] = useState<unknown>(null);
  const [reportError, setReportError] = useState<unknown>(null);
  const [cohortRetry, setCohortRetry] = useState(0);
  const [reportRetry, setReportRetry] = useState(0);
  useEffect(() => {
    if (!session || !staff) return;
    let cancelled = false;
    setCohorts(null); setCohortError(null);
    void staff.listCohorts().then((next) => { if (!cancelled) { setCohorts(next); setCohortId((id) => next.some((c) => c.cohort_id === id) ? id : next[0]?.cohort_id ?? ""); } }).catch((error: unknown) => { if (!cancelled) setCohortError(error); });
    return () => { cancelled = true; };
  }, [staff, session, cohortRetry]);
  useEffect(() => {
    if (!session || !cohorts || !cohortId) { setRows(null); return; }
    let cancelled = false;
    setRows(null); setReportError(null);
    void reports.listLearners({ cohortId }).then((next) => { if (!cancelled) setRows(next); }).catch((error: unknown) => { if (!cancelled) setReportError(error); });
    return () => { cancelled = true; };
  }, [reports, session, cohorts, cohortId, reportRetry]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  return <section><ReturnLink to="/staff">Staff dashboard</ReturnLink><p className="ui-eyebrow mt-4">TRAINER VIEW · SERVER REPORT</p><h1 className="mt-3 text-3xl font-bold">Student results</h1><p className="mt-3 text-slate-300">These results reflect events received by the server. A phone may have work that has not yet been sent.</p>
    {cohortError ? <ReportError error={cohortError} retry={() => setCohortRetry((n) => n + 1)} /> : !cohorts ? <p className="mt-6" role="status">Loading cohorts…</p> : cohorts.length === 0 ? <p className="mt-6">No cohorts available.</p> : <><label className="mt-6 grid max-w-sm gap-2 text-sm font-semibold">Cohort<select className="integration-input" value={cohortId} onChange={(event) => { setRows(null); setReportError(null); setCohortId(event.target.value); }}>{cohorts.map((cohort) => <option key={cohort.cohort_id} value={cohort.cohort_id}>{cohort.name}</option>)}</select></label>
    {reportError ? <ReportError error={reportError} retry={() => setReportRetry((n) => n + 1)} /> : !rows ? <p className="mt-6" role="status">Loading report…</p> : rows.length === 0 ? <p className="mt-6">No students in this cohort report.</p> : <><p className="mt-6 text-sm text-slate-400">{rows.length} student{rows.length === 1 ? "" : "s"} in this report.</p><div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-panel"><table className="min-w-full text-left text-sm"><thead><tr><th className="p-4">Student</th><th className="p-4">Module</th><th className="p-4">Progress</th><th className="p-4">Initial score</th><th className="p-4">Mastery</th><th className="p-4">Status</th></tr></thead><tbody>{rows.flatMap((learner) => learner.modules.length ? learner.modules.map((module) => <tr className="border-t border-white/10" key={`${learner.learnerId}-${module.moduleId}`}><td className="p-4"><Link className="font-semibold text-cyan-200" to={`/trainer/learners/${encodeURIComponent(learner.learnerId)}`}>{learner.displayName}</Link></td><td className="p-4">{module.moduleTitle}</td><td className="p-4">{completion(module.completionStatus)} ({module.questionsAnswered}/{module.questionsTotal})</td><td className="p-4">{percent(module.initialScorePercent)}</td><td className="p-4">{module.currentMasteryPercent}%</td><td className="p-4">{performanceLabels[module.performanceStatus]}</td></tr>) : [<tr className="border-t border-white/10" key={learner.learnerId}><td className="p-4"><Link className="font-semibold text-cyan-200" to={`/trainer/learners/${encodeURIComponent(learner.learnerId)}`}>{learner.displayName}</Link></td><td className="p-4" colSpan={5}>No module results reported.</td></tr>])}</tbody></table></div></>}</>}
  </section>;
}

export function LiveTrainerLearnerDetail({ reports }: { reports: TrainerReportsGateway }) {
  const { session } = useStaffSession();
  const { learnerId } = useParams();
  const [report, setReport] = useState<ReportLearner | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!session || !learnerId) return;
    let cancelled = false;
    setReport(null); setError(null);
    void reports.getLearnerReport({ learnerId }).then((next) => { if (!cancelled) setReport(next); }).catch((reason: unknown) => { if (!cancelled) setError(reason); });
    return () => { cancelled = true; };
  }, [reports, session, learnerId, retry]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  return <section><ReturnLink to="/trainer">Student results</ReturnLink>{error ? <ReportError error={error} retry={() => setRetry((n) => n + 1)} /> : !report ? <p className="mt-6" role="status">Loading student report…</p> : <><p className="ui-eyebrow mt-5">STUDENT REPORT</p><h1 className="mt-2 text-3xl font-bold">{report.displayName}</h1><p className="mt-2 text-slate-400">Student code: {report.learnerCode}</p><div className="mt-6 grid gap-4 sm:grid-cols-3"><MetricCard label="Active time" value={activeTime(report.activeEngagementSeconds)} detail="Estimated from events received by the server" /><MetricCard label="Accepted events" value={report.acceptedEventCount} detail="Received by the server" /><MetricCard label="Rejected events" value={report.rejectedEventCount} detail="Reported by the server" /></div><p className="mt-5 text-sm text-amber-100">The server cannot see work that has not been sent from the phone. Last event received: {report.lastReceivedAt ? report.lastReceivedAt : "none reported"}.</p><h2 className="mt-8 text-xl font-bold">Module results</h2>{report.modules.length === 0 ? <p className="mt-4">No module results reported.</p> : <div className="mt-4 grid gap-4">{report.modules.map((module) => <article className="ui-panel p-5" key={module.moduleId}><h3 className="text-lg font-bold">{module.moduleTitle}</h3><p className="mt-2">{completion(module.completionStatus)} · {performanceLabels[module.performanceStatus]} · Version {module.contentVersion}</p><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt>Questions answered</dt><dd className="font-bold">{module.questionsAnswered}/{module.questionsTotal}</dd></div><div><dt>Initial score</dt><dd className="font-bold">{percent(module.initialScorePercent)}</dd></div><div><dt>Best score</dt><dd className="font-bold">{percent(module.bestScorePercent)}</dd></div><div><dt>Mastery</dt><dd className="font-bold">{module.currentMasteryPercent}%</dd></div></dl></article>)}</div>}</>}</section>;
}
