import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useBlocker } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ConfirmationDialog } from "../../components/common/ConfirmationDialog";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import { ApiError } from "../../services/api/ApiError";
import type { TetherlessModule } from "../../../packages/content/src/tetherless-module";
import type { Assignment, Cohort, LearnerRecord, ModuleListing, SetupCodeReveal } from "../../types/staff";

const learnerName = (learner: LearnerRecord) => `${learner.firstName} ${learner.lastName}`;
const STATUS: Record<LearnerRecord["status"], string> = { awaiting_setup: "Awaiting setup", active: "Active", phone_switched_off: "Phone switched off", archived: "Archived" };

export function StaffOperationsScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [modules, setModules] = useState<ModuleListing[] | null>(null);
  const [students, setStudents] = useState<LearnerRecord[] | null>(null);
  const [cohortId, setCohortId] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [studentError, setStudentError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);
  const [uncertain, setUncertain] = useState(false);
  const [checkingCreation, setCheckingCreation] = useState(false);
  const [creationReviewed, setCreationReviewed] = useState(false);
  const checkingCreationRef = useRef(false);
  const [reload, setReload] = useState(0);
  const [reloadStudents, setReloadStudents] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [reveal, setReveal] = useState<SetupCodeReveal | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<LearnerRecord | null>(null);
  const archiveTriggerRef = useRef<HTMLElement | null>(null);
  const [archivingLearnerId, setArchivingLearnerId] = useState<string | null>(null);
  const [archiveLearnerError, setArchiveLearnerError] = useState<unknown>(null);
  const [newCohortName, setNewCohortName] = useState("");
  const [creatingCohort, setCreatingCohort] = useState(false);
  const [createCohortError, setCreateCohortError] = useState<unknown>(null);
  const [renamingCohortId, setRenamingCohortId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<unknown>(null);
  const [archivingCohortId, setArchivingCohortId] = useState<string | null>(null);
  const [archiveCohortError, setArchiveCohortError] = useState<unknown>(null);
  const [cohortArchiveTarget, setCohortArchiveTarget] = useState<Cohort | null>(null);
  const cohortArchiveTriggerRef = useRef<HTMLElement | null>(null);
  const [viewingModuleId, setViewingModuleId] = useState<string | null>(null);
  const [viewedModuleBody, setViewedModuleBody] = useState<TetherlessModule | null>(null);
  const [viewModuleError, setViewModuleError] = useState<unknown>(null);
  const [archivingModuleId, setArchivingModuleId] = useState<string | null>(null);
  const [archiveModuleError, setArchiveModuleError] = useState<unknown>(null);
  const [moduleArchiveTarget, setModuleArchiveTarget] = useState<ModuleListing | null>(null);
  const moduleArchiveTriggerRef = useRef<HTMLElement | null>(null);
  const [purgingModuleId, setPurgingModuleId] = useState<string | null>(null);
  const [purgeModuleError, setPurgeModuleError] = useState<unknown>(null);
  const [modulePurgeTarget, setModulePurgeTarget] = useState<ModuleListing | null>(null);
  const modulePurgeTriggerRef = useRef<HTMLElement | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [assignmentsError, setAssignmentsError] = useState<unknown>(null);
  const [reloadAssignments, setReloadAssignments] = useState(0);
  const [assignModuleId, setAssignModuleId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<unknown>(null);
  const [removingAssignmentId, setRemovingAssignmentId] = useState<string | null>(null);
  const blocker = useBlocker(creating || !!reveal);

  useEffect(() => {
    if (!creating && !reveal) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [creating, reveal]);

  // If creation failed while a navigation was blocked, return to the form to
  // show the error and any uncertain outcome rather than trapping the user.
  useEffect(() => { if (!creating && !reveal && blocker.state === "blocked") blocker.reset(); }, [creating, reveal, blocker]);

  useEffect(() => {
    if (!gateway || !session) return;
    let cancelled = false;
    setCohorts(null); setModules(null); setLoadError(null);
    void Promise.all([gateway.listCohorts(), gateway.listModules()]).then(([nextCohorts, nextModules]) => {
      if (cancelled) return;
      setCohorts(nextCohorts); setModules(nextModules);
      setCohortId((previous) => nextCohorts.some((c) => c.cohortId === previous) ? previous : nextCohorts[0]?.cohortId ?? "");
    }).catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [gateway, session, reload]);
  useEffect(() => {
    if (!gateway || !session || !cohorts || !cohortId) { setStudents(null); return; }
    let cancelled = false;
    setStudents(null); setStudentError(null);
    void gateway.listLearnerRecords({ cohortId }).then((items) => { if (!cancelled) { setStudents(items); if (checkingCreationRef.current) { setCreationReviewed(true); checkingCreationRef.current = false; setCheckingCreation(false); } } }).catch((err: unknown) => { if (!cancelled) { setStudentError(err); checkingCreationRef.current = false; setCheckingCreation(false); } });
    return () => { cancelled = true; };
  }, [gateway, session, cohorts, cohortId, reloadStudents]);
  useEffect(() => {
    if (!gateway || !session || !cohortId) { setAssignments(null); return; }
    let cancelled = false;
    setAssignments(null); setAssignmentsError(null);
    void gateway.listAssignments(cohortId).then((items) => { if (!cancelled) setAssignments(items); }).catch((err: unknown) => { if (!cancelled) setAssignmentsError(err); });
    return () => { cancelled = true; };
  }, [gateway, session, cohortId, reloadAssignments]);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const canManageAssignments = session.permissions.includes("assignment.manage");
  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || assigning || !cohortId || !assignModuleId) return;
    setAssigning(true); setAssignError(null);
    try { await gateway.createAssignment({ moduleId: assignModuleId, cohortId }); setAssignModuleId(""); setReloadAssignments((n) => n + 1); }
    catch (err) { setAssignError(err); }
    finally { setAssigning(false); }
  };
  const removeAssignment = async (assignment: Assignment) => {
    if (!gateway || removingAssignmentId) return;
    setRemovingAssignmentId(assignment.assignmentId);
    try { await gateway.removeAssignment(assignment.assignmentId); setReloadAssignments((n) => n + 1); }
    catch (err) { setAssignmentsError(err); }
    finally { setRemovingAssignmentId(null); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || creatingRef.current || reveal || uncertain || !cohortId || !firstName.trim() || !lastName.trim()) return;
    creatingRef.current = true; setCreating(true); setCreateError(null); setMessage("");
    try {
      const next = await gateway.createLearner({ cohortId, firstName, lastName });
      setReveal(next); setFirstName(""); setLastName(""); setReloadStudents((n) => n + 1);
    } catch (err) {
      setCreateError(err);
      if (!(err instanceof ApiError) || err.code === "NETWORK_ERROR" || err.code === "INVALID_RESPONSE" || err.status >= 500) { setCreationReviewed(false); setUncertain(true); }
    } finally { creatingRef.current = false; setCreating(false); }
  };
  const copyCode = async () => { if (!reveal) return; try { await navigator.clipboard.writeText(reveal.setupCode); setMessage("Setup code copied."); } catch { setMessage("Copy is unavailable. Select and copy the setup code manually."); } };
  const confirmArchiveLearner = async () => {
    if (!gateway || !archiveTarget) return;
    const target = archiveTarget;
    setArchiveTarget(null);
    setArchivingLearnerId(target.learnerId); setArchiveLearnerError(null);
    try { await gateway.archiveLearner(target.learnerId); setReloadStudents((n) => n + 1); setMessage(`${learnerName(target)} archived.`); }
    catch (err) { setArchiveLearnerError(err); }
    finally { setArchivingLearnerId(null); }
  };
  const submitCreateCohort = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || creatingCohort || !newCohortName.trim()) return;
    setCreatingCohort(true); setCreateCohortError(null);
    try { await gateway.createCohort(newCohortName.trim()); setNewCohortName(""); setReload((n) => n + 1); }
    catch (err) { setCreateCohortError(err); }
    finally { setCreatingCohort(false); }
  };
  const startRenameCohort = (cohort: Cohort) => { setRenamingCohortId(cohort.cohortId); setRenameValue(cohort.name); setRenameError(null); };
  const submitRenameCohort = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !renamingCohortId || !renameValue.trim()) return;
    setRenameError(null);
    try { await gateway.renameCohort(renamingCohortId, renameValue.trim()); setRenamingCohortId(null); setReload((n) => n + 1); }
    catch (err) { setRenameError(err); }
  };
  const confirmArchiveCohort = async () => {
    if (!gateway || !cohortArchiveTarget) return;
    const target = cohortArchiveTarget;
    setCohortArchiveTarget(null);
    setArchivingCohortId(target.cohortId); setArchiveCohortError(null);
    try { await gateway.archiveCohort(target.cohortId); setReload((n) => n + 1); }
    catch (err) { setArchiveCohortError(err); }
    finally { setArchivingCohortId(null); }
  };
  const viewLatestVersion = async (module: ModuleListing) => {
    if (!gateway || module.latestVersion === null) return;
    setViewingModuleId((previous) => previous === module.moduleId ? null : module.moduleId);
    setViewedModuleBody(null); setViewModuleError(null);
    if (viewingModuleId === module.moduleId) return; // collapsing, not fetching again
    try { setViewedModuleBody(await gateway.getModuleVersion(module.moduleId, module.latestVersion)); }
    catch (err) { setViewModuleError(err); }
  };
  const confirmArchiveModule = async () => {
    if (!gateway || !moduleArchiveTarget) return;
    const target = moduleArchiveTarget;
    setModuleArchiveTarget(null);
    setArchivingModuleId(target.moduleId); setArchiveModuleError(null);
    try { await gateway.archiveModule(target.moduleId); setReload((n) => n + 1); }
    catch (err) { setArchiveModuleError(err); }
    finally { setArchivingModuleId(null); }
  };
  const confirmPurgeModule = async () => {
    if (!gateway || !modulePurgeTarget) return;
    const target = modulePurgeTarget;
    setModulePurgeTarget(null);
    setPurgingModuleId(target.moduleId); setPurgeModuleError(null);
    try { await gateway.purgeModule(target.moduleId); setReload((n) => n + 1); }
    catch (err) { setPurgeModuleError(err); }
    finally { setPurgingModuleId(null); }
  };
  return <section><ReturnLink to="/staff">Staff dashboard</ReturnLink><h1 className="mt-4 text-3xl font-bold">Program operations</h1><p className="mt-2 text-slate-300">{integration ? "Manage students and view cohorts and modules using the staff API." : "Demo data for cohorts, students, setup codes and modules."}</p>
    {loadError ? <div className="mt-6"><p>Operations data could not be loaded.</p><ApiErrorNotice error={loadError} /><button className="ui-action-secondary mt-3" onClick={() => setReload((n) => n + 1)} type="button">Retry</button></div> : !cohorts || !modules ? <p className="mt-6" role="status">Loading operations…</p> : <>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><article className="ui-panel min-w-0 p-5"><h2 className="text-xl font-bold">Students and setup codes</h2>{cohorts.length === 0 ? <p className="mt-5">No cohorts available.</p> : <><label className="mt-5 grid gap-2 text-sm font-semibold">Cohort<select className="integration-input" disabled={creating || uncertain} onChange={(event) => setCohortId(event.target.value)} value={cohortId}>{cohorts.map((cohort) => <option key={cohort.cohortId} value={cohort.cohortId}>{cohort.name}</option>)}</select></label>
      {studentError ? <div className="mt-5"><p>Students could not be loaded.</p><ApiErrorNotice error={studentError} /><button className="ui-action-secondary mt-3" onClick={() => setReloadStudents((n) => n + 1)} type="button">Retry students</button></div> : !students ? <p className="mt-5" role="status">Loading students…</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-3">Student</th><th className="p-3">Username</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{students.map((student) => <tr className="border-b border-white/10" key={student.learnerId}><td className="p-3 font-semibold">{learnerName(student)}</td><td className="p-3">{student.username ?? "—"}</td><td className="p-3">{STATUS[student.status]}</td><td className="p-3 text-right"><div className="flex flex-wrap justify-end gap-2"><Link className="ui-action-secondary min-h-9 px-3 py-1 text-xs" to={`/staff/operations/learners/${encodeURIComponent(student.learnerId)}`}>Manage</Link>{session.permissions.includes("learner.archive") && <button aria-label={`Archive ${learnerName(student)}`} className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={student.status === "archived" || archivingLearnerId === student.learnerId} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(student); }} type="button">{student.status === "archived" ? "Archived" : archivingLearnerId === student.learnerId ? "Archiving…" : "Archive Student"}</button>}</div></td></tr>)}{students.length === 0 && <tr><td className="p-4 text-slate-400" colSpan={4}>No students in this cohort.</td></tr>}</tbody></table></div>}</>}</article>
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Add Student</h2><p className="mt-2 text-sm text-slate-300">Save the one-time setup code before leaving this screen.</p><form className="mt-5 grid gap-3" onSubmit={(event) => void submit(event)}><label className="grid gap-2 text-sm font-semibold">First name<input className="integration-input" onChange={(event) => setFirstName(event.target.value)} value={firstName} required /></label><label className="grid gap-2 text-sm font-semibold">Last name<input className="integration-input" onChange={(event) => setLastName(event.target.value)} value={lastName} required /></label><button className="ui-action" disabled={!cohortId || !firstName.trim() || !lastName.trim() || creating || !!reveal || uncertain} type="submit">{creating ? "Creating student…" : "Create Student and reveal code"}</button></form>
      {!!createError && <div className="mt-4"><ApiErrorNotice error={createError} />{uncertain && <><p className="mt-3" role="alert">The student may have been created, but the response was lost. Check the student list before trying again; ask an authorized staff member to issue a new setup code if needed.</p><button className="ui-action-secondary mt-3" disabled={checkingCreation} onClick={() => { setCreationReviewed(false); checkingCreationRef.current = true; setCheckingCreation(true); setReloadStudents((n) => n + 1); }} type="button">Check student list</button>{creationReviewed && <div className="mt-4"><p>Review the student list above. If the student is already there, do not create them again.</p><div className="mt-3 flex flex-wrap gap-2"><button className="ui-action-secondary" type="button" onClick={() => { setUncertain(false); setCreateError(null); setCreationReviewed(false); setFirstName(""); setLastName(""); }}>Student already exists</button><button className="ui-action-secondary" type="button" onClick={() => { setUncertain(false); setCreateError(null); setCreationReviewed(false); }}>I checked; allow another attempt</button></div></div>}</>}</div>}
      {reveal && <div className="mt-5 rounded-xl border border-dashed border-violet-300/40 p-4"><p className="font-bold">One-time setup code</p><p className="mt-2 text-sm">Copy this code now. It cannot be shown again after you dismiss it.</p><code className="mt-2 block select-all break-all text-lg">{reveal.setupCode}</code><div className="mt-3 flex flex-wrap gap-2"><button className="ui-action-secondary" onClick={() => void copyCode()} type="button">Copy code</button><button className="ui-action-secondary" onClick={() => { setReveal(null); setMessage(""); }} type="button">Done</button></div></div>}{message && <p className="mt-3 text-sm" role="status">{message}</p>}</article></div>
    <div className="mt-6 ui-panel p-5" id="cohorts"><h2 className="text-xl font-bold">Cohorts</h2>
      <ul className="mt-4 grid gap-3">{cohorts.map((cohort) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3" key={cohort.cohortId}>
        {renamingCohortId === cohort.cohortId
          ? <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(event) => void submitRenameCohort(event)}>
              <input aria-label="Rename cohort" className="integration-input flex-1" onChange={(event) => setRenameValue(event.target.value)} value={renameValue} />
              <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={!renameValue.trim()} type="submit">Save</button>
              <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" onClick={() => setRenamingCohortId(null)} type="button">Cancel</button>
            </form>
          : <span className="font-semibold">{cohort.name}{cohort.archived ? " (archived)" : ""}</span>}
        {renamingCohortId !== cohort.cohortId && <div className="flex gap-2">
          {session.permissions.includes("cohort.edit") && !cohort.archived && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" onClick={() => startRenameCohort(cohort)} type="button">Rename</button>}
          {session.permissions.includes("cohort.archive") && !cohort.archived && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={archivingCohortId === cohort.cohortId} onClick={(event) => { cohortArchiveTriggerRef.current = event.currentTarget; setCohortArchiveTarget(cohort); }} type="button">{archivingCohortId === cohort.cohortId ? "Archiving…" : "Archive"}</button>}
        </div>}
      </li>)}{cohorts.length === 0 && <li className="text-sm text-slate-400">No cohorts yet.</li>}</ul>
      {renameError !== null && <div className="mt-3"><ApiErrorNotice error={renameError} /></div>}
      {archiveCohortError !== null && <div className="mt-3"><ApiErrorNotice error={archiveCohortError} /></div>}
      {session.permissions.includes("cohort.create") && <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void submitCreateCohort(event)}>
        <label className="grid gap-2 text-sm font-semibold sm:col-span-2">New cohort name<input className="integration-input" onChange={(event) => setNewCohortName(event.target.value)} value={newCohortName} /></label>
        <button className="ui-action" disabled={!newCohortName.trim() || creatingCohort} type="submit">{creatingCohort ? "Creating…" : "Create cohort"}</button>
      </form>}
      {createCohortError !== null && <div className="mt-3"><ApiErrorNotice error={createCohortError} /></div>}
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><article className="ui-panel p-5" id="content"><h2 className="text-xl font-bold">Content and assignments</h2>{modules.length === 0 ? <p className="mt-4">No modules available.</p> : <ul className="mt-4 grid gap-3">{modules.map((module) => <li className="rounded-xl border border-white/10 p-4" key={module.moduleId}><strong>{module.moduleName}</strong><p className="mt-1 text-sm text-slate-300">Version {module.latestVersion ?? "—"} · {module.archived ? "Archived" : module.latestVersion === null ? "Unpublished" : "Published"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="ui-action-secondary min-h-9 px-3 py-1 text-xs" to={`/staff/content?module=${encodeURIComponent(module.moduleId)}`}>Upload a new version</Link>
        {module.latestVersion !== null && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" onClick={() => void viewLatestVersion(module)} type="button">{viewingModuleId === module.moduleId ? "Hide version" : "View latest version"}</button>}
        {session.permissions.includes("content.archive") && !module.archived && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={archivingModuleId === module.moduleId} onClick={(event) => { moduleArchiveTriggerRef.current = event.currentTarget; setModuleArchiveTarget(module); }} type="button">{archivingModuleId === module.moduleId ? "Archiving…" : "Archive"}</button>}
        {session.permissions.includes("data.purge") && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={purgingModuleId === module.moduleId} onClick={(event) => { modulePurgeTriggerRef.current = event.currentTarget; setModulePurgeTarget(module); }} type="button">{purgingModuleId === module.moduleId ? "Purging…" : "Purge"}</button>}
      </div>
      {viewingModuleId === module.moduleId && <div className="mt-3 rounded-lg border border-white/10 p-3">
        {viewModuleError !== null ? <ApiErrorNotice error={viewModuleError} /> : !viewedModuleBody ? <p className="text-sm" role="status">Loading version…</p> : <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(viewedModuleBody, null, 2)}</pre>}
      </div>}
    </li>)}</ul>}
    {archiveModuleError !== null && <div className="mt-3"><ApiErrorNotice error={archiveModuleError} /></div>}
    {purgeModuleError !== null && <div className="mt-3"><ApiErrorNotice error={purgeModuleError} /></div>}
    <Link className="ui-action-secondary mt-4" to="/staff/content">Upload a module</Link>
      <h3 className="mt-6 text-lg font-bold">Assignments in this cohort</h3>
      {assignmentsError !== null ? <div className="mt-3"><ApiErrorNotice error={assignmentsError} /><button className="ui-action-secondary mt-2" onClick={() => setReloadAssignments((n) => n + 1)} type="button">Retry</button></div>
       : !assignments ? <p className="mt-3" role="status">Loading assignments…</p>
       : assignments.length === 0 ? <p className="mt-3 text-sm text-slate-400">No modules are assigned to this cohort yet.</p>
       : <ul className="mt-3 grid gap-2">{assignments.map((assignment) => <li className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-sm" key={assignment.assignmentId}><span>{assignment.moduleName}{assignment.contentVersion !== null ? ` v${assignment.contentVersion}` : " (latest)"}</span>{canManageAssignments && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={removingAssignmentId === assignment.assignmentId} onClick={() => void removeAssignment(assignment)} type="button">{removingAssignmentId === assignment.assignmentId ? "Removing…" : "Remove"}</button>}</li>)}</ul>}
      {canManageAssignments && <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(event) => void submitAssignment(event)}><label className="grid gap-2 text-sm font-semibold sm:col-span-2">Assign a module to this cohort<select className="integration-input" disabled={assigning} onChange={(event) => setAssignModuleId(event.target.value)} value={assignModuleId}><option value="">Choose a module…</option>{modules.filter((m) => !m.archived && m.latestVersion !== null).map((m) => <option key={m.moduleId} value={m.moduleId}>{m.moduleName}</option>)}</select></label><button className="ui-action" disabled={!assignModuleId || assigning} type="submit">{assigning ? "Assigning…" : "Assign"}</button></form>}
      {assignError !== null && <div className="mt-3"><ApiErrorNotice error={assignError} /></div>}
    </article>{(session.permissions.includes("staff.create_trainer") || session.permissions.includes("staff.create_admin")) && <article className="ui-panel p-5"><h2 className="text-xl font-bold">Staff accounts</h2><Link className="ui-action-secondary mt-5" to="/staff/accounts">View staff-account scope</Link>{session.permissions.includes("settings.manage") && <Link className="ui-action-secondary mt-4" to="/staff/system">View system-control scope</Link>}</article>}</div></>}
    {archiveLearnerError !== null && <div className="mt-4"><ApiErrorNotice error={archiveLearnerError} /></div>}
    {archiveTarget && <ConfirmationDialog confirmLabel="Archive Student" detail={`Archiving ${learnerName(archiveTarget)} removes their device access and hides them from active lists. Review whether the Student has unsynced work before continuing — this does not delete their history.`} onCancel={() => setArchiveTarget(null)} onConfirm={() => void confirmArchiveLearner()} returnFocusTo={archiveTriggerRef.current} title={`Archive ${learnerName(archiveTarget)}?`} />}
    {cohortArchiveTarget && <ConfirmationDialog confirmLabel="Archive cohort" detail={`Archiving ${cohortArchiveTarget.name} hides it from new assignments and student creation. Existing Students and their history are kept.`} onCancel={() => setCohortArchiveTarget(null)} onConfirm={() => void confirmArchiveCohort()} returnFocusTo={cohortArchiveTriggerRef.current} title={`Archive ${cohortArchiveTarget.name}?`} />}
    {moduleArchiveTarget && <ConfirmationDialog confirmLabel="Archive module" detail={`Archiving ${moduleArchiveTarget.moduleName} blocks new assignments, even if it's currently in use. Its published history and any existing assignments are kept.`} onCancel={() => setModuleArchiveTarget(null)} onConfirm={() => void confirmArchiveModule()} returnFocusTo={moduleArchiveTriggerRef.current} title={`Archive ${moduleArchiveTarget.moduleName}?`} />}
    {modulePurgeTarget && <ConfirmationDialog confirmLabel="Permanently delete" detail={`This permanently deletes ${modulePurgeTarget.moduleName} and all its published versions. The server blocks this if any Student has used it or it's currently assigned — archive it instead in that case. This cannot be undone.`} onCancel={() => setModulePurgeTarget(null)} onConfirm={() => void confirmPurgeModule()} returnFocusTo={modulePurgeTriggerRef.current} title={`Permanently delete ${modulePurgeTarget.moduleName}?`} />}
    {blocker.state === "blocked" && (creating ? <div role="alertdialog" aria-modal="true" aria-labelledby="creating-title" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="ui-panel p-6"><h2 id="creating-title" className="text-xl font-bold">Creating student</h2><p className="mt-3">Wait for the result so you can save the setup code or check whether the student was created.</p><button className="ui-action mt-4" type="button" onClick={() => blocker.reset()}>Stay on this screen</button></div></div> : reveal && <ConfirmationDialog title="Leave without the setup code?" detail="This code will no longer be displayed after you leave. Copy it first, or ask an authorized staff member to issue a new code." confirmLabel="Leave screen" onCancel={() => blocker.reset()} onConfirm={() => blocker.proceed()} />)}
  </section>;
}
