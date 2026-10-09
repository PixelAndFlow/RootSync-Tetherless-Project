import { createHashRouter, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import { LearnerSetupScreen } from "../features/onboarding/LearnerSetupScreen";
import { MissionDetailScreen } from "../features/missions/MissionDetailScreen";
import { MissionLibraryScreen } from "../features/missions/MissionLibraryScreen";
import { TrainerDashboardScreen } from "../features/trainer/TrainerDashboardScreen";
import { MissionPlayScreen } from "../features/training/MissionPlayScreen";

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
      { path: "/learner/missions/:moduleId/results", element: <PlaceholderScreen title="Mission debrief" /> },
      { path: "/learner/missions/:moduleId/review", element: <PlaceholderScreen title="Mission review" /> },
      { path: "/trainer", element: <TrainerDashboardScreen /> },
      { path: "/trainer/learners/:learnerId", element: <PlaceholderScreen title="Learner module detail" /> },
    ],
  },
]);
