import { ChangeEvent, FormEvent, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { AccessDenied } from "../../components/common/AccessDenied";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { mockScenarioCopy } from "../../services/mockScenarios";
import type { Cohort, ModuleCheckResult, ModulePublishResult } from "../../types/staff";

export function StaffContentWorkflowScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const [params] = useSearchParams();
  const moduleId = params.get("module");
  const invalidScenario = params.get("scenario") === "upload-invalid";

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<unknown>(null);
  const [readError, setReadError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<ModuleCheckResult | null>(null);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [previewed, setPreviewed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<ModulePublishResult | null>(null);
  const [publishError, setPublishError] = useState<unknown>(null);
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignDone, setAssignDone] = useState(false);
  const [assignError, setAssignError] = useState<unknown>(null);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const canUpload = session.permissions.includes("content.create") || session.permissions.includes("content.edit");
  if (!canUpload) return <AccessDenied />;

  const resetAfterFileChange = () => {
    setCheckResult(null); setCheckError(null); setPreviewed(false);
    setPublishResult(null); setPublishError(null);
    setCohorts(null); setCohortId(""); setAssignDone(false); setAssignError(null);
  };

  const readFileText = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsText(file);
  });

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    resetAfterFileChange();
    const file = event.target.files?.[0];
    if (!file) { setFileName(""); setParsed(null); setReadError(""); return; }
    setFileName(file.name);
    try { setParsed(JSON.parse(await readFileText(file))); setReadError(""); }
    catch { setParsed(null); setReadError("Could not read this file as module JSON."); }
  };

  const validate = async () => {
    if (!gateway || parsed === null || checking) return;
    setChecking(true); setCheckError(null); setCheckResult(null); setPreviewed(false);
    try { setCheckResult(await gateway.checkModule(parsed)); }
    catch (err) { setCheckError(err); }
    finally { setChecking(false); }
  };

  const publish = async () => {
    if (!gateway || parsed === null || publishing || !checkResult?.valid) return;
    setPublishing(true); setPublishError(null);
    try {
      const result = await gateway.createModule(parsed);
      setPublishResult(result);
      const cohortList = await gateway.listCohorts();
      setCohorts(cohortList);
      setCohortId(cohortList.find((c) => !c.archived)?.cohortId ?? "");
    } catch (err) { setPublishError(err); }
    finally { setPublishing(false); }
  };

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !publishResult || !cohortId || assigning) return;
    setAssigning(true); setAssignError(null);
    try {
      await gateway.createAssignment({ moduleId: publishResult.moduleId, contentVersion: publishResult.contentVersion, cohortId });
      setAssignDone(true);
    } catch (err) { setAssignError(err); }
    finally { setAssigning(false); }
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
        {fileName && <p className="mt-3 text-sm text-slate-400">Selected: {fileName}</p>}
        {readError && <p className="mt-3 text-sm text-rose-300" role="alert">{readError}</p>}
        <p className="mt-3 text-sm text-slate-400">Validation runs against the shared server-side validator. Files are not placed in browser storage.</p>
        <button className="ui-action mt-5" disabled={parsed === null || checking} onClick={() => void validate()} type="button">{checking ? "Validating…" : "Validate module"}</button>
        {checkError !== null && <div className="mt-4"><ApiErrorNotice error={checkError} /></div>}
      </article>
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Validation result</h2>
        {!checkResult ? <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Awaiting validation</p><p className="mt-2 text-sm text-slate-300">Validation details will appear here before preview or publication is available.</p></div>
         : checkResult.valid ? <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Looks good — {checkResult.willBe === "new_version" ? "this will be a new version" : "this will be a new module"}</p><dl className="mt-3 grid gap-1 text-sm text-slate-300"><div><dt className="inline font-semibold">Module: </dt><dd className="inline">{checkResult.summary.moduleName ?? checkResult.summary.moduleId}</dd></div><div><dt className="inline font-semibold">Questions: </dt><dd className="inline">{checkResult.summary.questionCount}</dd></div><div><dt className="inline font-semibold">Activity type: </dt><dd className="inline">{checkResult.summary.activityType}</dd></div></dl>{checkResult.warnings.length > 0 && <ul className="mt-3 list-inside list-disc text-sm leading-6 text-amber-300">{checkResult.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>}</div>
         : <div className="mt-4 rounded-xl border border-violet-300/30 p-4" role="alert"><p className="font-bold">This module has problems</p><ul className="mt-3 list-inside list-disc text-sm leading-6">{checkResult.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul></div>}
        <button className="ui-action-secondary mt-5" disabled={!checkResult?.valid} onClick={() => setPreviewed(true)} type="button">Preview module</button>
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
