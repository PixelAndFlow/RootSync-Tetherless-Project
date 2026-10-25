import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";

export function StaffPasswordChangeScreen() {
  const { session, changePassword } = useStaffSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (!session.passwordChangeRequired) return <Navigate replace to="/staff" />;
  const mismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmNewPassword) return;
    setBusy(true); setError(null);
    try { await changePassword({ currentPassword, newPassword }); navigate("/staff"); }
    catch (reason) { setError(reason); } finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-md ui-panel p-6 sm:p-10"><p className="ui-eyebrow">PASSWORD UPDATE REQUIRED</p><h1 className="mt-3 text-3xl font-bold">Choose a new staff password</h1><p className="mt-3 text-slate-300">The server requires a password change before this account can access staff tools.</p><form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)}><label className="grid gap-2 font-semibold">Temporary password<input autoComplete="current-password" className="integration-input" disabled={busy} type="password" onChange={(event) => setCurrentPassword(event.target.value)} value={currentPassword} /></label><label className="grid gap-2 font-semibold">New password<input aria-describedby="password-requirements" autoComplete="new-password" className="integration-input" disabled={busy} minLength={12} type="password" onChange={(event) => setNewPassword(event.target.value)} value={newPassword} /></label><p className="text-xs text-slate-400" id="password-requirements">At least 12 characters. Letters, numbers, spaces and symbols are allowed.</p><label className="grid gap-2 font-semibold">Confirm new password<input aria-describedby={mismatch ? "password-mismatch" : undefined} aria-invalid={mismatch} autoComplete="new-password" className="integration-input" disabled={busy} type="password" onChange={(event) => setConfirmNewPassword(event.target.value)} value={confirmNewPassword} /></label>{mismatch && <p className="text-xs text-rose-300" id="password-mismatch" role="alert">Passwords do not match.</p>}{error !== null && <ApiErrorNotice error={error} />}<button className="ui-action" disabled={busy || !currentPassword || newPassword.length < 12 || newPassword !== confirmNewPassword} type="submit">{busy ? "Saving…" : "Save new password"}</button></form></section>;
}
