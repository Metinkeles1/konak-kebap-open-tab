-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "documentNo" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "openingBalance" INTEGER NOT NULL DEFAULT 0;
