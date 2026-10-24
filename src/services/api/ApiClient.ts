import { ApiError, parseApiError } from "./ApiError";

/** Opt-in staff API boundary. No token persistence, learner sync, or automatic retries. */
export class ApiClient {
  private readonly baseUrl: string;
  /**
   * `fetch` is a method on the browser global. Bind its receiver before
   * retaining it so calling `this.transport(...)` cannot cause an illegal
   * invocation that is misreported as a network failure.
   */
  constructor(baseUrl: string, private readonly token: () => string | null, private readonly transport: typeof fetch = fetch.bind(globalThis)) {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new Error("API requires HTTPS (HTTP is allowed only for local testing).");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async get(path: string): Promise<unknown> {
    if (!path.startsWith("/v1/") || path.includes("..")) throw new Error("Invalid API path.");
    const token = this.token();
    if (!token) throw new ApiError("UNAUTHORIZED", 401);
    let response: Response;
    try {
      response = await this.transport(`${this.baseUrl}${path}`, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        cache: "no-store", credentials: "omit", redirect: "error",
      });
    } catch { throw new ApiError("NETWORK_ERROR", 0, true); }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw response.ok ? new ApiError("INVALID_RESPONSE", response.status) : parseApiError(null, response.status); }
    if (!response.ok) throw parseApiError(body, response.status);
    return body;
  }

  /** `auth: false` is reserved for endpoints called before a session exists, such as staff sign-in. */
  async post(path: string, payload: unknown, options: { auth?: boolean } = {}): Promise<unknown> {
    if (!path.startsWith("/v1/") || path.includes("..")) throw new Error("Invalid API path.");
    const auth = options.auth ?? true;
    const token = auth ? this.token() : null;
    if (auth && !token) throw new ApiError("UNAUTHORIZED", 401);
    let response: Response;
    try {
      response = await this.transport(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
        cache: "no-store", credentials: "omit", redirect: "error",
      });
    } catch { throw new ApiError("NETWORK_ERROR", 0, true); }
    let body: unknown;
    try { body = await response.json(); }
    catch { throw response.ok ? new ApiError("INVALID_RESPONSE", response.status) : parseApiError(null, response.status); }
    if (!response.ok) throw parseApiError(body, response.status);
    return body;
  }
}
