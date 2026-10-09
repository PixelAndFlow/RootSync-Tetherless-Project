import { Link } from "react-router-dom";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div aria-live="polite" className="ui-panel p-8 text-slate-300"><span aria-hidden="true" className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />{label}</div>;
}

export function EmptyState({ title, detail, actionTo, actionLabel }: { title: string; detail: string; actionTo?: string; actionLabel?: string }) {
  return <section className="ui-panel p-8"><p className="ui-eyebrow">NOTHING TO SHOW YET</p><h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{detail}</p>{actionTo && actionLabel && <Link className="ui-action mt-6" to={actionTo}>{actionLabel}</Link>}</section>;
}

export function ErrorState({ title, detail, actionTo, actionLabel }: { title: string; detail: string; actionTo: string; actionLabel: string }) {
  return <section aria-live="assertive" className="ui-panel border-rose-300/25 p-8"><p className="text-xs font-bold tracking-[0.18em] text-rose-200">SOMETHING NEEDS ATTENTION</p><h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{detail}</p><Link className="ui-action-secondary mt-6" to={actionTo}>{actionLabel}</Link></section>;
}
