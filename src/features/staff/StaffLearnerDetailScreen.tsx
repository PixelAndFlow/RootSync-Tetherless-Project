import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { ConfirmationDialog } from "../../components/common/ConfirmationDialog";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import type { LearnerRecord } from "../../types/staff";

const STATUS: Record<LearnerRecord["status"], string> = { awaiting_setup: "Awaiting setup", active: "Active", phone_switched_off: "Phone switched off", archived: "Archived" };

/** Issue #39's frontend: edit, archive, reissue a setup code, switch off a phone, and purge one learner. */
export function StaffLearnerDetailScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const { learnerId } = useParams();

  const [learner, setLearner] = useState<LearnerRecord | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);

  const [fields, setFields] = useState({ firstName: "", lastName: "", phone: "", email: "", trainingLevel: "", note1: "", note2: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [savedMessage, setSavedMessage] = useState("");

  const [switchOffExisting, setSwitchOffExisting] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<unknown>(null);
  const [reveal, setReveal] = useState<{ setupCode: string; phonesSwitchedOff: number } | null>(null);

  const [switchingOffDeviceId, setSwitchingOffDeviceId] = useState<string | null>(null);
  const [switchOffError, setSwitchOffError] = useState<unknown>(null);

  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<unknown>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const archiveTriggerRef = useRef<HTMLElement | null>(null);

  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<unknown>(null);
  const [purged, setPurged] = useState(false);

  useEffect(() => {
    if (!gateway || !session || !learnerId) return;
    let cancelled = false;
    setLearner(null); setLoadError(null);
    void gateway.getLearnerRecord(learnerId).then((record) => {
      if (cancelled) return;
      setLearner(record);
      setFields({ firstName: record.firstName, lastName: record.lastName, phone: record.phone ?? "", email: record.email ?? "", trainingLevel: record.trainingLevel ?? "", note1: record.note1 ?? "", note2: record.note2 ?? "" });
    }).catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [gateway, session, learnerId, reload]);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (!learnerId) return <Navigate replace to="/staff/operations" />;
  if (purged) return <section><ReturnLink to="/staff/operations">Program operations</ReturnLink><h1 className="mt-4 text-2xl font-bold">Student deleted</h1><p className="mt-3 text-slate-300">This student and their data have been permanently deleted.</p></section>;

  const canEdit = session.permissions.includes("learner.edit");
  const canArchive = session.permissions.includes("learner.archive");
  const canIssueCode = session.permissions.includes("learner.setup_code");
  const canRevokeDevice = session.permissions.includes("device.revoke");
  const canPurge = session.permissions.includes("data.purge");

  const submitFields = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !canEdit || saving) return;
    setSaving(true); setSaveError(null); setSavedMessage("");
    try {
      const updated = await gateway.updateLearner(learnerId, {
        firstName: fields.firstName, lastName: fields.lastName,
        phone: fields.phone.trim() === "" ? null : fields.phone, email: fields.email.trim() === "" ? null : fields.email,
        trainingLevel: fields.trainingLevel.trim() === "" ? null : fields.trainingLevel,
        note1: fields.note1.trim() === "" ? null : fields.note1, note2: fields.note2.trim() === "" ? null : fields.note2,
      });
      setLearner(updated);
      setSavedMessage("Saved.");
    } catch (err) { setSaveError(err); } finally { setSaving(false); }
  };

  const submitIssueCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !canIssueCode || issuing) return;
    setIssuing(true); setIssueError(null); setReveal(null);
    try { setReveal(await gateway.issueSetupCode(learnerId, switchOffExisting && canRevokeDevice)); setReload((n) => n + 1); }
    catch (err) { setIssueError(err); } finally { setIssuing(false); }
  };

  const switchOffDevice = async (deviceId: string) => {
    if (!gateway || !canRevokeDevice || switchingOffDeviceId) return;
    setSwitchingOffDeviceId(deviceId); setSwitchOffError(null);
    try { await gateway.switchOffPhone(learnerId, deviceId); setReload((n) => n + 1); }
    catch (err) { setSwitchOffError(err); } finally { setSwitchingOffDeviceId(null); }
  };

  const confirmArchive = async () => {
    if (!gateway) return;
    setShowArchiveConfirm(false);
    setArchiving(true); setArchiveError(null);
    try { await gateway.archiveLearner(learnerId); setReload((n) => n + 1); }
    catch (err) { setArchiveError(err); } finally { setArchiving(false); }
  };

  const submitPurge = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !learner || purging || purgeConfirmInput !== learner.learnerCode) return;
    setPurging(true); setPurgeError(null);
    try { await gateway.purgeLearner(learnerId, purgeConfirmInput); setPurged(true); }
    catch (err) { setPurgeError(err); } finally { setPurging(false); }
  };

  return <section className="mx-auto max-w-4xl"><ReturnLink to="/staff/operations">Program operations</ReturnLink>
    <p className="ui-eyebrow mt-5">MANAGE STUDENT</p>

    {loadError !== null ? <div className="mt-4"><ApiErrorNotice error={loadError} /><button className="ui-action-secondary mt-3" onClick={() => setReload((n) => n + 1)} type="button">Retry</button></div>
     : !learner ? <p className="mt-6" role="status">Loading student…</p>
     : <>
      <h1 className="mt-3 text-3xl font-bold">{learner.firstName} {learner.lastName}</h1>
      <p className="mt-2 text-slate-300">Student code: {learner.learnerCode} · {learner.cohortName ?? learner.cohortId} · {STATUS[learner.status]}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="ui-panel p-5"><h2 className="text-xl font-bold">Details</h2>
          {!canEdit && <p className="mt-2 text-sm text-slate-400">You don't have permission to edit this student. Ask an Admin or SuperAdmin.</p>}
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submitFields(event)}>
            <label className="grid gap-2 text-sm font-semibold">First name<input className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, firstName: event.target.value }))} value={fields.firstName} /></label>
            <label className="grid gap-2 text-sm font-semibold">Last name<input className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, lastName: event.target.value }))} value={fields.lastName} /></label>
            <label className="grid gap-2 text-sm font-semibold">Phone<input className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, phone: event.target.value }))} value={fields.phone} /></label>
            <label className="grid gap-2 text-sm font-semibold">Email<input className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, email: event.target.value }))} type="email" value={fields.email} /></label>
            <label className="grid gap-2 text-sm font-semibold">Training level<input className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, trainingLevel: event.target.value }))} value={fields.trainingLevel} /></label>
            <label className="grid gap-2 text-sm font-semibold">Note 1<textarea className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, note1: event.target.value }))} value={fields.note1} /></label>
            <label className="grid gap-2 text-sm font-semibold">Note 2<textarea className="integration-input" disabled={!canEdit || saving} onChange={(event) => setFields((f) => ({ ...f, note2: event.target.value }))} value={fields.note2} /></label>
            {canEdit && <button className="ui-action" disabled={saving} type="submit">{saving ? "Saving…" : "Save changes"}</button>}
          </form>
          {saveError !== null && <div className="mt-4"><ApiErrorNotice error={saveError} /></div>}
          {savedMessage && <p className="mt-3 text-sm" role="status">{savedMessage}</p>}
        </article>

        <article className="ui-panel p-5"><h2 className="text-xl font-bold">Devices and setup code</h2>
          {(learner.devices ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-400">No device has set up yet.</p> : <ul className="mt-3 grid gap-2">{(learner.devices ?? []).map((device) => <li className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-sm" key={device.deviceId}><span>{device.switchedOffAt ? "Switched off" : "Active"} · set up {new Date(device.setUpAt).toLocaleDateString()}</span>{canRevokeDevice && !device.switchedOffAt && <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={switchingOffDeviceId === device.deviceId} onClick={() => void switchOffDevice(device.deviceId)} type="button">{switchingOffDeviceId === device.deviceId ? "Switching off…" : "Switch off"}</button>}</li>)}</ul>}
          {switchOffError !== null && <div className="mt-3"><ApiErrorNotice error={switchOffError} /></div>}

          {canIssueCode && learner.status !== "archived" && <form className="mt-5 grid gap-3 border-t border-white/10 pt-5" onSubmit={(event) => void submitIssueCode(event)}>
            <p className="font-semibold">Issue a new setup code</p>
            {canRevokeDevice && <label className="flex items-center gap-2 text-sm"><input checked={switchOffExisting} onChange={(event) => setSwitchOffExisting(event.target.checked)} type="checkbox" />Switch off this student's existing phones first</label>}
            <button className="ui-action" disabled={issuing} type="submit">{issuing ? "Issuing…" : "Issue setup code"}</button>
          </form>}
          {issueError !== null && <div className="mt-4"><ApiErrorNotice error={issueError} /></div>}
          {reveal && <div className="mt-4 rounded-xl border border-dashed border-violet-300/40 p-4"><p className="font-bold">One-time setup code</p><p className="mt-2 text-sm">Copy this code now. It cannot be shown again after you dismiss it.</p><code className="mt-2 block select-all break-all text-lg">{reveal.setupCode}</code>{reveal.phonesSwitchedOff > 0 && <p className="mt-2 text-sm text-slate-300">{reveal.phonesSwitchedOff} existing phone{reveal.phonesSwitchedOff === 1 ? "" : "s"} switched off.</p>}<button className="ui-action-secondary mt-3" onClick={() => setReveal(null)} type="button">Done</button></div>}
        </article>
      </div>

      {(canArchive || canPurge) && <article className="ui-panel mt-6 p-5"><h2 className="text-xl font-bold">Archive and delete</h2>
        {canArchive && <div className="mt-4"><p className="text-sm text-slate-300">Archiving removes this student's device access and hides them from active lists. Their history is kept.</p>
          <button className="ui-action-secondary mt-3" disabled={learner.status === "archived" || archiving} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setShowArchiveConfirm(true); }} type="button">{learner.status === "archived" ? "Archived" : archiving ? "Archiving…" : "Archive student"}</button>
          {archiveError !== null && <div className="mt-3"><ApiErrorNotice error={archiveError} /></div>}
        </div>}
        {canPurge && <form className="mt-6 grid gap-3 border-t border-white/10 pt-5" onSubmit={(event) => void submitPurge(event)}>
          <p className="font-bold text-rose-300">Permanently delete this student</p>
          <p className="text-sm text-slate-300">This permanently deletes {learner.firstName} {learner.lastName} and all their data. This cannot be undone. Type the student code <strong>{learner.learnerCode}</strong> to confirm.</p>
          <input autoComplete="off" className="integration-input" onChange={(event) => setPurgeConfirmInput(event.target.value)} placeholder={learner.learnerCode} value={purgeConfirmInput} />
          <button className="ui-action" disabled={purgeConfirmInput !== learner.learnerCode || purging} type="submit">{purging ? "Deleting…" : "Permanently delete"}</button>
          {purgeError !== null && <div className="mt-3"><ApiErrorNotice error={purgeError} /></div>}
        </form>}
      </article>}

      <p className="mt-6"><Link className="text-sm font-bold app-wordmark" to="/staff/operations">← Program operations</Link></p>
    </>}

    {showArchiveConfirm && learner && <ConfirmationDialog confirmLabel="Archive student" detail={`Archiving ${learner.firstName} ${learner.lastName} removes their device access and hides them from active lists. This does not delete their history.`} onCancel={() => setShowArchiveConfirm(false)} onConfirm={() => void confirmArchive()} returnFocusTo={archiveTriggerRef.current} title={`Archive ${learner.firstName} ${learner.lastName}?`} />}
  </section>;
}
