import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Tests must never switch to the live staff adapter because a developer
    // has a local .env.local configured for manual integration testing.
    env: { VITE_TETHERLESS_API_BASE_URL: "" },
  },
});
