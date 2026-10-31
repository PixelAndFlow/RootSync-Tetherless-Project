import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";

/**
 * A Student page that assumes a profile exists (missions, sync status,
 * settings) must not render for a visitor who has never completed setup --
 * whether they arrived by a bookmark, a shared link, or browser history
 * pointing at a deep route (issue #24). Renders nothing while the gateway may
 * still be recovering an existing device's identity, rather than guessing and
 * bouncing a legitimate returning Student; once settled, redirects to
 * /learner if there is still no profile.
 *
 * A `?scenario=` query param is the pre-existing staff/QA convention for
 * previewing a Student-facing empty/error state (e.g. `/learner/missions
 * ?scenario=no-assigned-modules`, e2e/staff-mock.spec.ts) without completing
 * real Student setup first -- that preview must not be redirected away.
 */
export function LearnerProfileGate({ children }: { children: ReactNode }) {
  const { profile, recovering } = useLearnerProfile();
  const [params] = useSearchParams();
  if (params.get("scenario")) return children;
  if (recovering) return null;
  if (!profile) return <Navigate replace to="/learner" />;
  return children;
}
