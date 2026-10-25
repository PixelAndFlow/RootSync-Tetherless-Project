import { Navigate, useSearchParams } from "react-router-dom";
import { ReturnLink } from "../../components/common/ReturnLink";
import { useStaffSession } from "../../app/providers/StaffSessionProvider";
import { mockScenarioCopy } from "../../services/mockScenarios";

export function StaffContentWorkflowScreen() {
  const { session } = useStaffSession();
  const [params] = useSearchParams();
  if (!session) return <Navigate replace to="/staff/sign-in" />;
  const invalid = params.get("scenario") === "upload-invalid";
  const moduleId = params.get("module");
  return <section className="mx-auto max-w-4xl"><ReturnLink to="/staff/operations">Program operations</ReturnLink><p className="ui-eyebrow mt-5">CONTENT WORKFLOW · MOCK PREVIEW</p><h1 className="mt-3 text-3xl font-bold">{moduleId ? "Review module changes" : "Upload a learning module"}</h1><p className="mt-3 max-w-2xl text-slate-300">This frontend preview reserves the agreed JSON/CSV selection, validation, preview, publish, and assignment steps. It does not upload or publish content.</p>
    <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Content publishing steps">{["Select file", "Validate", "Preview", "Publish", "Assign"].map((step, index) => <li className="ui-panel p-4" key={step}><span className="text-sm font-bold app-wordmark">{index + 1}</span><p className="mt-2 font-semibold">{step}</p></li>)}</ol>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><article className="ui-panel p-5"><h2 className="text-xl font-bold">Module input</h2><label className="mt-5 grid gap-2 text-sm font-semibold">JSON or CSV file<input className="integration-input" disabled type="file" /></label><p className="mt-3 text-sm text-slate-400">The production screen will call Marc’s shared validator before publishing. Files and RCO-owned content are not placed in browser storage.</p><button className="ui-action mt-5" disabled type="button">Validate module (API pending)</button></article><article className="ui-panel p-5"><h2 className="text-xl font-bold">Validation result</h2>{invalid ? <div className="mt-4 rounded-xl border border-violet-300/30 p-4" role="alert"><p className="font-bold">{mockScenarioCopy.upload_invalid.title}</p><ul className="mt-3 list-inside list-disc text-sm leading-6"><li>Question 4 is missing a valid correct choice ID.</li><li>Content version must be a positive number.</li></ul></div> : <div className="mt-4 rounded-xl border border-white/10 p-4"><p className="font-bold">Awaiting a file</p><p className="mt-2 text-sm text-slate-300">Validation details will appear here before preview or publication is available.</p></div>}<button className="ui-action-secondary mt-5" disabled type="button">Preview module (API pending)</button></article></div>
    <div className="mt-6 ui-panel p-5"><h2 className="text-xl font-bold">Publish and assign</h2><p className="mt-2 text-slate-300">Publishing needs a valid module, staff authorization, and a server response. Assignment will select an authorized cohort after publication.</p><div className="mt-5 flex flex-wrap gap-3"><button className="ui-action" disabled type="button">Publish module (API pending)</button><button className="ui-action-secondary" disabled type="button">Assign to cohort (API pending)</button></div></div>
  </section>;
}
