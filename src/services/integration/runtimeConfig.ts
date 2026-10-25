/**
 * Integration-only configuration. Nothing reads this value until a real adapter
 * is explicitly installed in GatewayProvider.
 */
export interface FrontendRuntimeConfig {
  apiBaseUrl: string | null;
  mode: "mock" | "integration";
}

export function readFrontendRuntimeConfig(environment: Record<string, string | boolean | undefined> = import.meta.env): FrontendRuntimeConfig {
  const candidate = typeof environment.VITE_TETHERLESS_API_BASE_URL === "string" ? environment.VITE_TETHERLESS_API_BASE_URL.trim() : "";
  if (!candidate) return { apiBaseUrl: null, mode: "mock" };
  const url = new URL(candidate);
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) throw new Error("Integration API requires HTTPS outside local development.");
  return { apiBaseUrl: url.toString().replace(/\/$/, ""), mode: "integration" };
}
