import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { GatewayProvider } from "./app/providers/GatewayProvider";
import { LearnerProfileProvider } from "./app/providers/LearnerProfileProvider";
import { StaffSessionProvider } from "./app/providers/StaffSessionProvider";
import { SyncStatusProvider } from "./app/providers/SyncStatusProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><GatewayProvider><StaffSessionProvider><LearnerProfileProvider><SyncStatusProvider><RouterProvider router={router} /></SyncStatusProvider></LearnerProfileProvider></StaffSessionProvider></GatewayProvider></StrictMode>,
);
