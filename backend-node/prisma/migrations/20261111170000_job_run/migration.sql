-- CreateTable
CREATE TABLE "JobRun" (
    "name" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("name")
);
