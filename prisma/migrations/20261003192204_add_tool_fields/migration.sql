-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "toolCallId" TEXT,
ADD COLUMN     "toolCalls" JSONB;
