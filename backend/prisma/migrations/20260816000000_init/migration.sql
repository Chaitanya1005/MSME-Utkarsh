-- MSME Utkarsh Phase 1 initial schema.
--
-- NOTE ON PROVENANCE: this file was authored by hand to match what
-- `prisma migrate dev --name init` would generate from schema.prisma,
-- because the sandboxed environment this was developed in could not
-- reach binaries.prisma.sh to download Prisma's migration engine.
-- Before relying on this in a real environment, run, once you have a
-- normal internet connection:
--
--   npx prisma migrate dev --name init
--
-- Prisma will detect the schema already matches this SQL and simply
-- register it (or regenerate an equivalent migration) — either way,
-- treat `npx prisma migrate dev` as the source of truth going forward,
-- not this hand-authored file.

-- Enums
CREATE TYPE "Role" AS ENUM ('RM', 'BM', 'CO', 'ZM');
CREATE TYPE "PipelineStage" AS ENUM ('INTERESTED', 'CONTACTED', 'APPLICATION', 'APPROVAL', 'CONVERSION');
CREATE TYPE "SourceCategorization" AS ENUM ('A', 'B', 'C', 'D');
CREATE TYPE "SourceStageProgress" AS ENUM ('UNDER_PROCESS', 'SANCTIONED', 'DOC_NOT_EXECUTED', 'PENDING_AT_RAC', 'DISBURSED');

-- CentralOffice
CREATE TABLE "central_offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "central_offices_pkey" PRIMARY KEY ("id")
);

-- Zone
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centralOfficeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "zones_centralOfficeId_idx" ON "zones"("centralOfficeId");

-- Region
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "regions_zoneId_idx" ON "regions"("zoneId");

-- Branch
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "branches_regionId_idx" ON "branches"("regionId");

-- User
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "regionId" TEXT,
    "branchId" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_regionId_key" ON "users"("regionId");
CREATE UNIQUE INDEX "users_branchId_key" ON "users"("branchId");
CREATE INDEX "users_role_idx" ON "users"("role");

-- Lead
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "sourceSrNo" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPrimaryPhone" TEXT NOT NULL,
    "subProductName" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceLeadStatus" TEXT NOT NULL,
    "sourceCategorization" "SourceCategorization" NOT NULL,
    "sourceStageProgress" "SourceStageProgress" NOT NULL,
    "tentativeSanctionDate" TIMESTAMP(3),
    "tentativeDisbursementDate" TIMESTAMP(3),
    "sourceRemarks" TEXT,
    "cbiPesStage" "PipelineStage" NOT NULL DEFAULT 'INTERESTED',
    "branchId" TEXT,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leads_sourceSrNo_key" ON "leads"("sourceSrNo");
CREATE INDEX "leads_branchId_idx" ON "leads"("branchId");
CREATE INDEX "leads_regionId_idx" ON "leads"("regionId");
CREATE INDEX "leads_cbiPesStage_idx" ON "leads"("cbiPesStage");

-- Foreign keys
ALTER TABLE "zones" ADD CONSTRAINT "zones_centralOfficeId_fkey" FOREIGN KEY ("centralOfficeId") REFERENCES "central_offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regions" ADD CONSTRAINT "regions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business-rule CHECK constraints (spec sections 10, 21) not expressible
-- directly in Prisma's schema language as of this Prisma version, so they
-- are added here as raw SQL:

-- A user has an organizational assignment appropriate to their role:
-- RM must have a region and no branch; BM must have a branch and no region.
ALTER TABLE "users" ADD CONSTRAINT "users_role_assignment_check" CHECK (
    (role = 'RM' AND "regionId" IS NOT NULL AND "branchId" IS NULL) OR
    (role = 'BM' AND "branchId" IS NOT NULL AND "regionId" IS NULL) OR
    (role IN ('CO', 'ZM') AND "regionId" IS NULL AND "branchId" IS NULL)
);

-- A lead belongs to exactly one of Branch or Region, never both, never neither.
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_assignment_check" CHECK (
    ("branchId" IS NOT NULL AND "regionId" IS NULL) OR
    ("branchId" IS NULL AND "regionId" IS NOT NULL)
);
