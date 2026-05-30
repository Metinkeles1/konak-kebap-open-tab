import { prisma } from "@/lib/prisma";
import { ok, created, handleError } from "@/lib/api";
import { supplierCreateSchema } from "@/lib/validations";
import { getSupplierBalance } from "@/lib/balance";

// GET /api/suppliers — tüm (silinmemiş) toptancılar + bakiye özeti
export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });

    const withBalance = await Promise.all(
      suppliers.map(async (s) => ({
        ...s,
        balance: await getSupplierBalance(s.id),
      })),
    );

    return ok(withBalance);
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/suppliers — yeni toptancı
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = supplierCreateSchema.parse(body);
    const supplier = await prisma.supplier.create({ data });
    return created(supplier);
  } catch (err) {
    return handleError(err);
  }
}
