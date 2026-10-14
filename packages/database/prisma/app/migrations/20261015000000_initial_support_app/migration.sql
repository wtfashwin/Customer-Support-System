-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "support_app";

-- CreateEnum
CREATE TYPE "support_app"."ConversationStatus" AS ENUM ('active', 'resolved', 'archived');

-- CreateEnum
CREATE TYPE "support_app"."MessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "support_app"."AgentType" AS ENUM ('router', 'support', 'order', 'billing');

-- CreateEnum
CREATE TYPE "support_app"."OrderStatus" AS ENUM ('pending', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "support_app"."PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "support_app"."PaymentMethod" AS ENUM ('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'apple_pay', 'google_pay');

-- CreateEnum
CREATE TYPE "support_app"."RefundStatus" AS ENUM ('pending', 'approved', 'rejected', 'processing', 'completed');

-- CreateTable
CREATE TABLE "support_app"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_app"."Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Conversation',
    "metadata" JSONB,
    "status" "support_app"."ConversationStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_app"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "support_app"."MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "agentType" "support_app"."AgentType",
    "toolCalls" JSONB,
    "reasoning" TEXT,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_app"."Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "support_app"."OrderStatus" NOT NULL,
    "items" JSONB NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "trackingId" TEXT,
    "carrier" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "shippingAddress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_app"."Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "support_app"."PaymentStatus" NOT NULL,
    "method" "support_app"."PaymentMethod" NOT NULL,
    "refundStatus" "support_app"."RefundStatus",
    "refundAmount" DECIMAL(10,2),
    "refundReason" TEXT,
    "billingAddress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_app"."KnowledgeBase" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "support_app"."User"("email");

-- CreateIndex
CREATE INDEX "Conversation_userId_createdAt_idx" ON "support_app"."Conversation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "support_app"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "support_app"."Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_userId_orderNumber_idx" ON "support_app"."Order"("userId", "orderNumber");

-- CreateIndex
CREATE INDEX "Order_trackingId_idx" ON "support_app"."Order"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNumber_key" ON "support_app"."Payment"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_userId_invoiceNumber_idx" ON "support_app"."Payment"("userId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "support_app"."Payment"("orderId");

-- CreateIndex
CREATE INDEX "KnowledgeBase_category_idx" ON "support_app"."KnowledgeBase"("category");

-- AddForeignKey
ALTER TABLE "support_app"."Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "support_app"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_app"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_app"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

