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
  const [error, setError] = useState<unknown>(null);
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  if (!session.passwordChangeRequired) return <Navigate replace to="/staff" />;
  const mismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;
  const submit = async (event: FormEvent) => { event.preventDefault(); if (newPassword !== confirmNewPassword) return; setError(null); try { await changePassword({ currentPassword, newPassword }); navigate("/staff"); } catch (reason) { setError(reason); } };
  return <section className="mx-auto max-w-md ui-panel p-6 sm:p-10"><p className="ui-eyebrow">PASSWORD UPDATE REQUIRED</p><h1 className="mt-3 text-3xl font-bold">Choose a new staff password</h1><p className="mt-3 text-slate-300">The server requires a password change before this account can access staff tools.</p><form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)}><label className="grid gap-2 font-semibold">Temporary password<input autoComplete="current-password" className="integration-input" type="password" onChange={(event) => setCurrentPassword(event.target.value)} value={currentPassword} /></label><label className="grid gap-2 font-semibold">New password<input autoComplete="new-password" className="integration-input" minLength={12} type="password" onChange={(event) => setNewPassword(event.target.value)} value={newPassword} /></label><label className="grid gap-2 font-semibold">Confirm new password<input autoComplete="new-password" className="integration-input" minLength={12} type="password" onChange={(event) => setConfirmNewPassword(event.target.value)} value={confirmNewPassword} /></label>{mismatch && <p className="text-xs text-rose-300">Passwords do not match.</p>}{error !== null && <ApiErrorNotice error={error} />}<button className="ui-action" disabled={!currentPassword || newPassword.length < 12 || newPassword !== confirmNewPassword} type="submit">Save new password</button></form></section>;
}
