import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { readFrontendRuntimeConfig } from "../../services/integration/runtimeConfig";

export function StaffSignInScreen() {
  const navigate = useNavigate();
  const integration = readFrontendRuntimeConfig().mode === "integration";
  const { session, signIn } = useStaffSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (session) return <Navigate replace to={session.passwordChangeRequired ? "/staff/change-password" : "/staff"} />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { const next = await signIn({ username, password }); navigate(next.passwordChangeRequired ? "/staff/change-password" : "/staff"); }
    catch (reason) { setError(reason); } finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-md ui-panel p-6 sm:p-10"><p className="ui-eyebrow">STAFF ACCESS</p><h1 className="mt-3 text-3xl font-bold">Sign in to Tetherless</h1><p className="mt-3 text-sm text-slate-300">SuperAdmin, Admin, and Trainer access is separate from Student setup.</p>
    <form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)}><label className="grid gap-2 font-semibold" htmlFor="staff-username">Username<input className="integration-input" disabled={busy} id="staff-username" autoComplete="username" onChange={(event) => setUsername(event.target.value)} value={username} /></label><label className="grid gap-2 font-semibold" htmlFor="staff-password">Password<input className="integration-input" disabled={busy} id="staff-password" type="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} value={password} /></label>{error !== null && <ApiErrorNotice error={error} />}<button className="ui-action mt-2" disabled={busy || !username || !password} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form>
    <p className="mt-6 text-xs text-slate-400">{integration
      ? <>Connected to <strong>{readFrontendRuntimeConfig().apiBaseUrl}</strong>. Sign in with a real staff account created on that server.</>
      : <>Frontend demo accounts: <strong>demo</strong> (SuperAdmin), <strong>admin</strong>, or <strong>trainer</strong>; password: <strong>demo-password-123</strong>. Demo only—never use these credentials in production.</>}</p></section>;
}
