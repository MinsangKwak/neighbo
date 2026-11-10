-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ON_SALE', 'RESERVED', 'SOLD');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('PRODUCT', 'AVATAR');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('SELLER', 'BUYER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nicknameLower" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ProductStatus" NOT NULL DEFAULT 'ON_SALE',
    "buyerId" TEXT,
    "soldAt" TIMESTAMP(3),
    "soldPrice" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "imagesPurgedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageSenderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomMember" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "lastReadSeq" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_nicknameLower_key" ON "User"("nicknameLower");

-- CreateIndex
CREATE INDEX "Product_deletedAt_createdAt_id_idx" ON "Product"("deletedAt", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Product_sellerId_status_createdAt_idx" ON "Product"("sellerId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_buyerId_soldAt_idx" ON "Product"("buyerId", "soldAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sellerId_idempotencyKey_key" ON "Product"("sellerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductImage_productId_order_idx" ON "ProductImage"("productId", "order");

-- CreateIndex
CREATE INDEX "Upload_createdAt_idx" ON "Upload"("createdAt");

-- CreateIndex
CREATE INDEX "ChatRoom_productId_idx" ON "ChatRoom"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoom_productId_buyerId_key" ON "ChatRoom"("productId", "buyerId");

-- CreateIndex
CREATE INDEX "ChatRoomMember_userId_lastActivityAt_roomId_idx" ON "ChatRoomMember"("userId", "lastActivityAt" DESC, "roomId" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Message_roomId_seq_key" ON "Message"("roomId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Message_roomId_senderId_tempId_key" ON "Message"("roomId", "senderId", "tempId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DB가 마지막으로 지키는 것 — Prisma 스키마로 표현할 수 없는 CHECK 제약
-- 근거: docs/architecture/backend.md 02절 3
-- 가격은 0 이상 1억 이하
ALTER TABLE "Product" ADD CONSTRAINT product_price_range CHECK (price BETWEEN 0 AND 100000000);
-- 거래완료일 때만 soldAt이 있다 (둘은 함께 움직인다)
ALTER TABLE "Product" ADD CONSTRAINT product_sold_at CHECK ((status = 'SOLD') = ("soldAt" IS NOT NULL));
-- 구매자 · 거래 가격은 거래완료일 때만
ALTER TABLE "Product" ADD CONSTRAINT product_buyer_only_sold CHECK (status = 'SOLD' OR ("buyerId" IS NULL AND "soldPrice" IS NULL));
-- 자기 물건의 구매자가 될 수 없다
ALTER TABLE "Product" ADD CONSTRAINT product_buyer_not_seller CHECK ("buyerId" IS NULL OR "buyerId" <> "sellerId");
-- 자기 물건에 채팅방을 만들 수 없다
ALTER TABLE "ChatRoom" ADD CONSTRAINT room_buyer_not_seller CHECK ("buyerId" <> "sellerId");
-- 빈 메시지 · 비정상적으로 긴 메시지. 정확한 1,000자(grapheme) 제한은 공유 스키마가 하고,
-- DB는 "어떤 1,000자도 통과하는" 상한만 둔다 — 가족 이모지 하나가 코드포인트 7~11개라 4,000은 정상 메시지를 막는다
ALTER TABLE "Message" ADD CONSTRAINT message_length CHECK (char_length(content) BETWEEN 1 AND 16000);
