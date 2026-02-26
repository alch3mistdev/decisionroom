import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { toAppError } from "@/lib/errors";

interface ErrorPayload {
  error: string;
  code?: string;
  details?: unknown;
}

export function ok<T>(payload: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(payload, { status: 200, ...init });
}

export function created<T>(payload: T): NextResponse<T> {
  return NextResponse.json(payload, { status: 201 });
}

export function badRequest(message: string, details?: unknown, code = "BAD_REQUEST") {
  return NextResponse.json(
    {
      error: message,
      code,
      details,
    },
    { status: 400 },
  );
}

export function notFound(message: string) {
  return NextResponse.json({ error: message, code: "NOT_FOUND" }, { status: 404 });
}

export function serviceUnavailable(message: string, details?: unknown, code = "PROVIDER_UNAVAILABLE") {
  return NextResponse.json(
    {
      error: message,
      code,
      details,
    },
    { status: 503 },
  );
}

export function serverError(message: string) {
  return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
}

export function handleRouteError(error: unknown, fallbackMessage: string): NextResponse<ErrorPayload> {
  const appError = toAppError(error, fallbackMessage);
  return NextResponse.json(
    {
      error: appError.message,
      code: appError.code,
      details: appError.details,
    },
    { status: appError.status },
  );
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}
