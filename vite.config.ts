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
    // GatewayProvider's default picks a real adapter when this is set (see
    // services/gateways.ts). Force it empty so tests always get mock
    // gateways regardless of a local .env.local used for `npm run dev`.
    env: { VITE_TETHERLESS_API_BASE_URL: "" },
  },
});
