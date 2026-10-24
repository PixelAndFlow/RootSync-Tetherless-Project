export interface FieldIssue { field: string; message: string }

const messages: Record<string, string> = {
  SETUP_CODE_INVALID: "Check your setup code with your trainer.",
  SETUP_CODE_USED: "This setup code has already been used. Ask your trainer for a new code.",
  USERNAME_INVALID: "Use 2–24 letters, numbers, spaces, dots, dashes or underscores.",
  DEVICE_EXISTS: "This device is already registered. Ask your trainer for help; do not clear saved work.",
  PASSWORD_CHANGE_REQUIRED: "Change your temporary staff password before continuing.",
  UNAUTHORIZED: "Authorization is required. Your locally saved work has not been deleted.",
  FORBIDDEN: "You do not have permission to view this information.",
  NOT_FOUND: "The requested record is not available.",
  INVALID_INPUT: "Check the highlighted fields and try again.",
  VALIDATION_FAILED: "Check the highlighted fields and try again.",
  USERNAME_TAKEN: "That username is already taken.",
  RATE_LIMITED: "Too many requests. Please wait before trying again.",
  NETWORK_ERROR: "Unable to connect. Check your connection and try again.",
  INVALID_RESPONSE: "The service returned an unexpected response. Please contact the team.",
};

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 0,
    public readonly retryable = false,
    public readonly requestId?: string,
    public readonly details: FieldIssue[] = [],
  ) {
    super(messages[code] ?? "The request could not be completed. Please contact the team.");
    this.name = "ApiError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Do not echo arbitrary server messages/details (which can contain secrets) into UI. */
export function parseApiError(body: unknown, status: number): ApiError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const code = typeof error.code === "string" ? error.code : status === 401 ? "UNAUTHORIZED" : "UNKNOWN_ERROR";
  const requestId = typeof error.request_id === "string" && /^[\w-]{1,100}$/.test(error.request_id) ? error.request_id : undefined;
  const details = Array.isArray(error.details) ? error.details.flatMap((detail): FieldIssue[] => {
    if (!isRecord(detail) || !["username", "setup_code", "cohort_id", "module_id", "display_name", "temporary_password", "role"].includes(String(detail.field))) return [];
    return [{ field: String(detail.field), message: "Check this value and try again." }];
  }) : [];
  return new ApiError(code, status, typeof error.retryable === "boolean" ? error.retryable : status >= 500 || status === 429, requestId, details);
}

export function userError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("UNKNOWN_ERROR");
}
