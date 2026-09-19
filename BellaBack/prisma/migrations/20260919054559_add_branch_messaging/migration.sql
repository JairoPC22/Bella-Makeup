-- CreateTable
CREATE TABLE "branch_conversations" (
    "id" TEXT NOT NULL,
    "branch_a_id" TEXT NOT NULL,
    "branch_b_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "author_id" TEXT,
    "from_branch_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_message_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_conversations_branch_a_id_branch_b_id_key" ON "branch_conversations"("branch_a_id", "branch_b_id");

-- CreateIndex
CREATE INDEX "branch_messages_conversation_id_created_at_idx" ON "branch_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "branch_messages_created_at_idx" ON "branch_messages"("created_at");

-- AddForeignKey
ALTER TABLE "branch_conversations" ADD CONSTRAINT "branch_conversations_branch_a_id_fkey" FOREIGN KEY ("branch_a_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_conversations" ADD CONSTRAINT "branch_conversations_branch_b_id_fkey" FOREIGN KEY ("branch_b_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_messages" ADD CONSTRAINT "branch_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "branch_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_messages" ADD CONSTRAINT "branch_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_messages" ADD CONSTRAINT "branch_messages_from_branch_id_fkey" FOREIGN KEY ("from_branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_message_attachments" ADD CONSTRAINT "branch_message_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "branch_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
