-- CreateTable
CREATE TABLE "daily_batches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "batch_date" TEXT NOT NULL,
    "recipes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_batches_user_id_batch_date_key" ON "daily_batches"("user_id", "batch_date");

-- AddForeignKey
ALTER TABLE "daily_batches" ADD CONSTRAINT "daily_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
