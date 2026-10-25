import { Link } from "react-router-dom";

export function AccessDenied({ actionTo = "/staff", actionLabel = "Return to staff home" }: { actionTo?: string; actionLabel?: string }) {
  return <section className="mx-auto max-w-2xl ui-panel p-8"><p className="ui-eyebrow">ACCESS LIMITED</p><h1 className="mt-3 text-2xl font-bold">This staff role does not have access to this tool.</h1><p className="mt-3 leading-7 text-slate-300">Your available actions are based on your role and assigned cohorts. If this seems unexpected, contact a SuperAdmin.</p><Link className="ui-action mt-6" to={actionTo}>{actionLabel}</Link></section>;
}
