import { lazy, Suspense } from "react";
import { createHashRouter, Navigate, Outlet, type LoaderFunctionArgs } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LearnerSetupScreen } from "../features/onboarding/LearnerSetupScreen";
import { LearnerProfileGate } from "../features/onboarding/LearnerProfileGate";
import { MissionDetailScreen } from "../features/missions/MissionDetailScreen";
import { MissionLibraryScreen } from "../features/missions/MissionLibraryScreen";
import { MissionPlayScreen } from "../features/training/MissionPlayScreen";
import { MissionResultsScreen } from "../features/results/MissionResultsScreen";
import { RemediationScreen } from "../features/remediation/RemediationScreen";
import { MissionReviewScreen } from "../features/review/MissionReviewScreen";
import { SyncStatusScreen } from "../features/sync-status/SyncStatusScreen";
import { RouteErrorScreen, RouteNotFoundScreen } from "../features/system/RouteFallbackScreen";
import { LoadingState } from "../components/common/PageState";
import { loadModuleCatalog } from "../features/missions/moduleCatalog";
import { appGateways } from "../services/gateways";
import { LearnerSettingsScreen } from "../features/settings/LearnerSettingsScreen";
import { StaffPasswordGate } from "../features/staff/StaffPasswordGate";

/**
 * Issue #48: every learner device was downloading the whole staff/trainer
 * admin surface (content validation, roster import, permissions editor, …)
 * in the one JS bundle, even though a learner's own screens never reference
 * any of it. Each import() below becomes its own chunk, fetched only when a
 * staff or trainer route is actually visited.
 */
const TrainerDashboardScreen = lazy(() => import("../features/trainer/TrainerDashboardScreen").then((m) => ({ default: m.TrainerDashboardScreen })));
const TrainerLearnerDetailScreen = lazy(() => import("../features/trainer/TrainerLearnerDetailScreen").then((m) => ({ default: m.TrainerLearnerDetailScreen })));
const StaffSignInScreen = lazy(() => import("../features/staff/StaffSignInScreen").then((m) => ({ default: m.StaffSignInScreen })));
const StaffPasswordChangeScreen = lazy(() => import("../features/staff/StaffPasswordChangeScreen").then((m) => ({ default: m.StaffPasswordChangeScreen })));
const StaffDashboardScreen = lazy(() => import("../features/staff/StaffDashboardScreen").then((m) => ({ default: m.StaffDashboardScreen })));
const StaffOperationsScreen = lazy(() => import("../features/staff/StaffOperationsScreen").then((m) => ({ default: m.StaffOperationsScreen })));
const StaffLearnerDetailScreen = lazy(() => import("../features/staff/StaffLearnerDetailScreen").then((m) => ({ default: m.StaffLearnerDetailScreen })));
const StaffContentWorkflowScreen = lazy(() => import("../features/staff/StaffContentWorkflowScreen").then((m) => ({ default: m.StaffContentWorkflowScreen })));
const StaffPermissionScreen = lazy(() => import("../features/staff/StaffPermissionScreen").then((m) => ({ default: m.StaffPermissionScreen })));
const StaffAccountsScreen = lazy(() => import("../features/staff/StaffAccountsScreen").then((m) => ({ default: m.StaffAccountsScreen })));

/**
 * Guards the mission routes against an unknown module ID before the screen
 * mounts. Checks the real assigned-module list (API Spec v1.30 §8.1
 * listAssignedModules) in live mode, the demo fixtures otherwise — the same
 * fallback loadModuleCatalog uses everywhere else, so this 404 gate and what
 * the screens themselves load never disagree.
 */
async function requireKnownModule({ params }: LoaderFunctionArgs) {
  if (appGateways.offlineLearningReady) await appGateways.offlineLearningReady;
  const modules = await loadModuleCatalog(appGateways.offlineLearning);
  if (!modules.some((module) => module.moduleId === params.moduleId)) {
    throw new Response("Mission not found.", { status: 404, statusText: "Mission not found" });
  }
  return null;
}

export const router = createHashRouter([
  { path: "/", element: <Navigate replace to="/learner" /> },
  {
    element: <AppShell />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/learner", element: <LearnerSetupScreen /> },
      {
        // A Student who has never completed setup must not see a page that
        // assumes a profile exists, however they got here (issue #24).
        // /learner/sync is deliberately NOT included here: it reports
        // device-level offline/sync state (SyncStatusScreen never reads the
        // learner profile), and is meant to work even before setup.
        element: <LearnerProfileGate><Outlet /></LearnerProfileGate>,
        children: [
          { path: "/learner/missions", element: <MissionLibraryScreen /> },
          { path: "/learner/missions/:moduleId", element: <MissionDetailScreen />, loader: requireKnownModule },
          { path: "/learner/missions/:moduleId/play", element: <MissionPlayScreen />, loader: requireKnownModule },
          { path: "/learner/missions/:moduleId/results", element: <MissionResultsScreen />, loader: requireKnownModule },
          { path: "/learner/missions/:moduleId/practice", element: <RemediationScreen />, loader: requireKnownModule },
          { path: "/learner/missions/:moduleId/review", element: <MissionReviewScreen />, loader: requireKnownModule },
          { path: "/learner/settings", element: <LearnerSettingsScreen /> },
        ],
      },
      { path: "/learner/sync", element: <SyncStatusScreen /> },
      {
        // Issue #48: one Suspense boundary for the whole staff/trainer area,
        // same nested-route shape as the learner-profile gate above. A
        // learner device that never visits any of these paths never fetches
        // their chunks at all.
        element: <Suspense fallback={<LoadingState label="Loading…" />}><Outlet /></Suspense>,
        children: [
          { path: "/trainer", element: <TrainerDashboardScreen /> },
          { path: "/trainer/learners/:learnerId", element: <TrainerLearnerDetailScreen /> },
          { path: "/staff/sign-in", element: <StaffSignInScreen /> },
          { path: "/staff/change-password", element: <StaffPasswordChangeScreen /> },
          { path: "/staff", element: <StaffPasswordGate><StaffDashboardScreen /></StaffPasswordGate> },
          { path: "/staff/operations", element: <StaffPasswordGate><StaffOperationsScreen /></StaffPasswordGate> },
          { path: "/staff/operations/learners/:learnerId", element: <StaffPasswordGate><StaffLearnerDetailScreen /></StaffPasswordGate> },
          { path: "/staff/content", element: <StaffPasswordGate><StaffContentWorkflowScreen /></StaffPasswordGate> },
          { path: "/staff/accounts", element: <StaffPasswordGate><StaffAccountsScreen /></StaffPasswordGate> },
          { path: "/staff/system", element: <StaffPasswordGate><StaffPermissionScreen permission="system" /></StaffPasswordGate> },
        ],
      },
      { path: "*", element: <RouteNotFoundScreen /> },
    ],
  },
]);
