// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, parseApiError } from "../../src/services/api/ApiError";

/**
 * Regression for issue #23: a server error code with no frontend message
 * mapping silently fell back to a generic "contact the team" message, even
 * for an everyday case (a wrong staff password). This reads every code the
 * server can actually send (`HttpError(status, "CODE", ...)`) and fails if
 * any of them has no entry in ApiError's messages map, so a new server-side
 * error code can't go unmapped again.
 *
 * Lives here, not under src/, because it reads the server's source with
 * node:fs -- src is a browser-only TypeScript project (tsconfig.app.json)
 * with no Node types, and `npm run build`'s `tsc -b` type-checks it strictly.
 */
function serverErrorCodes(): string[] {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/server/src");
  const codes = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(`${dir}/${file}`, "utf8");
    for (const m of text.matchAll(/HttpError\(\s*\d+\s*,\s*"([A-Z_]+)"/g)) codes.add(m[1]!);
  }
  return [...codes];
}

describe("ApiError message coverage", () => {
  it("has a specific message for every error code the server can send", () => {
    const unmapped = serverErrorCodes().filter((code) => new ApiError(code).message === "The request could not be completed. Please contact the team.");
    assertNoUnmapped(unmapped);
  });

  it("maps a wrong-password response to a specific message, not the generic fallback", () => {
    const error = parseApiError({ error: { code: "INVALID_CREDENTIALS", request_id: "req-1" } }, 401);
    expect(error.message).toBe("Username or password is wrong.");
  });

  it("still falls back safely for a genuinely unknown/future code", () => {
    const error = parseApiError({ error: { code: "SOME_FUTURE_CODE_NOT_YET_HANDLED" } }, 500);
    expect(error.message).toBe("The request could not be completed. Please contact the team.");
  });
});

function assertNoUnmapped(unmapped: string[]) {
  if (unmapped.length > 0) {
    throw new Error(`these server error codes have no message in ApiError.ts's messages map: ${unmapped.join(", ")}`);
  }
}
