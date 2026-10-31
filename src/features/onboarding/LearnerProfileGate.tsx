import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useLearnerProfile } from "../../app/providers/LearnerProfileProvider";

/**
 * A Student page that assumes a profile exists (missions, sync status,
 * settings) must not render for a visitor who has never completed setup --
 * whether they arrived by a bookmark, a shared link, or browser history
 * pointing at a deep route (issue #24). Renders nothing while the gateway may
 * still be recovering an existing device's identity, rather than guessing and
 * bouncing a legitimate returning Student; once settled, redirects to
 * /learner if there is still no profile.
 */
export function LearnerProfileGate({ children }: { children: ReactNode }) {
  const { profile, recovering } = useLearnerProfile();
  if (recovering) return null;
  if (!profile) return <Navigate replace to="/learner" />;
  return children;
}
