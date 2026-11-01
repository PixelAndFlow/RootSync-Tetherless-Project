import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AccessDenied } from "../../components/common/AccessDenied";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { ConfirmationDialog } from "../../components/common/ConfirmationDialog";
import { ReturnLink } from "../../components/common/ReturnLink";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import type { StaffAdminGateway } from "../../services/staff/StaffAdminGateway";
import { STAFF_PERMISSIONS, STAFF_ROLES, roleLabel, type StaffPermissionKey, type StaffRole, type Thresholds } from "../../types/staff";

export function StaffPermissionScreen({ permission }: { permission: "staff" | "system" }) {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const location = useLocation();
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const allowed = permission === "staff"
    ? session.permissions.includes("staff.create_trainer") || session.permissions.includes("staff.create_admin")
    : session.permissions.includes("settings.manage") || session.permissions.includes("permissions.manage");
  if (!allowed) return <AccessDenied />;
  if (permission === "staff") {
    return <section className="mx-auto max-w-3xl ui-panel p-6 sm:p-10"><ReturnLink to="/staff">Staff dashboard</ReturnLink><p className="ui-eyebrow">STAFF ACCOUNTS · API PENDING</p><h1 className="mt-3 text-3xl font-bold">Staff account management</h1><p className="mt-3 leading-7 text-slate-300">This protected route confirms the planned role boundary. Its server-backed actions will be connected only after staff authentication and authorization are finalized.</p><p className="mt-5 text-sm text-slate-400">Requested route: {location.pathname}</p></section>;
  }
  return <SystemControlCenter canManagePermissions={session.permissions.includes("permissions.manage")} canManageThresholds={session.permissions.includes("settings.manage")} gateway={gateway} />;
}

function SystemControlCenter({ gateway, canManagePermissions, canManageThresholds }: { gateway: StaffAdminGateway | undefined; canManagePermissions: boolean; canManageThresholds: boolean }) {
  return <section><ReturnLink to="/staff">Staff dashboard</ReturnLink><p className="ui-eyebrow">SYSTEM CONTROLS</p><h1 className="mt-3 text-3xl font-bold">System control center</h1>
    <div className="mt-8 grid gap-6">
      {canManagePermissions && <RolePermissionsPanel gateway={gateway} />}
      {canManageThresholds && <ThresholdsPanel gateway={gateway} />}
    </div>
  </section>;
}

function RolePermissionsPanel({ gateway }: { gateway: StaffAdminGateway | undefined }) {
  const [saved, setSaved] = useState<Record<StaffRole, StaffPermissionKey[]> | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [edited, setEdited] = useState<Record<StaffRole, Set<StaffPermissionKey>> | null>(null);
  const [savingRole, setSavingRole] = useState<StaffRole | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [confirmRole, setConfirmRole] = useState<StaffRole | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!gateway) return;
    let cancelled = false;
    setSaved(null); setEdited(null); setLoadError(null);
    void gateway.getRolePermissions().then(({ roles }) => {
      if (cancelled) return;
      setSaved(roles);
      setEdited({ superadmin: new Set(roles.superadmin), admin: new Set(roles.admin), trainer: new Set(roles.trainer) });
    }).catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [gateway, reload]);

  const toggle = (role: StaffRole, key: StaffPermissionKey) => {
    if (role === "superadmin" && key === "permissions.manage") return; // the superadmin role must keep this (server-enforced)
    setEdited((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [role]: new Set(previous[role]) };
      if (next[role].has(key)) next[role].delete(key); else next[role].add(key);
      return next;
    });
  };
  const isDirty = (role: StaffRole) => {
    if (!saved || !edited) return false;
    const a = saved[role], b = [...edited[role]];
    return a.length !== b.length || !a.every((key) => edited[role].has(key));
  };
  const confirmSave = async () => {
    if (!gateway || !confirmRole || !edited) return;
    const role = confirmRole;
    setConfirmRole(null);
    setSavingRole(role); setSaveError(null);
    try { await gateway.setRolePermissions(role, [...edited[role]]); setReload((n) => n + 1); }
    catch (err) { setSaveError(err); } finally { setSavingRole(null); }
  };

  return <article className="ui-panel p-5"><h2 className="text-xl font-bold">Role permissions</h2><p className="mt-2 text-sm text-slate-300">Changes take effect immediately for anyone signed in with that role.</p>
    {loadError !== null ? <div className="mt-4"><ApiErrorNotice error={loadError} /><button className="ui-action-secondary mt-3" onClick={() => setReload((n) => n + 1)} type="button">Retry</button></div>
     : !edited ? <p className="mt-4" role="status">Loading role permissions…</p>
     : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-2">Permission</th>{STAFF_ROLES.map((role) => <th className="p-2" key={role}>{roleLabel(role)}</th>)}</tr></thead><tbody>{STAFF_PERMISSIONS.map((key) => <tr className="border-b border-white/10" key={key}><td className="p-2 font-mono text-xs">{key}</td>{STAFF_ROLES.map((role) => <td className="p-2" key={role}><input aria-label={`${roleLabel(role)}: ${key}`} checked={edited[role].has(key)} disabled={role === "superadmin" && key === "permissions.manage"} onChange={() => toggle(role, key)} type="checkbox" /></td>)}</tr>)}</tbody></table>
       <div className="mt-4 flex flex-wrap gap-2">{STAFF_ROLES.map((role) => <button className="ui-action-secondary min-h-9 px-3 py-1 text-xs" disabled={!isDirty(role) || savingRole === role} key={role} onClick={() => setConfirmRole(role)} type="button">{savingRole === role ? `Saving ${roleLabel(role)}…` : `Save ${roleLabel(role)} permissions`}</button>)}</div>
     </div>}
    {saveError !== null && <div className="mt-4"><ApiErrorNotice error={saveError} /></div>}
    {confirmRole && edited && <ConfirmationDialog confirmLabel="Save permissions" detail={`This changes what every ${roleLabel(confirmRole)} account can do, effective immediately.`} onCancel={() => setConfirmRole(null)} onConfirm={() => void confirmSave()} title={`Save ${roleLabel(confirmRole)} permissions?`} />}
  </article>;
}

