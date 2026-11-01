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
  it("sends PATCH with a JSON body and requires a token (issues #38/#39)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cohort: { cohort_id: "c" } })));
    const client = new ApiClient("http://localhost:8080", () => "test-only-token", fetcher);
    await expect(client.patch("/v1/staff/cohorts/c", { name: "New name" })).resolves.toEqual({ cohort: { cohort_id: "c" } });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8080/v1/staff/cohorts/c", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ name: "New name" }), headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer test-only-token" },
    }));
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).patch("/v1/staff/cohorts/c", { name: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("sends DELETE with no body and requires a token (issue #40)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const client = new ApiClient("http://localhost:8080", () => "test-only-token", fetcher);
    await expect(client.delete("/v1/staff/modules/m")).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8080/v1/staff/modules/m", expect.objectContaining({
      method: "DELETE", headers: { accept: "application/json", authorization: "Bearer test-only-token" },
    }));
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).delete("/v1/staff/modules/m")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("sends PUT with a JSON body and requires a token (issue #41)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ pass_pct: 75 })));
    const client = new ApiClient("http://localhost:8080", () => "test-only-token", fetcher);
    await expect(client.put("/v1/staff/settings/thresholds", { pass_pct: 75 })).resolves.toEqual({ pass_pct: 75 });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:8080/v1/staff/settings/thresholds", expect.objectContaining({
      method: "PUT", body: JSON.stringify({ pass_pct: 75 }), headers: { "content-type": "application/json", accept: "application/json", authorization: "Bearer test-only-token" },
    }));
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).put("/v1/staff/settings/thresholds", {})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("fetches a raw Blob with GET and requires a token (issue #41's exportCohort)", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ export_version: 2 })));
    const client = new ApiClient("http://localhost:8080", () => "test-only-token", fetcher);
    const blob = await client.getBlob("/v1/staff/cohorts/c/export");
    expect(blob).toBeInstanceOf(Blob);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(text).toBe(JSON.stringify({ export_version: 2 }));
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).getBlob("/v1/staff/cohorts/c/export")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects a Blob fetch's error response using the structured error body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status: 403 }));
    const client = new ApiClient("http://localhost:8080", () => "test-only-token", fetcher);
    await expect(client.getBlob("/v1/staff/cohorts/c/export")).rejects.toMatchObject({ code: "FORBIDDEN" });
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
