import { prisma } from "@/lib/prisma";
import { ok, fail, handleError } from "@/lib/api";
import { paymentUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// GET /api/payments/:id — tek ödeme
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const payment = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true },
    });
    if (!payment) return fail("Ödeme bulunamadı", 404);
    return ok(payment);
  } catch (err) {
    return handleError(err);
  }
}

// PUT /api/payments/:id — güncelle
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Ödeme bulunamadı", 404);

    const data = paymentUpdateSchema.parse(await req.json());
    const payment = await prisma.payment.update({ where: { id }, data });
    return ok(payment);
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/payments/:id — soft delete
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Ödeme bulunamadı", 404);

    await prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok({ id, deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
