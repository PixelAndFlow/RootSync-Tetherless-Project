import { Link } from "react-router-dom";

export function ReturnLink({ to, children }: { to: string; children: string }) {
  return <Link className="app-wordmark inline-flex min-h-11 items-center rounded-lg py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300" to={to}>← {children}</Link>;
}
