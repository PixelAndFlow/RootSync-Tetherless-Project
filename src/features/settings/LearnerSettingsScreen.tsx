import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";
import { DisplayPreferences } from "../../components/learner/DisplayPreferences";

export function LearnerSettingsScreen() {
  const { profile, setHighContrast, setReducedMotion, setColorTheme } = useLearnerProfile();
  const [copyStatus, setCopyStatus] = useState("");
  if (!profile) return <Navigate replace to="/learner" />;
  const copy = async () => {
    try {
      if (!profile.learnerCode || !navigator.clipboard) throw new Error("Unavailable");
      await navigator.clipboard.writeText(profile.learnerCode);
      setCopyStatus("Student code copied.");
    } catch { setCopyStatus("Copy is unavailable. Select the Student code shown here and copy it manually."); }
  };
  return <section className="mx-auto max-w-3xl ui-panel p-6 sm:p-10">
    <p className="ui-eyebrow">DEMO PROFILE</p><h1 className="mt-3 text-3xl font-bold">Profile and settings</h1>
    <p className="mt-3 text-slate-300">This is a local demo profile, not a registered server account. No setup code or device token is stored here.</p>
    <dl className="mt-6 grid gap-5">
      <div><dt className="font-bold">Username</dt><dd className="mt-1 break-all">{profile.username}</dd></div>
      <div><dt className="font-bold">Student code</dt><dd className="mt-1 select-all break-all">{profile.learnerCode ?? "Not available for this older demo profile"}</dd></div>
      <div><dt className="font-bold">Cohort</dt><dd className="mt-1">{profile.cohortName ?? "Not assigned in this demo"}</dd></div>
    </dl>
    {profile.learnerCode && <button className="ui-action-secondary mt-4" onClick={() => void copy()} type="button">Copy Student code</button>}
    <p role="status" className="mt-3 text-sm">{copyStatus}</p>
    <div className="mt-6"><DisplayPreferences highContrast={profile.highContrast} reducedMotion={profile.reducedMotion} colorTheme={profile.colorTheme} onHighContrastChange={setHighContrast} onReducedMotionChange={setReducedMotion} onColorThemeChange={setColorTheme} /></div>
    <Link className="ui-action mt-6" to="/learner/missions">Return to missions</Link>
  </section>;
}
