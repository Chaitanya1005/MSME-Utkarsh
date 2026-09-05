-- Replace the 5-value sales-funnel PipelineStage with the bank's 7-stage
-- loan-processing pipeline. Postgres cannot remove enum values in place,
-- so this creates the new type, remaps existing data via a CASE
-- expression, then swaps the type in under the old name.
--
-- Existing-data mapping (best available correspondence, preserves each
-- lead's relative progress rather than resetting everyone to stage 1):
--   INTERESTED  -> LEAD_CONFIRMED
--   CONTACTED   -> DOCUMENTS_RECEIVED
--   APPLICATION -> BRANCH_PROCESSING
--   APPROVAL    -> SANCTIONED
--   CONVERSION  -> DISBURSED
-- (TO_RAC and APPROVED have no equivalent in the old pipeline; no
-- existing row maps to them.)

CREATE TYPE "PipelineStage_new" AS ENUM (
    'LEAD_CONFIRMED',
    'DOCUMENTS_RECEIVED',
    'BRANCH_PROCESSING',
    'SANCTIONED',
    'TO_RAC',
    'APPROVED',
    'DISBURSED'
);

ALTER TABLE "leads" ALTER COLUMN "cbiPesStage" DROP DEFAULT;

ALTER TABLE "leads"
    ALTER COLUMN "cbiPesStage" TYPE "PipelineStage_new"
    USING (
        CASE "cbiPesStage"::text
            WHEN 'INTERESTED' THEN 'LEAD_CONFIRMED'
            WHEN 'CONTACTED' THEN 'DOCUMENTS_RECEIVED'
            WHEN 'APPLICATION' THEN 'BRANCH_PROCESSING'
            WHEN 'APPROVAL' THEN 'SANCTIONED'
            WHEN 'CONVERSION' THEN 'DISBURSED'
        END
    )::"PipelineStage_new";

ALTER TABLE "leads" ALTER COLUMN "cbiPesStage" SET DEFAULT 'LEAD_CONFIRMED';

ALTER TABLE "lead_update_proposals"
    ALTER COLUMN "previousStage" TYPE "PipelineStage_new"
    USING (
        CASE "previousStage"::text
            WHEN 'INTERESTED' THEN 'LEAD_CONFIRMED'
            WHEN 'CONTACTED' THEN 'DOCUMENTS_RECEIVED'
            WHEN 'APPLICATION' THEN 'BRANCH_PROCESSING'
            WHEN 'APPROVAL' THEN 'SANCTIONED'
            WHEN 'CONVERSION' THEN 'DISBURSED'
        END
    )::"PipelineStage_new";

ALTER TABLE "lead_update_proposals"
    ALTER COLUMN "proposedStage" TYPE "PipelineStage_new"
    USING (
        CASE "proposedStage"::text
            WHEN 'INTERESTED' THEN 'LEAD_CONFIRMED'
            WHEN 'CONTACTED' THEN 'DOCUMENTS_RECEIVED'
            WHEN 'APPLICATION' THEN 'BRANCH_PROCESSING'
            WHEN 'APPROVAL' THEN 'SANCTIONED'
            WHEN 'CONVERSION' THEN 'DISBURSED'
        END
    )::"PipelineStage_new";

ALTER TABLE "lead_activity"
    ALTER COLUMN "previousStage" TYPE "PipelineStage_new"
    USING (
        CASE "previousStage"::text
            WHEN 'INTERESTED' THEN 'LEAD_CONFIRMED'
            WHEN 'CONTACTED' THEN 'DOCUMENTS_RECEIVED'
            WHEN 'APPLICATION' THEN 'BRANCH_PROCESSING'
            WHEN 'APPROVAL' THEN 'SANCTIONED'
            WHEN 'CONVERSION' THEN 'DISBURSED'
        END
    )::"PipelineStage_new";

ALTER TABLE "lead_activity"
    ALTER COLUMN "newStage" TYPE "PipelineStage_new"
    USING (
        CASE "newStage"::text
            WHEN 'INTERESTED' THEN 'LEAD_CONFIRMED'
            WHEN 'CONTACTED' THEN 'DOCUMENTS_RECEIVED'
            WHEN 'APPLICATION' THEN 'BRANCH_PROCESSING'
            WHEN 'APPROVAL' THEN 'SANCTIONED'
            WHEN 'CONVERSION' THEN 'DISBURSED'
        END
    )::"PipelineStage_new";

DROP TYPE "PipelineStage";
ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";
