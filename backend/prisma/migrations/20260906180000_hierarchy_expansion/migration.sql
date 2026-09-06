-- Full-Hierarchy Expansion (GM -> ZM -> RM -> BM), Phase 1: additive-only
-- schema changes. Adds zone-level scoping to User/Lead/VoiceUpdateSession
-- and a generic recipient to FollowUpTarget, so follow-ups and voice
-- updates can flow across the whole org hierarchy, not just RM<->BM.
--
-- NOTE ON PROVENANCE: hand-authored to match what
-- `npx prisma migrate dev --name full_hierarchy_expansion` would generate,
-- because this environment has no DATABASE_URL / live DB access (same
-- situation documented in the init migration's header). Before relying on
-- this, run `npx prisma migrate dev` once you have DB access — Prisma
-- will detect the schema already matches and register it (or regenerate
-- an equivalent migration) rather than reissuing these statements.
--
-- SAFETY: every change is additive. No column is dropped, renamed, or
-- narrowed — the only "shrinking" changes are DROP NOT NULL (making a
-- column optional), which cannot destroy existing data. Run the
-- verification queries at the bottom after applying this to confirm the
-- 13 users / 21 leads / 10 branches / existing follow-ups all survive
-- untouched and are correctly backfilled.

-- ---------------------------------------------------------------------
-- 1. User.zoneId — mirrors the existing Region.rm / User.regionId 1:1
--    pattern.
-- ---------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "zoneId" TEXT;
CREATE UNIQUE INDEX "users_zoneId_key" ON "users"("zoneId");
ALTER TABLE "users" ADD CONSTRAINT "users_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 2. Lead.zoneId — mirrors how branchId/regionId are already handled
--    (nullable column + index + FK). Backfilled below by resolving each
--    lead's existing branchId -> Branch.regionId -> Region.zoneId, or
--    regionId -> Region.zoneId directly where branchId is null.
-- ---------------------------------------------------------------------
ALTER TABLE "leads" ADD COLUMN "zoneId" TEXT;
CREATE INDEX "leads_zoneId_idx" ON "leads"("zoneId");
ALTER TABLE "leads" ADD CONSTRAINT "leads_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "leads" l
SET "zoneId" = COALESCE(
    (SELECT r."zoneId" FROM "branches" b JOIN "regions" r ON r."id" = b."regionId" WHERE b."id" = l."branchId"),
    (SELECT r."zoneId" FROM "regions" r WHERE r."id" = l."regionId")
)
WHERE l."zoneId" IS NULL AND (l."branchId" IS NOT NULL OR l."regionId" IS NOT NULL);

-- ---------------------------------------------------------------------
-- 3. VoiceUpdateSession: branchId becomes optional; add regionId/zoneId.
--    Exactly one of the three is set per session going forward (BM ->
--    branchId, RM -> regionId, ZM -> zoneId). Existing rows are all
--    BM-created, so branchId stays as-is and regionId/zoneId need no
--    backfill (they remain NULL, correctly meaning "not set").
-- ---------------------------------------------------------------------
ALTER TABLE "voice_update_sessions" ALTER COLUMN "branchId" DROP NOT NULL;
ALTER TABLE "voice_update_sessions" ADD COLUMN "regionId" TEXT;
ALTER TABLE "voice_update_sessions" ADD COLUMN "zoneId" TEXT;
CREATE INDEX "voice_update_sessions_regionId_idx" ON "voice_update_sessions"("regionId");
CREATE INDEX "voice_update_sessions_zoneId_idx" ON "voice_update_sessions"("zoneId");
ALTER TABLE "voice_update_sessions" ADD CONSTRAINT "voice_update_sessions_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voice_update_sessions" ADD CONSTRAINT "voice_update_sessions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 4. FollowUpTarget: branchId becomes optional (legacy/branch-shortcut,
--    still populated whenever the recipient is a BM); add a generic
--    recipientUserId/recipientRole/recipientLabel so region/zone-level
--    targets are representable. NOT NULL -> nullable is data-safe; the
--    existing FK constraint already permits NULL and needs no change.
-- ---------------------------------------------------------------------
ALTER TABLE "follow_up_targets" ALTER COLUMN "branchId" DROP NOT NULL;

ALTER TABLE "follow_up_targets" ADD COLUMN "recipientUserId" TEXT;
ALTER TABLE "follow_up_targets" ADD COLUMN "recipientRole" "Role";
ALTER TABLE "follow_up_targets" ADD COLUMN "recipientLabel" TEXT;
CREATE INDEX "follow_up_targets_recipientUserId_idx" ON "follow_up_targets"("recipientUserId");
ALTER TABLE "follow_up_targets" ADD CONSTRAINT "follow_up_targets_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing target's recipient is that branch's BM (the
-- only kind of target that existed before this migration).
UPDATE "follow_up_targets" t
SET "recipientUserId" = u."id",
    "recipientRole" = 'BM',
    "recipientLabel" = 'Branch ' || b."name"
FROM "branches" b
JOIN "users" u ON u."branchId" = b."id"
WHERE t."branchId" = b."id" AND t."recipientUserId" IS NULL;

-- ---------------------------------------------------------------------
-- Verification (run manually after applying, per Phase 1/5 of the plan):
--
--   SELECT count(*) FROM users;    -- expect 13 (or current real count)
--   SELECT count(*) FROM leads;    -- expect 21 (or current real count)
--   SELECT count(*) FROM branches; -- expect 10 (or current real count)
--
--   -- Every lead that had a branch/region should now have a zoneId:
--   SELECT count(*) FROM leads
--     WHERE (branchId IS NOT NULL OR regionId IS NOT NULL) AND zoneId IS NULL;
--   -- expect 0
--
--   -- Every existing follow-up target should now have a backfilled recipient:
--   SELECT count(*) FROM follow_up_targets WHERE "recipientUserId" IS NULL;
--   -- expect 0 (every pre-existing row had a branchId with a BM assigned)
-- ---------------------------------------------------------------------
