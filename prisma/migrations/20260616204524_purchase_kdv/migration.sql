-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "vatAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" INTEGER;
