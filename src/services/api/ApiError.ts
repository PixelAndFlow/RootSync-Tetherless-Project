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
  VALIDATION_FAILED: "Check the student details and try again.",
  RATE_LIMITED: "Too many requests. Please wait before trying again.",
  NETWORK_ERROR: "Unable to connect. Check your connection and try again.",
  INVALID_RESPONSE: "The service returned an unexpected response. Please contact the team.",
  NOT_IMPLEMENTED: "This live staff action is not enabled in the current frontend integration.",
  INVALID_CREDENTIALS: "Username or password is wrong.",
  ACCOUNT_DISABLED: "This staff account has been disabled. Contact an administrator.",
  PASSWORD_TOO_SHORT: "Password is too short. Use a longer password.",
  PASSWORD_UNCHANGED: "Choose a different password than your current one.",
  USERNAME_TAKEN: "This username is already taken.",
  NAME_INVALID: "Use a valid name.",
  COHORT_NAME_TAKEN: "A cohort with this name already exists.",
  COHORT_ARCHIVED: "This cohort has been archived and can't be changed.",
  LEARNER_ARCHIVED: "This student has been archived.",
  MODULE_ARCHIVED: "This module has been archived.",
  ALREADY_ASSIGNED: "This module is already assigned to that cohort or student.",
  VERSION_EXISTS: "This module version already exists.",
  IN_USE: "This can't be removed while it's still in use.",
  LOCKOUT_PREVENTED: "This action was blocked because it would remove the last Superadmin.",
  UNKNOWN_PERMISSION: "This permission is not recognized.",
  READ_ONLY_FIELD: "This field can't be changed.",
  CONFIRMATION_REQUIRED: "Confirmation is required before this action can be completed.",
  IMPORT_INVALID: "This import file isn't in the expected format.",
  IMPORT_NOT_FOUND: "That import could not be found.",
  UNREADABLE_FILE: "This file could not be read.",
  UNSUPPORTED_FILE: "This file type is not supported.",
  TOO_LARGE: "This file or request is too large.",
  TOO_MANY_EVENTS: "Too many items in one sync batch. Please try again; your data has not been lost.",
  UNSUPPORTED_SCHEMA_VERSION: "This app version is out of date. Please reload.",
  INVALID_JSON: "The request could not be read. Please try again.",
  SERVER_ERROR: "Something went wrong on our end. Please try again, or contact the team if it continues.",
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
    if (!isRecord(detail) || !["username", "setup_code", "cohort_id", "module_id", "first_name", "last_name"].includes(String(detail.field))) return [];
    return [{ field: String(detail.field), message: "Check this value and try again." }];
  }) : [];
  return new ApiError(code, status, typeof error.retryable === "boolean" ? error.retryable : status >= 500 || status === 429, requestId, details);
}

export function userError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError("UNKNOWN_ERROR");
}
