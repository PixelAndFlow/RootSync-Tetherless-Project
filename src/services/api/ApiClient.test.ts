import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./ApiClient";
import { parseApiError } from "./ApiError";

describe("staff API boundary", () => {
  it("keeps credentials out of URLs and does not persist them", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ learners: [] })));
    const client = new ApiClient("http://localhost:8080/", () => "test-only-token", fetcher);
    expect(await client.get("/v1/staff/cohorts/example/report")).toEqual({ learners: [] });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8080/v1/staff/cohorts/example/report", expect.objectContaining({ headers: { accept: "application/json", authorization: "Bearer test-only-token" }, credentials: "omit", redirect: "error" }));
  });
  it("binds the default browser transport to the global scope", async () => {
    const receiver: unknown[] = [];
    const globalTransport = function (this: unknown) {
      receiver.push(this);
      return Promise.resolve(new Response(JSON.stringify({ learners: [] })));
    } as unknown as typeof fetch;
    vi.stubGlobal("fetch", globalTransport);
    try {
      await expect(new ApiClient("http://localhost:8080", () => "test-only-token").get("/v1/staff/cohorts")).resolves.toEqual({ learners: [] });
      expect(receiver).toEqual([globalThis]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("requires authorization before making a request", async () => {
    const fetcher = vi.fn();
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).get("/v1/staff/cohorts")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("allows only explicitly pre-authenticated POST requests without a token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "session" })));
    const client = new ApiClient("http://localhost:8080", () => null, fetcher);
    await expect(client.post("/v1/staff/login", { username: "staff", password: "secret" }, { auth: false })).resolves.toEqual({ token: "session" });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8080/v1/staff/login", expect.objectContaining({
      method: "POST", body: JSON.stringify({ username: "staff", password: "secret" }), headers: { "content-type": "application/json", accept: "application/json" },
    }));
    await expect(client.post("/v1/staff/me/password", {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it.each(["http://example.com", "https://user:secret@example.com", "https://example.com?token=secret"])("rejects unsafe base %s", (url) => {
    expect(() => new ApiClient(url, () => null)).toThrow();
  });
  it("handles a network failure without retrying or exposing exception details", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("secret"));
    await expect(new ApiClient("https://example.com", () => "token", fetcher).get("/v1/staff/cohorts")).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles structured errors, field issues and request IDs safely", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "INVALID_INPUT", message: "secret", request_id: "req-123", retryable: false, details: [{ field: "username", message: "secret" }] } }), { status: 422 }));
    await expect(new ApiClient("https://example.com", () => "token", fetcher).get("/v1/staff/cohorts")).rejects.toMatchObject({ code: "INVALID_INPUT", requestId: "req-123", details: [{ field: "username", message: "Check this value and try again." }] });
  });
  it("uses safe fallbacks for malformed errors and bad successful JSON", async () => {
    expect(parseApiError(null, 401).code).toBe("UNAUTHORIZED");
    expect(parseApiError({ error: { code: "NEW_CODE", message: "secret", request_id: "token:secret" } }, 500)).toMatchObject({ retryable: true, requestId: undefined });
    const fetcher = vi.fn().mockResolvedValue(new Response("not json"));
    await expect(new ApiClient("https://example.com", () => "token", fetcher).get("/v1/staff/cohorts")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
