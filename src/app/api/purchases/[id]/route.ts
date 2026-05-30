import { prisma } from "@/lib/prisma";
import { ok, fail, handleError } from "@/lib/api";
import { purchaseUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// GET /api/purchases/:id — tek alış (kalemleri + ürün bilgisiyle)
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const purchase = await prisma.purchase.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        items: { include: { package: { include: { product: true } } } },
      },
    });
    if (!purchase) return fail("Alış bulunamadı", 404);
    return ok(purchase);
  } catch (err) {
    return handleError(err);
  }
}

// PUT /api/purchases/:id — yalnızca başlık (not/tarih). Kalemler dondurulmuştur.
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.purchase.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Alış bulunamadı", 404);

    const data = purchaseUpdateSchema.parse(await req.json());
    const purchase = await prisma.purchase.update({ where: { id }, data });
    return ok(purchase);
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/purchases/:id — soft delete (iptal/yanlış giriş)
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.purchase.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Alış bulunamadı", 404);

    await prisma.purchase.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok({ id, deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
