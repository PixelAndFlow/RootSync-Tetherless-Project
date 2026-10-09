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

const PlaceholderScreen = ({ title }: { title: string }) => <section className="rounded-3xl border border-white/10 bg-panel p-8"><p className="text-xs font-bold tracking-[0.2em] text-cyan-300">NEXT BUILD SLICE</p><h1 className="mt-3 text-3xl font-bold">{title}</h1></section>;

export const router = createHashRouter([
  { path: "/", element: <Navigate replace to="/learner" /> },
  {
    element: <AppShell />,
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
      { path: "/trainer/learners/:learnerId", element: <PlaceholderScreen title="Learner module detail" /> },
    ],
  },
]);
