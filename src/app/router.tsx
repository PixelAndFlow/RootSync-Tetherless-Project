import { createHashRouter, Navigate, type LoaderFunctionArgs } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LearnerSetupScreen } from "../features/onboarding/LearnerSetupScreen";
import { MissionDetailScreen } from "../features/missions/MissionDetailScreen";
import { MissionLibraryScreen } from "../features/missions/MissionLibraryScreen";
import { TrainerDashboardScreen } from "../features/trainer/TrainerDashboardScreen";
import { MissionPlayScreen } from "../features/training/MissionPlayScreen";
import { MissionResultsScreen } from "../features/results/MissionResultsScreen";
import { RemediationScreen } from "../features/remediation/RemediationScreen";
import { MissionReviewScreen } from "../features/review/MissionReviewScreen";
import { SyncStatusScreen } from "../features/sync-status/SyncStatusScreen";
import { TrainerLearnerDetailScreen } from "../features/trainer/TrainerLearnerDetailScreen";
import { RouteErrorScreen, RouteNotFoundScreen } from "../features/system/RouteFallbackScreen";
import { moduleLibrary } from "../content/modules";
import { LearnerSettingsScreen } from "../features/settings/LearnerSettingsScreen";
import { StaffSignInScreen } from "../features/staff/StaffSignInScreen";
import { StaffPasswordChangeScreen } from "../features/staff/StaffPasswordChangeScreen";
import { StaffDashboardScreen } from "../features/staff/StaffDashboardScreen";
import { StaffOperationsScreen } from "../features/staff/StaffOperationsScreen";
import { StaffContentWorkflowScreen } from "../features/staff/StaffContentWorkflowScreen";
import { StaffPermissionScreen } from "../features/staff/StaffPermissionScreen";

function requireKnownModule({ params }: LoaderFunctionArgs) {
  if (!moduleLibrary.some((module) => module.module_id === params.moduleId)) {
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
      { path: "/learner/missions", element: <MissionLibraryScreen /> },
      { path: "/learner/missions/:moduleId", element: <MissionDetailScreen />, loader: requireKnownModule },
      { path: "/learner/missions/:moduleId/play", element: <MissionPlayScreen />, loader: requireKnownModule },
      { path: "/learner/missions/:moduleId/results", element: <MissionResultsScreen />, loader: requireKnownModule },
      { path: "/learner/missions/:moduleId/practice", element: <RemediationScreen />, loader: requireKnownModule },
      { path: "/learner/missions/:moduleId/review", element: <MissionReviewScreen />, loader: requireKnownModule },
      { path: "/learner/sync", element: <SyncStatusScreen /> },
      { path: "/learner/settings", element: <LearnerSettingsScreen /> },
      { path: "/trainer", element: <TrainerDashboardScreen /> },
      { path: "/trainer/learners/:learnerId", element: <TrainerLearnerDetailScreen /> },
      { path: "/staff/sign-in", element: <StaffSignInScreen /> },
      { path: "/staff/change-password", element: <StaffPasswordChangeScreen /> },
      { path: "/staff", element: <StaffDashboardScreen /> },
      { path: "/staff/operations", element: <StaffOperationsScreen /> },
      { path: "/staff/content", element: <StaffContentWorkflowScreen /> },
      { path: "/staff/accounts", element: <StaffPermissionScreen permission="staff" /> },
      { path: "/staff/system", element: <StaffPermissionScreen permission="system" /> },
      { path: "*", element: <RouteNotFoundScreen /> },
    ],
  },
]);
