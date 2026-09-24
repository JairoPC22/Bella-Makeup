-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "estimated_ready_at" TIMESTAMP(3),
ADD COLUMN     "sale_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_sale_id_key" ON "orders"("sale_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

