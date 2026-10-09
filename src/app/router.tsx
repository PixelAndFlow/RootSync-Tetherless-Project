import { createHashRouter, Navigate } from "react-router-dom";
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

export const router = createHashRouter([
  { path: "/", element: <Navigate replace to="/learner" /> },
  {
    element: <AppShell />,
    errorElement: <RouteErrorScreen />,
    children: [
      { path: "/learner", element: <LearnerSetupScreen /> },
      { path: "/learner/missions", element: <MissionLibraryScreen /> },
      { path: "/learner/missions/:moduleId", element: <MissionDetailScreen /> },
      { path: "/learner/missions/:moduleId/play", element: <MissionPlayScreen /> },
      { path: "/learner/missions/:moduleId/results", element: <MissionResultsScreen /> },
      { path: "/learner/missions/:moduleId/practice", element: <RemediationScreen /> },
      { path: "/learner/missions/:moduleId/review", element: <MissionReviewScreen /> },
      { path: "/learner/sync", element: <SyncStatusScreen /> },
      { path: "/trainer", element: <TrainerDashboardScreen /> },
      { path: "/trainer/learners/:learnerId", element: <TrainerLearnerDetailScreen /> },
      { path: "*", element: <RouteNotFoundScreen /> },
    ],
  },
]);
