import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ConfirmationDialog } from "../../components/common/ConfirmationDialog";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import type { Cohort, LearnerRecord, ModuleListing, SetupCodeReveal } from "../../types/staff";

const learnerName = (learner: LearnerRecord) => `${learner.first_name} ${learner.last_name}`;
const LEARNER_STATUS_LABEL: Record<LearnerRecord["status"], string> = {
  awaiting_setup: "Awaiting setup",
  active: "Active",
  phone_switched_off: "Phone switched off",
  archived: "Archived",
};

export function StaffOperationsScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [students, setStudents] = useState<LearnerRecord[]>([]);
  const [modules, setModules] = useState<ModuleListing[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [reveal, setReveal] = useState<SetupCodeReveal | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<LearnerRecord | null>(null);
  const archiveTriggerRef = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { if (gateway && session) void Promise.all([gateway.listCohorts(), gateway.listLearnerRecords({}), gateway.listModules()]).then(([nextCohorts, nextStudents, nextModules]) => { setCohorts(nextCohorts); setStudents(nextStudents); setModules(nextModules); setCohortId(nextCohorts[0]?.cohort_id ?? ""); }).catch(() => {}); }, [gateway, session]);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (integration) return <section className="mx-auto max-w-3xl ui-panel p-6 sm:p-10"><ReturnLink to="/staff">Staff dashboard</ReturnLink><p className="ui-eyebrow mt-5">LIVE STAFF SESSION</p><h1 className="mt-3 text-3xl font-bold">Operations are not connected yet</h1><p className="mt-3 leading-7 text-slate-300">The live integration supports staff sign-in, password changes and staff account management. Cohorts, Students, content, assignments and reports remain disabled until their API contracts and authorization scope are reviewed.</p></section>;
  const selectedCohort = cohorts.find((cohort) => cohort.cohort_id === cohortId);
  const visibleStudents = useMemo(() => students.filter((student) => !cohortId || student.cohort_id === cohortId), [students, cohortId]);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!gateway) return; const next = await gateway.createLearner({ cohortId, firstName, lastName }); setReveal(next); setFirstName(""); setLastName(""); setMessage("Demo setup code revealed. Copy, print, or download the handout before leaving this screen in the production flow."); };
  const copyCode = async () => { if (!reveal) return; try { await navigator.clipboard.writeText(reveal.setupCode); setMessage("Setup code copied. Production codes are shown once only."); } catch { setMessage("Copy is unavailable. Select and copy the setup code manually."); } };
  const completeArchiveConfirmation = () => { setArchiveTarget(null); setMessage("Archive confirmation reviewed in demo mode. No Student data or device access changed because the staff API is not connected."); };

  return <section><ReturnLink to="/staff">Staff dashboard</ReturnLink><h1 className="mt-4 text-3xl font-bold">Program operations</h1><p className="mt-2 text-slate-300">Mock-backed layout for cohorts, Students, setup codes, content and assignments. Server mutations are intentionally disabled.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><article className="ui-panel p-5"><h2 className="text-xl font-bold">Students and setup codes</h2><label className="mt-5 grid gap-2 text-sm font-semibold">Cohort<select className="integration-input" onChange={(event) => setCohortId(event.target.value)} value={cohortId}>{cohorts.map((cohort) => <option key={cohort.cohort_id} value={cohort.cohort_id}>{cohort.name} ({cohort.learner_count ?? 0})</option>)}</select></label><div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-3">Student</th><th className="p-3">Username</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleStudents.map((student) => <tr className="border-b border-white/10" key={student.learner_id}><td className="p-3 font-semibold">{learnerName(student)}</td><td className="p-3">{student.username ?? "—"}</td><td className="p-3">{LEARNER_STATUS_LABEL[student.status]}</td><td className="p-3 text-right"><button aria-label={`Archive ${learnerName(student)}`} className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={student.status === "archived"} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveTarget(student); }} type="button">{student.status === "archived" ? "Archived" : "Archive Student"}</button></td></tr>)}{visibleStudents.length === 0 && <tr><td className="p-4 text-slate-400" colSpan={4}>No mock Students in this cohort.</td></tr>}</tbody></table></div><p className="mt-4 text-xs text-slate-400">Archive is restricted to the staff member’s assigned cohort. It requires confirmation and server authorization in production.</p></article>
      <article className="ui-panel p-5"><h2 className="text-xl font-bold">Add Student</h2><p className="mt-2 text-sm text-slate-300">The production API will issue a one-time setup code after a Student is created.</p><form className="mt-5 grid gap-3" onSubmit={(event) => void submit(event)}><label className="grid gap-2 text-sm font-semibold">First name<input className="integration-input" onChange={(event) => setFirstName(event.target.value)} value={firstName} /></label><label className="grid gap-2 text-sm font-semibold">Last name<input className="integration-input" onChange={(event) => setLastName(event.target.value)} value={lastName} /></label><button className="ui-action" disabled={!selectedCohort || !firstName.trim() || !lastName.trim()} type="submit">Create Student and reveal code</button></form>{reveal && <div className="mt-5 rounded-xl border border-dashed border-violet-300/40 p-4"><p className="font-bold">One-time setup code</p><code className="mt-2 block select-all break-all text-lg">{reveal.setupCode}</code><div className="mt-3 flex flex-wrap gap-2"><button className="ui-action-secondary" onClick={() => void copyCode()} type="button">Copy code</button><button className="ui-action-secondary" disabled type="button">Print handout (API pending)</button><button className="ui-action-secondary" disabled type="button">Download handout (API pending)</button></div></div>}{message && <p className="mt-3 text-sm" role="status">{message}</p>}</article></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><article className="ui-panel p-5" id="content"><h2 className="text-xl font-bold">Content and assignments</h2><ul className="mt-4 grid gap-3">{modules.map((module) => <li className="rounded-xl border border-white/10 p-4" key={module.module_id}><strong>{module.module_name}</strong><p className="mt-1 text-sm text-slate-300">Version {module.latest_version ?? "—"} · {module.archived ? "Archived" : "Published"}</p><Link className="ui-action-secondary mt-3 min-h-9 px-3 py-1 text-xs" to={`/staff/content?module=${encodeURIComponent(module.module_id)}`}>Preview edit workflow</Link></li>)}</ul><Link className="ui-action-secondary mt-4" to="/staff/content">Preview upload workflow</Link><p className="mt-4 text-sm text-slate-400">Trainers can upload and edit permitted modules. Validation, publishing and assignment will use Marc’s shared module validator and API adapter.</p></article>{session.role !== "trainer" && <article className="ui-panel p-5" id="staff"><h2 className="text-xl font-bold">Staff accounts</h2><p className="mt-3 text-sm text-slate-300">Account creation and role management layout is reserved for the approved StaffAdminGateway.</p><Link className="ui-action-secondary mt-5" to="/staff/accounts">View staff-account scope</Link>{session.role === "superadmin" && <><h3 className="mt-6 font-bold" id="system">System controls</h3><p className="mt-2 text-sm text-slate-300">Roles, thresholds, archive and purge actions require protected server-side confirmation.</p><Link className="ui-action-secondary mt-4" to="/staff/system">View system-control scope</Link></>}</article>}</div>
    {archiveTarget && <ConfirmationDialog confirmLabel="Confirm demo archive" detail={`Archiving ${learnerName(archiveTarget)} should remove Student access only after the server confirms it. Review whether the Student has unsynced work before continuing.`} onCancel={() => setArchiveTarget(null)} onConfirm={completeArchiveConfirmation} returnFocusTo={archiveTriggerRef.current} title={`Archive ${learnerName(archiveTarget)}?`} />}
  </section>;
}
