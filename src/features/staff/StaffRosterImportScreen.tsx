import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { AccessDenied } from "../../components/common/AccessDenied";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import type { Cohort, RosterCheckResult, RosterCommitResult } from "../../types/staff";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function StaffRosterImportScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();

  // Bumped on every new file selection or cohort change. Any async result
  // captured under a stale value is discarded, same pattern as the module
  // upload workflow (StaffContentWorkflowScreen).
  const workflowRef = useRef(0);

  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohortsError, setCohortsError] = useState<unknown>(null);
  const [cohortId, setCohortId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<RosterCheckResult | null>(null);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<RosterCommitResult | null>(null);
  const [commitError, setCommitError] = useState<unknown>(null);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (!gateway || !session?.permissions.includes("learner.import")) return;
    let cancelled = false;
    void gateway.listCohorts().then((items) => {
      if (cancelled) return;
      setCohorts(items);
      setCohortId((previous) => previous || items.find((c) => !c.archived)?.cohortId || "");
    }).catch((err: unknown) => { if (!cancelled) setCohortsError(err); });
    return () => { cancelled = true; };
  }, [gateway, session]);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (!session.permissions.includes("learner.import")) return <AccessDenied />;

  const resetDownstream = () => {
    setCheckResult(null); setCheckError(null);
    setCommitResult(null); setCommitError(null); setCopyMessage("");
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    workflowRef.current++;
    resetDownstream();
    const next = event.target.files?.[0] ?? null;
    setFile(next); setFileName(next?.name ?? "");
  };

  const check = async () => {
    if (!gateway || !file || !cohortId || checking) return;
    const workflowId = ++workflowRef.current;
    setChecking(true); resetDownstream();
    try {
      const result = await gateway.checkRoster(cohortId, file);
      if (workflowRef.current !== workflowId) return;
      setCheckResult(result);
    } catch (err) {
      if (workflowRef.current !== workflowId) return;
      setCheckError(err);
    } finally {
      if (workflowRef.current === workflowId) setChecking(false);
    }
  };

  const commit = async () => {
    if (!gateway || !checkResult?.valid || committing) return;
    const workflowId = workflowRef.current;
    setCommitting(true); setCommitError(null);
    try {
      const result = await gateway.commitRoster(checkResult.importId);
      if (workflowRef.current !== workflowId) return;
      setCommitResult(result);
    } catch (err) {
      if (workflowRef.current !== workflowId) return;
      setCommitError(err);
    } finally {
      if (workflowRef.current === workflowId) setCommitting(false);
    }
  };

  const copyAllCodes = async () => {
    if (!commitResult) return;
    const text = commitResult.learners.map((l) => `${l.firstName} ${l.lastName}\t${l.setupCode}`).join("\n");
    try { await navigator.clipboard.writeText(text); setCopyMessage("All setup codes copied."); }
    catch { setCopyMessage("Copy is unavailable. Select and copy the codes manually from the table."); }
  };

  const downloadCodes = () => {
    if (!commitResult) return;
    const header = "first_name,last_name,setup_code\n";
    const rows = commitResult.learners.map((l) => [l.firstName, l.lastName, l.setupCode].map(csvEscape).join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "tetherless-setup-codes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const steps = ["Select cohort and file", "Check roster", "Preview", "Create students"];
  const stepDone = [!!file && !!cohortId, !!checkResult, !!checkResult?.valid, !!commitResult];

  return <section className="mx-auto max-w-4xl"><ReturnLink to="/staff/operations">Program operations</ReturnLink>
    <p className="ui-eyebrow mt-5">ROSTER IMPORT</p>
    <h1 className="mt-3 text-3xl font-bold">Import a roster</h1>
    <p className="mt-3 max-w-2xl text-slate-300">Upload a .csv roster for one cohort. Columns are matched by header name in any order: first_name, last_name, phone, email, training_level, note_1, note_2. Nothing is created until you confirm the preview.</p>
    <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Roster import steps">{steps.map((step, index) => <li className="ui-panel p-4" key={step}><span className="text-sm font-bold app-wordmark">{stepDone[index] ? "✓" : index + 1}</span><p className="mt-2 font-semibold">{step}</p></li>)}</ol>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Roster file</h2>
        {cohortsError !== null ? <div className="mt-4"><ApiErrorNotice error={cohortsError} /></div>
         : !cohorts ? <p className="mt-4" role="status">Loading cohorts…</p>
         : cohorts.length === 0 ? <p className="mt-4 text-sm text-slate-400">No cohorts available. Create one first.</p>
         : <label className="mt-5 grid gap-2 text-sm font-semibold">Cohort<select className="integration-input" disabled={checking} onChange={(event) => { workflowRef.current++; resetDownstream(); setCohortId(event.target.value); }} value={cohortId}>{cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.name}</option>)}</select></label>}
        <label className="mt-4 grid gap-2 text-sm font-semibold">CSV file<input accept=".csv,text/csv" className="integration-input" disabled={checking} onChange={onFileChange} type="file" /></label>
        {fileName && <p className="mt-3 text-sm text-slate-400">Selected: {fileName}</p>}
        <button className="ui-action mt-5" disabled={!file || !cohortId || checking} onClick={() => void check()} type="button">{checking ? "Checking…" : "Check roster"}</button>
        {checkError !== null && <div className="mt-4"><ApiErrorNotice error={checkError} /></div>}
      </article>
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Check result</h2>
        {!checkResult ? <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Awaiting a check</p><p className="mt-2 text-sm text-slate-300">Results will appear here after you check a file.</p></div>
         : <div className="mt-4 rounded-xl border border-white/10 p-4">
            <p className="font-bold">{checkResult.valid ? `${checkResult.rowsOk} student${checkResult.rowsOk === 1 ? "" : "s"} ready to create` : "This file has problems"}</p>
            <p className="mt-2 text-sm text-slate-300">{checkResult.rowsOk} of {checkResult.rowsTotal} rows passed.</p>
            {checkResult.warnings.length > 0 && <ul className="mt-3 list-inside list-disc text-sm leading-6 text-amber-300">{checkResult.warnings.map((w, i) => <li key={i}>{w.row ? `Row ${w.row}: ` : ""}{w.message}</li>)}</ul>}
            {checkResult.errors.length > 0 && <ul className="mt-3 list-inside list-disc text-sm leading-6 text-rose-300" role="alert">{checkResult.errors.map((e, i) => <li key={i}>{e.row ? `Row ${e.row}: ` : ""}{e.message}</li>)}</ul>}
            {checkResult.valid && checkResult.preview.length > 0 && <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-2">First</th><th className="p-2">Last</th></tr></thead><tbody>{checkResult.preview.map((row, i) => <tr className="border-b border-white/10" key={i}><td className="p-2">{row.firstName}</td><td className="p-2">{row.lastName}</td></tr>)}</tbody></table>{checkResult.rowsOk > checkResult.preview.length && <p className="mt-2 text-xs text-slate-400">Showing the first {checkResult.preview.length} of {checkResult.rowsOk}.</p>}</div>}
          </div>}
      </article>
    </div>

    {checkResult?.valid && !commitResult && <div className="mt-6 ui-panel p-5"><h2 className="text-xl font-bold">Create students</h2>
      <p className="mt-2 text-slate-300">This creates {checkResult.rowsOk} student{checkResult.rowsOk === 1 ? "" : "s"} in the selected cohort and issues a setup code for each.</p>
      <button className="ui-action mt-4" disabled={committing} onClick={() => void commit()} type="button">{committing ? "Creating…" : "Create students"}</button>
      {commitError !== null && <div className="mt-4"><ApiErrorNotice error={commitError} /></div>}
    </div>}

    {commitResult && <div className="mt-6 ui-panel p-5"><h2 className="text-xl font-bold">One-time setup codes</h2>
      <p className="mt-2 text-sm text-slate-300">Copy, print or download these now. The server can't show them again — if one is lost, issue a new code from the student's own page.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button className="ui-action-secondary" onClick={() => void copyAllCodes()} type="button">Copy all</button><button className="ui-action-secondary" onClick={downloadCodes} type="button">Download .csv</button><button className="ui-action-secondary" onClick={() => window.print()} type="button">Print</button></div>
      {copyMessage && <p className="mt-2 text-sm" role="status">{copyMessage}</p>}
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-2">Student</th><th className="p-2">Setup code</th></tr></thead><tbody>{commitResult.learners.map((learner) => <tr className="border-b border-white/10" key={learner.learnerId}><td className="p-2">{learner.firstName} {learner.lastName}</td><td className="p-2"><code className="select-all">{learner.setupCode}</code></td></tr>)}</tbody></table></div>
      <p className="mt-4 text-sm" role="status">{commitResult.created} student{commitResult.created === 1 ? "" : "s"} created.</p>
    </div>}
  </section>;
}
