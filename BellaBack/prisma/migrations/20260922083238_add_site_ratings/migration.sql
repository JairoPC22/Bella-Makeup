-- CreateTable
CREATE TABLE "site_ratings" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "page" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_ratings_created_at_idx" ON "site_ratings"("created_at");

