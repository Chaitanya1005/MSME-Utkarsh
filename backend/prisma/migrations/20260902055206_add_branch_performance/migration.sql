-- CreateEnum
CREATE TYPE "PerformancePeriodType" AS ENUM ('MONTH', 'QUARTER', 'ANNUAL');

-- CreateTable
CREATE TABLE "BranchPerformance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "periodType" "PerformancePeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetAmount" DECIMAL(15,2) NOT NULL,
    "achievedAmount" DECIMAL(15,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceUpdate" (
    "id" TEXT NOT NULL,
    "branchPerformanceId" TEXT NOT NULL,
    "previousAmount" DECIMAL(15,2) NOT NULL,
    "newAmount" DECIMAL(15,2) NOT NULL,
    "remarks" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchPerformance_branchId_idx" ON "BranchPerformance"("branchId");

-- CreateIndex
CREATE INDEX "BranchPerformance_periodType_periodStart_periodEnd_idx" ON "BranchPerformance"("periodType", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPerformance_branchId_periodType_periodStart_periodEnd_key" ON "BranchPerformance"("branchId", "periodType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PerformanceUpdate_branchPerformanceId_idx" ON "PerformanceUpdate"("branchPerformanceId");

-- CreateIndex
CREATE INDEX "PerformanceUpdate_updatedByUserId_idx" ON "PerformanceUpdate"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "PerformanceUpdate" ADD CONSTRAINT "PerformanceUpdate_branchPerformanceId_fkey" FOREIGN KEY ("branchPerformanceId") REFERENCES "BranchPerformance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
