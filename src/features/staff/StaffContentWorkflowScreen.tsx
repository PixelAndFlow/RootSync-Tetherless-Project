import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { AccessDenied } from "../../components/common/AccessDenied";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { ApiError } from "../../services/api/ApiError";
import { mockScenarioCopy } from "../../services/mockScenarios";
import type { Cohort, ModuleCheckResult, ModulePublishResult } from "../../types/staff";

export function StaffContentWorkflowScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const [params] = useSearchParams();
  const moduleId = params.get("module");
  const invalidScenario = params.get("scenario") === "upload-invalid";

  // Bumped on every new file selection. Any async result captured under a
  // stale value is discarded instead of applied — this is what stops an
  // earlier, slower-resolving read/check/publish/assign from overwriting
  // state that belongs to whatever the staff member has since moved on to.
  const workflowRef = useRef(0);

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<unknown>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ModuleCheckResult | null>(null);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [previewed, setPreviewed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<ModulePublishResult | null>(null);
  const [publishError, setPublishError] = useState<unknown>(null);
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohortsError, setCohortsError] = useState<unknown>(null);
  const [cohortId, setCohortId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignDone, setAssignDone] = useState(false);
  const [assignError, setAssignError] = useState<unknown>(null);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  // content.edit alone can't reach this screen: /v1/staff/modules/check always requires
  // content.create (no branch for "editing an existing module" like publish has), so an
  // edit-only role would 403 on the very first step. Tracked separately as its own fix.
  const canUpload = session.permissions.includes("content.create");
  if (!canUpload) return <AccessDenied />;

  const readFileText = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsText(file);
  });

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const workflowId = ++workflowRef.current;
    setParsed(null); setReadError("");
    setChecking(false); setCheckResult(null); setCheckError(null); setPreviewed(false);
    setPublishing(false); setPublishResult(null); setPublishError(null);
    setCohorts(null); setCohortsError(null); setCohortId(""); setAssigning(false); setAssignDone(false); setAssignError(null);

    const file = event.target.files?.[0];
    if (!file) { setFileName(""); return; }
    setFileName(file.name);
    setReading(true);
    try {
      const text = await readFileText(file);
      if (workflowRef.current !== workflowId) return; // superseded by a later selection
      setParsed(JSON.parse(text));
    } catch {
      if (workflowRef.current !== workflowId) return;
      setParsed(null); setReadError("Could not read this file as module JSON.");
    } finally {
      if (workflowRef.current === workflowId) setReading(false);
    }
  };

  const validate = async () => {
    if (!gateway || parsed === null || checking || reading) return;
    const workflowId = workflowRef.current;
    setChecking(true); setCheckError(null); setCheckResult(null); setPreviewed(false);
    try {
      const result = await gateway.checkModule(parsed);
      if (workflowRef.current !== workflowId) return;
      setCheckResult(result);
    } catch (err) {
      if (workflowRef.current !== workflowId) return;
      setCheckError(err);
    } finally {
      if (workflowRef.current === workflowId) setChecking(false);
    }
  };

  /**
   * A publish response can be lost after the server has already committed it
   * (network drop between the two). A retry then gets VERSION_EXISTS instead
   * of leaving the module unpublished. Rather than stranding the user on that
   * error, check whether the exact module/version from this check already
   * exists and, if so, treat it as the (recovered) publish result.
   */
  const reconcilePublish = async (check: ModuleCheckResult): Promise<ModulePublishResult | null> => {
    if (!gateway || !check.summary.moduleId || check.summary.contentVersion === null) return null;
    try {
      const modules = await gateway.listModules();
      const existing = modules.find((m) => m.moduleId === check.summary.moduleId);
      if (!existing?.versions.includes(check.summary.contentVersion)) return null;
      return { moduleId: existing.moduleId, contentVersion: check.summary.contentVersion, publishedAt: existing.createdAt, warnings: [] };
    } catch {
      return null; // Can't confirm either way — fall back to showing the original error.
    }
  };

  const publish = async () => {
    if (!gateway || parsed === null || publishing || !checkResult?.valid || checkResult.summary.activityType !== "multiple_choice") return;
    const workflowId = workflowRef.current;
    setPublishing(true); setPublishError(null);
    try {
      const result = await gateway.publishModule(parsed);
      if (workflowRef.current !== workflowId) return;
      setPublishResult(result);
      void loadCohortsForAssign();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_EXISTS") {
        const recovered = await reconcilePublish(checkResult);
        if (workflowRef.current !== workflowId) return;
        if (recovered) { setPublishResult(recovered); setPublishing(false); void loadCohortsForAssign(); return; }
      }
      if (workflowRef.current !== workflowId) return;
      setPublishError(err);
    } finally {
      if (workflowRef.current === workflowId) setPublishing(false);
    }
  };

  // Cohort loading is independent of publishing: publishing can succeed and
  // this can still fail (or vice versa on a retry), so it gets its own error
  // and retry rather than leaving "Assign" stuck on "Loading cohorts…" forever.
  const loadCohortsForAssign = async () => {
    if (!gateway) return;
    const workflowId = workflowRef.current;
    setCohortsError(null);
    try {
      const cohortList = await gateway.listCohorts();
      if (workflowRef.current !== workflowId) return;
      setCohorts(cohortList);
      setCohortId(cohortList.find((c) => !c.archived)?.cohortId ?? "");
    } catch (err) {
      if (workflowRef.current !== workflowId) return;
      setCohortsError(err);
    }
  };

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !publishResult || !cohortId || assigning) return;
    const workflowId = workflowRef.current;
    setAssigning(true); setAssignError(null);
    try {
      await gateway.assign({ moduleId: publishResult.moduleId, contentVersion: publishResult.contentVersion, cohortId });
      if (workflowRef.current !== workflowId) return;
      setAssignDone(true);
    } catch (err) {
      if (workflowRef.current !== workflowId) return;
      setAssignError(err);
    } finally {
      if (workflowRef.current === workflowId) setAssigning(false);
    }
  };

  const canAssign = session.permissions.includes("assignment.manage");
  const steps = ["Select file", "Validate", "Preview", "Publish", "Assign"];
  const stepDone = [parsed !== null, !!checkResult?.valid, previewed, !!publishResult, assignDone];

  return <section className="mx-auto max-w-4xl"><ReturnLink to="/staff/operations">Program operations</ReturnLink>
    <p className="ui-eyebrow mt-5">CONTENT WORKFLOW</p>
    <h1 className="mt-3 text-3xl font-bold">{moduleId ? "Upload a new module version" : "Upload a learning module"}</h1>
    <p className="mt-3 max-w-2xl text-slate-300">Select a module JSON file, validate it against the server's rules, preview it, publish it, then assign it to a cohort.</p>
    <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Content publishing steps">{steps.map((step, index) => <li className="ui-panel p-4" key={step}><span className="text-sm font-bold app-wordmark">{stepDone[index] ? "✓" : index + 1}</span><p className="mt-2 font-semibold">{step}</p></li>)}</ol>

    {invalidScenario && <div className="mt-6 rounded-xl border border-violet-300/30 p-4" role="alert"><p className="font-bold">{mockScenarioCopy.upload_invalid.title}</p><p className="mt-2 text-sm text-slate-300">{mockScenarioCopy.upload_invalid.detail}</p></div>}

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Module input</h2>
        <label className="mt-5 grid gap-2 text-sm font-semibold">JSON file<input accept="application/json,.json" className="integration-input" disabled={checking || publishing} onChange={(event) => void onFileChange(event)} type="file" /></label>
        {fileName && <p className="mt-3 text-sm text-slate-400">Selected: {fileName}{reading ? " (reading…)" : ""}</p>}
        {readError && <p className="mt-3 text-sm text-rose-300" role="alert">{readError}</p>}
        <p className="mt-3 text-sm text-slate-400">Validation runs against the shared server-side validator. Files are not placed in browser storage.</p>
        <button className="ui-action mt-5" disabled={parsed === null || checking || reading} onClick={() => void validate()} type="button">{checking ? "Validating…" : "Validate module"}</button>
        {checkError !== null && <div className="mt-4"><ApiErrorNotice error={checkError} /></div>}
      </article>
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Validation result</h2>
        {!checkResult ? <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Awaiting validation</p><p className="mt-2 text-sm text-slate-300">Validation details will appear here before preview or publication is available.</p></div>
         : checkResult.valid ? <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Looks good — {checkResult.willBe === "new_version" ? "this will be a new version" : "this will be a new module"}</p><dl className="mt-3 grid gap-1 text-sm text-slate-300"><div><dt className="inline font-semibold">Module: </dt><dd className="inline">{checkResult.summary.moduleName ?? checkResult.summary.moduleId}</dd></div><div><dt className="inline font-semibold">Questions: </dt><dd className="inline">{checkResult.summary.questionCount}</dd></div><div><dt className="inline font-semibold">Activity type: </dt><dd className="inline">{checkResult.summary.activityType}</dd></div></dl>{checkResult.warnings.length > 0 && <ul className="mt-3 list-inside list-disc text-sm leading-6 text-amber-300">{checkResult.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>}{checkResult.summary.activityType !== "multiple_choice" && <p className="mt-3 rounded-xl border border-amber-300/30 p-3 text-sm text-amber-200" role="alert">The student app can only play "multiple_choice" modules today — this one can't be previewed, published or assigned yet.</p>}</div>
         : <div className="mt-4 rounded-xl border border-violet-300/30 p-4" role="alert"><p className="font-bold">This module has problems</p><ul className="mt-3 list-inside list-disc text-sm leading-6">{checkResult.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul></div>}
        <button className="ui-action-secondary mt-5" disabled={!checkResult?.valid || checkResult.summary.activityType !== "multiple_choice"} onClick={() => setPreviewed(true)} type="button">Preview module</button>
      </article>
    </div>

    {previewed && checkResult?.valid && <div className="mt-6 ui-panel p-5"><h2 className="text-xl font-bold">Preview</h2><p className="mt-2 text-slate-300">{checkResult.summary.moduleName} — {checkResult.summary.questionCount} questions, {checkResult.summary.activityType}.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button className="ui-action" disabled={publishing || !!publishResult} onClick={() => void publish()} type="button">{publishing ? "Publishing…" : publishResult ? "Published" : "Publish module"}</button></div>
      {publishError !== null && <div className="mt-4"><ApiErrorNotice error={publishError} /></div>}
      {publishResult && <p className="mt-4 text-sm" role="status">Published {publishResult.moduleId} version {publishResult.contentVersion}.</p>}
    </div>}

    {publishResult && <div className="mt-6 ui-panel p-5"><h2 className="text-xl font-bold">Assign to a cohort</h2>
      {!canAssign ? <p className="mt-3 text-sm text-slate-400">You don't have permission to assign modules. Ask an Admin or SuperAdmin.</p>
       : assignDone ? <p className="mt-3" role="status">Assigned to the selected cohort.</p>
       : cohortsError !== null ? <div className="mt-4"><ApiErrorNotice error={cohortsError} /><button className="ui-action-secondary mt-3" onClick={() => void loadCohortsForAssign()} type="button">Retry loading cohorts</button></div>
       : !cohorts ? <p className="mt-3" role="status">Loading cohorts…</p>
       : cohorts.length === 0 ? <p className="mt-3 text-sm text-slate-400">No cohorts available to assign to.</p>
       : <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void assign(event)}>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Cohort<select className="integration-input" disabled={assigning} onChange={(event) => setCohortId(event.target.value)} value={cohortId}>{cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.name}</option>)}</select></label>
          <button className="ui-action" disabled={!cohortId || assigning} type="submit">{assigning ? "Assigning…" : "Assign to cohort"}</button>
        </form>}
      {assignError !== null && <div className="mt-4"><ApiErrorNotice error={assignError} /></div>}
    </div>}
  </section>;
}
