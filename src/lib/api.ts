import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

// Tüm API cevapları ortak bir zarf kullanır: { data } veya { error }.

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * Veri DEĞİŞTİREN uçların (POST/PUT/DELETE) cevabı. Sayfalar statik üretilip
 * yalnızca değişiklikte yenilendiğinden, API'den gelen değişiklik de tüm
 * sayfaları geçersiz kılmalı — aksi halde ekranlar eski veriyi gösterir.
 * (Server action'lardaki revalidateAll ile aynı kural.)
 */
export function changed<T>(data: T, status = 200) {
  revalidatePath("/", "layout");
  return ok(data, status);
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
