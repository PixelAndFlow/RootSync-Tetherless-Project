/**
 * Small HTTP toolkit on node:http (no framework): errors, body reading,
 * routing and the one error shape every route uses (spec v1.10 §2):
 *
 *   { "error": { "code", "message", "request_id", "retryable", "details": [] } }
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { MAX_BODY_BYTES } from "../../contract/src/index.ts";

export interface ErrorDetail {
  row?: number;
  field?: string;
  code: string;
  message: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly headers: Record<string, string>;
  readonly details: ErrorDetail[];
  constructor(status: number, code: string, message: string, opts: { headers?: Record<string, string>; details?: ErrorDetail[] } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = opts.headers ?? {};
    this.details = opts.details ?? [];
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  now: string;
}
export type Handler = (ctx: Ctx) => Promise<unknown>;

export const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(text);
};

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const tooBig = () => new HttpError(413, "TOO_LARGE", `Request body is over ${limit} bytes.`);
  if (Number(req.headers["content-length"] ?? 0) > limit) throw tooBig();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw tooBig();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<unknown> {
  const buf = await readBody(req, limit);
  try {
    return JSON.parse(buf.toString("utf8") || "null");
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
}

export const bearer = (req: IncomingMessage): string | null => {
  const h = req.headers.authorization;
  return h && /^Bearer\s+\S+$/i.test(h) ? h.replace(/^Bearer\s+/i, "") : null;
};

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Trimmed text of at most `max` characters, or null when missing or blank. */
export const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.trim().length <= max ? v.trim() : null);

export class Router {
  private readonly routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

  add(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_m, k) => (keys.push(k), "([^/]+)"))}$`);
    this.routes.push({ method, pattern, keys, handler });
  }

  /** Run the matching route and write the response, including errors in the standard shape. */
  async dispatch(req: IncomingMessage, res: ServerResponse, now: string): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requestId = `req-${randomBytes(4).toString("hex")}`;
    res.setHeader("x-request-id", requestId);
    try {
      for (const r of this.routes) {
        const m = r.pattern.exec(url.pathname);
        if (!m || r.method !== req.method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const body = await r.handler({ req, res, params, query: url.searchParams, now });
        if (res.writableEnded) return;
        send(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, body);
        return;
      }
      const pathExists = this.routes.some((r) => r.pattern.test(url.pathname));
      throw new HttpError(pathExists ? 405 : 404, pathExists ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", pathExists ? "Method not allowed." : "Not found.");
    } catch (e) {
      if (e instanceof HttpError) {
        send(res, e.status, { error: { code: e.code, message: e.message, request_id: requestId, retryable: e.status === 429 || e.status >= 500, details: e.details } }, e.headers);
      } else {
        console.error(requestId, e);
        send(res, 500, { error: { code: "SERVER_ERROR", message: "Something went wrong on the server. Try again later.", request_id: requestId, retryable: true, details: [] } });
      }
    }
  }
}
