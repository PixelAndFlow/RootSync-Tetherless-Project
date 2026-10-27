import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { EmptyState, ErrorState } from "../../components/common/PageState";

export function RouteNotFoundScreen() {
  return <EmptyState actionLabel="Return to missions" actionTo="/learner/missions" detail="This link does not match a page in the local Tetherless app." title="That page is not available." />;
}

export function RouteErrorScreen() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <RouteNotFoundScreen />;
  console.error("Route rendering error", error);
  return <ErrorState actionLabel="Return to missions" actionTo="/learner/missions" detail="The page could not load safely. Your locally saved learning is not changed." title="This page needs attention." />;
}
