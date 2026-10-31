import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { ReturnLink } from "../../components/common/ReturnLink";
import { AccessDenied } from "../../components/common/AccessDenied";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { useStaffAdminGateway } from "../../app/providers/GatewayProvider";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";
import { STAFF_USERNAME_PATTERN } from "../../services/staff/username";
import { creatableRoles, roleLabel, type StaffAccountReveal, type StaffAccountSummary, type StaffRole } from "../../types/staff";

export function StaffAccountsScreen() {
  const { session } = useStaffSession();
  const gateway = useStaffAdminGateway();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const roles = session ? creatableRoles(session.permissions) : [];
  const [accounts, setAccounts] = useState<StaffAccountSummary[]>([]);
  const [accountsError, setAccountsError] = useState<unknown>(null);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [role, setRole] = useState<StaffRole>(roles[0] ?? "trainer");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reveal, setReveal] = useState<StaffAccountReveal | null>(null);
  const [message, setMessage] = useState("");

  const refreshAccounts = () => {
    if (!gateway) { setAccountsLoading(false); return; }
    setAccountsLoading(true); setAccountsError(null);
    void gateway.listStaffAccounts().then(setAccounts).catch(setAccountsError).finally(() => setAccountsLoading(false));
  };
  const canViewAccounts = !!session && (session.permissions.includes("staff.create_trainer") || session.permissions.includes("staff.create_admin"));
  useEffect(() => { if (gateway && canViewAccounts) refreshAccounts(); }, [gateway, canViewAccounts]);

  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (!canViewAccounts || roles.length === 0) return <AccessDenied />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!gateway || busy || !roles.includes(role)) return;
    setBusy(true); setError(null);
    try {
      const next = await gateway.createStaffAccount({ role, username, displayName });
      setReveal(next);
      setUsername(""); setDisplayName(""); setRole(roles[0] ?? "trainer");
      setMessage("Temporary password revealed. Copy it now and share it with the new account holder — it is shown once only.");
      refreshAccounts();
    } catch (reason) { setError(reason); } finally { setBusy(false); }
  };
  const copyPassword = async () => {
    if (!reveal) return;
    try { await navigator.clipboard.writeText(reveal.temporaryPassword); setMessage("Temporary password copied. It is shown once only."); }
    catch { setMessage("Copy is unavailable. Select and copy the password manually."); }
  };
  const usernameInvalid = username.length > 0 && !STAFF_USERNAME_PATTERN.test(username.trim().toLowerCase());

  return <section><ReturnLink to="/staff">Staff dashboard</ReturnLink><h1 className="mt-4 text-3xl font-bold">Staff accounts</h1><p className="mt-2 text-slate-300">{roles.includes("superadmin") ? "Create a SuperAdmin, Admin or Trainer account." : "Create a Trainer account."} The new account signs in with a one-time temporary password and must change it on first sign-in.</p><p className="mt-3 text-sm" role="status">{integration ? "Live API mode: creating an account changes the server." : "Demo mode: account changes are mock-only and are not saved to the server."}</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"><article className="ui-panel p-5"><h2 className="text-xl font-bold">Existing accounts</h2>
      {accountsError !== null && <div className="mt-4"><ApiErrorNotice error={accountsError} /></div>}
      {accountsLoading && <p className="mt-4 text-sm" role="status">Loading accounts…</p>}
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-white/10"><th className="p-3">Name</th><th className="p-3">Username</th><th className="p-3">Role</th><th className="p-3">Status</th></tr></thead><tbody>{accounts.map((account) => <tr className="border-b border-white/10" key={account.staffId}><td className="p-3 font-semibold">{account.displayName}</td><td className="p-3">{account.username}</td><td className="p-3">{roleLabel(account.role)}</td><td className="p-3">{account.disabled ? "Disabled" : "Active"}</td></tr>)}{accounts.length === 0 && accountsError === null && !accountsLoading && <tr><td className="p-4 text-slate-400" colSpan={4}>No accounts yet.</td></tr>}</tbody></table></div>
    </article>
    <article className="ui-panel p-5"><h2 className="text-xl font-bold">Create account</h2>
      <form className="mt-5 grid gap-4" onSubmit={(event) => void submit(event)}>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="account-role">Role<select className="integration-input" disabled={busy} id="account-role" onChange={(event) => setRole(event.target.value as StaffRole)} value={role}>{roles.map((candidate) => <option key={candidate} value={candidate}>{roleLabel(candidate)}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="account-username">Username<input className="integration-input" disabled={busy} id="account-username" onChange={(event) => setUsername(event.target.value)} value={username} /></label>
        {usernameInvalid && <p className="text-xs text-rose-300">Use 3–32 lowercase letters, numbers, dots, dashes or underscores.</p>}
        <label className="grid gap-2 text-sm font-semibold" htmlFor="account-display-name">Display name<input className="integration-input" disabled={busy} id="account-display-name" onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label>
        {error !== null && <ApiErrorNotice error={error} />}
        <button className="ui-action mt-2" disabled={busy || !username.trim() || !displayName.trim() || usernameInvalid} type="submit">{busy ? "Creating…" : "Create account and reveal temporary password"}</button>
      </form>
      <p className="mt-4 text-sm leading-6 text-slate-300">{roleLabel(role)} scope: {role === "superadmin" ? "full operations, staff accounts, system controls, cohorts, Students, content, assignments, reports, devices, roles, thresholds, archive and purge controls." : role === "admin" ? "daily operations and Trainer management; no SuperAdmin creation, global permissions, thresholds or purge controls." : "assigned cohorts and Students, setup codes, device support, archive with confirmation, upload/edit permitted modules, assignments, results/export."}</p>
      {reveal && <div className="mt-5 rounded-xl border border-dashed border-violet-300/40 p-4"><p className="font-bold">{reveal.account.displayName} ({roleLabel(reveal.account.role)}) — one-time temporary password</p><code className="mt-2 block select-all break-all text-lg">{reveal.temporaryPassword}</code><p className="mt-2 text-xs text-slate-400">Username: {reveal.account.username}. Must be changed on first sign-in.</p><div className="mt-3 flex flex-wrap gap-2"><button className="ui-action-secondary" onClick={() => void copyPassword()} type="button">Copy password</button></div></div>}
      {message && <p className="mt-4 text-sm" role="status">{message}</p>}
    </article></div>
  </section>;
}