function ThresholdsPanel({ gateway }: { gateway: StaffAdminGateway | undefined }) {
  const [saved, setSaved] = useState<Thresholds | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!gateway) return;
    let cancelled = false;
    setSaved(null); setForm(null); setLoadError(null);
    void gateway.getThresholds().then((t) => { if (!cancelled) { setSaved(t); setForm(t); } }).catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [gateway, reload]);

  const dirty = !!saved && !!form && (saved.passPct !== form.passPct || saved.strugglingPct !== form.strugglingPct || saved.weakTopicPct !== form.weakTopicPct || saved.weakTopicMinAnswers !== form.weakTopicMinAnswers);
  const confirmSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || !form || !dirty) return;
    setConfirming(true);
  };
  const reallySave = async () => {
    if (!gateway || !form) return;
    setConfirming(false);
    setSaving(true); setSaveError(null);
    try { const next = await gateway.setThresholds(form); setSaved(next); setForm(next); }
    catch (err) { setSaveError(err); } finally { setSaving(false); }
  };

  return <article className="ui-panel p-5"><h2 className="text-xl font-bold">Score thresholds</h2><p className="mt-2 text-sm text-slate-300">Scores are always recalculated from raw answers, never stored — changing a threshold immediately reclassifies every learner's pass/struggling status, past and future, not just going forward.</p>
    {loadError !== null ? <div className="mt-4"><ApiErrorNotice error={loadError} /><button className="ui-action-secondary mt-3" onClick={() => setReload((n) => n + 1)} type="button">Retry</button></div>
     : !form ? <p className="mt-4" role="status">Loading thresholds…</p>
     : <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void confirmSave(event)}>
         <label className="grid gap-2 text-sm font-semibold">Passing score (%)<input className="integration-input" max={100} min={0} onChange={(event) => setForm({ ...form, passPct: Number(event.target.value) })} type="number" value={form.passPct} /></label>
         <label className="grid gap-2 text-sm font-semibold">Struggling below (%)<input className="integration-input" max={100} min={0} onChange={(event) => setForm({ ...form, strugglingPct: Number(event.target.value) })} type="number" value={form.strugglingPct} /></label>
         <label className="grid gap-2 text-sm font-semibold">Weak topic below (%)<input className="integration-input" max={100} min={0} onChange={(event) => setForm({ ...form, weakTopicPct: Number(event.target.value) })} type="number" value={form.weakTopicPct} /></label>
         <label className="grid gap-2 text-sm font-semibold">Weak topic minimum answers<input className="integration-input" min={1} onChange={(event) => setForm({ ...form, weakTopicMinAnswers: Number(event.target.value) })} type="number" value={form.weakTopicMinAnswers} /></label>
         <button className="ui-action sm:col-span-2" disabled={!dirty || saving} type="submit">{saving ? "Saving…" : "Save thresholds"}</button>
       </form>}
    {saveError !== null && <div className="mt-4"><ApiErrorNotice error={saveError} /></div>}
    {confirming && <ConfirmationDialog confirmLabel="Confirm new thresholds" detail="This immediately changes how every learner's results are classified, including results already on record. It does not change any raw answer data." onCancel={() => setConfirming(false)} onConfirm={() => void reallySave()} title="Save new thresholds?" />}
  </article>;
}
