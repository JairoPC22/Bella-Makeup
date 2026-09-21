-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('EXACT_EXCHANGE', 'CUSTOMER_OWES', 'REFUND_OWED');

-- CreateEnum
CREATE TYPE "ReturnItemDirection" AS ENUM ('RETURNED', 'NEW');

-- CreateEnum
CREATE TYPE "MermaType" AS ENUM ('TESTER_EXHIBICION', 'DANO_EN_TIENDA', 'CADUCIDAD_VENCIDO', 'MUESTRA_REGALO_CLIENTE', 'DEFECTO_PROVEEDOR');

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "original_sale_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "processed_by_user_id" TEXT NOT NULL,
    "authorized_by_user_id" TEXT NOT NULL,
    "returned_total" DECIMAL(10,2) NOT NULL,
    "new_items_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(10,2) NOT NULL,
    "resolution" "ReturnResolution" NOT NULL,
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "direction" "ReturnItemDirection" NOT NULL,
    "sale_item_id" TEXT,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mermas" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "branch_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "authorized_by_user_id" TEXT NOT NULL,
    "type" "MermaType" NOT NULL,
    "comments" TEXT NOT NULL,
    "total_cost_impact" DECIMAL(10,2) NOT NULL,
    "total_retail_impact" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mermas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merma_items" (
    "id" TEXT NOT NULL,
    "merma_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "unit_retail" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "merma_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "returns_branch_id_created_at_idx" ON "returns"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_original_sale_id_idx" ON "returns"("original_sale_id");

-- CreateIndex
CREATE INDEX "returns_created_at_idx" ON "returns"("created_at");

-- CreateIndex
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");

-- CreateIndex
CREATE INDEX "return_items_sale_item_id_direction_idx" ON "return_items"("sale_item_id", "direction");

-- CreateIndex
CREATE INDEX "mermas_branch_id_created_at_idx" ON "mermas"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "mermas_type_idx" ON "mermas"("type");

-- CreateIndex
CREATE INDEX "mermas_created_at_idx" ON "mermas"("created_at");

-- CreateIndex
CREATE INDEX "merma_items_merma_id_idx" ON "merma_items"("merma_id");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merma_items" ADD CONSTRAINT "merma_items_merma_id_fkey" FOREIGN KEY ("merma_id") REFERENCES "mermas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merma_items" ADD CONSTRAINT "merma_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merma_items" ADD CONSTRAINT "merma_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
