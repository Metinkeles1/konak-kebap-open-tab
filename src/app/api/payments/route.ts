import { prisma } from "@/lib/prisma";
import { ok, created, fail, handleError } from "@/lib/api";
import { paymentCreateSchema } from "@/lib/validations";

// GET /api/payments — (silinmemiş) ödemeler. ?supplierId=... ile filtrelenebilir.
export async function GET(req: Request) {
  try {
    const supplierId = new URL(req.url).searchParams.get("supplierId");
    const payments = await prisma.payment.findMany({
      where: { deletedAt: null, ...(supplierId ? { supplierId } : {}) },
      orderBy: { date: "desc" },
      include: { supplier: true },
    });
    return ok(payments);
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/payments — yeni ödeme (tutar kuruş cinsinden)
export async function POST(req: Request) {
  try {
    const data = paymentCreateSchema.parse(await req.json());

    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, deletedAt: null },
    });
    if (!supplier) return fail("Toptancı bulunamadı", 404);

    const payment = await prisma.payment.create({ data });
    return created(payment);
  } catch (err) {
    return handleError(err);
  }
}
