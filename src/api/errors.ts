/** Every failure from the API client is an ApiError whose `message` is safe to show the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** No response at all (offline, DNS, timeout). Safe to retry with the same idempotency key. */
  get isNetwork() {
    return this.status === 0;
  }

  get isAuth() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

const fallbackMessages: Record<number, string> = {
  0: "No internet connection. Check your network and try again.",
  400: "Something in the request was not right. Try again.",
  401: "Your session has ended. Sign in again.",
  403: "You do not have permission for this.",
  404: "Not found.",
  409: "This already exists.",
  422: "Some details need fixing.",
  429: "Too many attempts. Wait a little and try again.",
  500: "Something went wrong on our side. Try again.",
  502: "The server is not reachable right now. Try again.",
  503: "The server is busy. Try again in a moment."
};

export function fallbackMessage(status: number) {
  return fallbackMessages[status] ?? (status >= 500 ? fallbackMessages[500] : "Something went wrong. Try again.");
}

/** Friendly text for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}
