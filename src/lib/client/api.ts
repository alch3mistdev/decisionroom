"use client";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: `Request failed: ${response.status}` }));
    throw new ApiError(
      data.error ?? `Request failed: ${response.status}`,
      response.status,
      data.code,
      data.details,
    );
  }

  return response.json() as Promise<T>;
}
