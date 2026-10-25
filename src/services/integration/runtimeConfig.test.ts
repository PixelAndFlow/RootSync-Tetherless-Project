import { describe, expect, it } from "vitest";
import { readFrontendRuntimeConfig } from "./runtimeConfig";

describe("frontend integration runtime config", () => {
  it("defaults to mock mode until an API URL is explicitly provided", () => {
    expect(readFrontendRuntimeConfig({})).toEqual({ apiBaseUrl: null, mode: "mock" });
  });
  it("accepts local HTTP and hosted HTTPS but rejects insecure remote URLs", () => {
    expect(readFrontendRuntimeConfig({ VITE_TETHERLESS_API_BASE_URL: "http://localhost:8080/" })).toEqual({ apiBaseUrl: "http://localhost:8080", mode: "integration" });
    expect(() => readFrontendRuntimeConfig({ VITE_TETHERLESS_API_BASE_URL: "http://example.test" })).toThrow(/HTTPS/);
  });
});
