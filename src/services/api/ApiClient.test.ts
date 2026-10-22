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
  it("requires authorization before making a request", async () => {
    const fetcher = vi.fn();
    await expect(new ApiClient("http://localhost:8080", () => null, fetcher).get("/v1/staff/cohorts")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetcher).not.toHaveBeenCalled();
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
