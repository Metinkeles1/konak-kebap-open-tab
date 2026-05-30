import { prisma } from "@/lib/prisma";
import { ok, fail, handleError } from "@/lib/api";
import { supplierUpdateSchema } from "@/lib/validations";
import { getSupplierBalance } from "@/lib/balance";

type Params = { params: Promise<{ id: string }> };

// GET /api/suppliers/:id — tek toptancı (bakiye + son hareketlerle)
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const supplier = await prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!supplier) return fail("Toptancı bulunamadı", 404);

    const balance = await getSupplierBalance(id);
    return ok({ ...supplier, balance });
  } catch (err) {
    return handleError(err);
  }
}

// PUT /api/suppliers/:id — güncelle
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Toptancı bulunamadı", 404);

    const data = supplierUpdateSchema.parse(await req.json());
    const supplier = await prisma.supplier.update({ where: { id }, data });
    return ok(supplier);
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/suppliers/:id — soft delete
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Toptancı bulunamadı", 404);

    await prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok({ id, deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
