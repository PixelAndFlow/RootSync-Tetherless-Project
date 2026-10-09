import { Link } from "react-router-dom";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div aria-live="polite" className="rounded-3xl border border-white/10 bg-panel p-8 text-slate-300"><span aria-hidden="true" className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />{label}</div>;
}

export function EmptyState({ title, detail, actionTo, actionLabel }: { title: string; detail: string; actionTo?: string; actionLabel?: string }) {
  return <section className="rounded-3xl border border-white/10 bg-panel p-8"><p className="text-xs font-bold tracking-[0.18em] text-cyan-300">NOTHING TO SHOW YET</p><h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{detail}</p>{actionTo && actionLabel && <Link className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 font-bold hover:bg-violet-500" to={actionTo}>{actionLabel}</Link>}</section>;
}

export function ErrorState({ title, detail, actionTo, actionLabel }: { title: string; detail: string; actionTo: string; actionLabel: string }) {
  return <section aria-live="assertive" className="rounded-3xl border border-rose-300/25 bg-panel p-8"><p className="text-xs font-bold tracking-[0.18em] text-rose-200">SOMETHING NEEDS ATTENTION</p><h1 className="mt-3 text-2xl font-bold">{title}</h1><p className="mt-3 max-w-xl leading-7 text-slate-300">{detail}</p><Link className="mt-6 inline-flex rounded-xl border border-white/15 px-5 py-3 font-bold hover:bg-white/5" to={actionTo}>{actionLabel}</Link></section>;
}
