import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Tüm API cevapları ortak bir zarf kullanır: { data } veya { error }.

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** Route handler'larında try/catch'i sadeleştirir. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return fail("Geçersiz veri", 422, err.flatten());
  }
  if (err instanceof Error) {
    return fail(err.message, 400);
  }
  return fail("Beklenmeyen bir hata oluştu", 500);
}
