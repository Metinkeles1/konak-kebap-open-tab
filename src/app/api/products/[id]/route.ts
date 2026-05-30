import { prisma } from "@/lib/prisma";
import { ok, fail, handleError } from "@/lib/api";
import { productUpdateSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

// GET /api/products/:id — tek ürün (birimleriyle)
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        packages: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        defaultSupplier: true,
      },
    });
    if (!product) return fail("Ürün bulunamadı", 404);
    return ok(product);
  } catch (err) {
    return handleError(err);
  }
}

// PUT /api/products/:id — güncelle (yalnızca ürün başlık alanları; birimler ayrı yönetilir)
export async function PUT(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Ürün bulunamadı", 404);

    // Birimler ayrı yönetilir; başlık alanlarını al.
    const parsed = productUpdateSchema.parse(await req.json());
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: parsed.name,
        baseUnit: parsed.baseUnit,
        defaultSupplierId: parsed.defaultSupplierId,
      },
    });
    return ok(product);
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/products/:id — soft delete
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return fail("Ürün bulunamadı", 404);

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok({ id, deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
