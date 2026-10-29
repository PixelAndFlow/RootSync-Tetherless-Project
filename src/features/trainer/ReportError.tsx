import { ApiErrorNotice } from "../../components/common/ApiErrorNotice";

export function ReportError({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="mt-5"><p className="mb-2">Report data could not be loaded.</p><ApiErrorNotice error={error} /><button type="button" className="ui-action-secondary mt-3" onClick={retry}>Retry</button></div>;
}
