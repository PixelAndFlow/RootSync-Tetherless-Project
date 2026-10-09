import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { LearnerProfileProvider } from "./app/providers/LearnerProfileProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><LearnerProfileProvider><RouterProvider router={router} /></LearnerProfileProvider></StrictMode>,
);
