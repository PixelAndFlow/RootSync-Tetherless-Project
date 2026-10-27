import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { GatewayProvider } from "./app/providers/GatewayProvider";
import { LearnerProfileProvider } from "./app/providers/LearnerProfileProvider";
import { StaffSessionProvider } from "./app/providers/StaffSessionProvider";
import { SyncStatusProvider } from "./app/providers/SyncStatusProvider";
import { appGateways, startLiveHeartbeat } from "./services/gateways";
import "./styles.css";

startLiveHeartbeat(appGateways);

// Production only: the worker is generated at build time (pwa-shell-plugin.ts), so dev has none.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline shell is an enhancement; the app still runs online without it.
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><GatewayProvider><StaffSessionProvider><LearnerProfileProvider><SyncStatusProvider><RouterProvider router={router} /></SyncStatusProvider></LearnerProfileProvider></StaffSessionProvider></GatewayProvider></StrictMode>,
);
