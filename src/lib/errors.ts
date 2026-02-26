export type AppErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_OUTPUT_INVALID"
  | "MODEL_TIMEOUT"
  | "INVALID_STATE"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  code: AppErrorCode;
  message: string;
  status?: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.details = options.details;
    if (options.cause) {
      // Keep compatibility with runtimes that do not expose ErrorOptions.
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(message = "No healthy LLM provider available", details?: unknown) {
    super({
      code: "PROVIDER_UNAVAILABLE",
      message,
      status: 503,
      details,
    });
    this.name = "ProviderUnavailableError";
  }
}

export class ModelOutputInvalidError extends AppError {
  constructor(message = "Model response was invalid", details?: unknown) {
    super({
      code: "MODEL_OUTPUT_INVALID",
      message,
      status: 422,
      details,
    });
    this.name = "ModelOutputInvalidError";
  }
}

export class ModelTimeoutError extends AppError {
  constructor(message = "Model request timed out", details?: unknown) {
    super({
      code: "MODEL_TIMEOUT",
      message,
      status: 504,
      details,
    });
    this.name = "ModelTimeoutError";
  }
}

export function toAppError(error: unknown, fallbackMessage = "Internal server error"): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError({
      code: "INTERNAL_ERROR",
      message: error.message || fallbackMessage,
      status: 500,
      cause: error,
    });
  }

  return new AppError({
    code: "INTERNAL_ERROR",
    message: fallbackMessage,
    status: 500,
    details: error,
  });
}

export async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ModelTimeoutError(`${context} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    task
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
