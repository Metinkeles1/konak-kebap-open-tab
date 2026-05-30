import { prisma } from "@/lib/prisma";
import { ok, created, handleError } from "@/lib/api";
import { productCreateSchema } from "@/lib/validations";

// GET /api/products — tüm (silinmemiş) ürünler + birimleri
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        packages: { where: { deletedAt: null }, orderBy: { name: "asc" } },
        defaultSupplier: true,
      },
    });
    return ok(products);
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/products — yeni ürün (isteğe bağlı birimleriyle birlikte)
export async function POST(req: Request) {
  try {
    const { packages, ...data } = productCreateSchema.parse(await req.json());
    const product = await prisma.product.create({
      data: {
        ...data,
        packages: packages?.length ? { create: packages } : undefined,
      },
      include: { packages: true },
    });
    return created(product);
  } catch (err) {
    return handleError(err);
  }
}
