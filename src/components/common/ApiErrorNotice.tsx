import { userError } from "../../services/api/ApiError";

export function ApiErrorNotice({ error }: { error: unknown }) {
  const safe = userError(error);
  return <div role="alert" className="ui-panel p-4">
    <p>{safe.message}</p>
    {safe.requestId && <p className="mt-2 text-sm">Support reference: {safe.requestId}</p>}
    {safe.details.length > 0 && <ul className="mt-2 list-inside list-disc">{safe.details.map((issue, index) => <li key={index}>{issue.field}: {issue.message}</li>)}</ul>}
  </div>;
}
