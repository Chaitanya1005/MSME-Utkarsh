# MSME Utkarsh — Voice-to-Lead-Update (real Sarvam integration)

This document covers the specific milestone that connected a real
speech-to-text provider (Sarvam) to the existing Phase 4 voice-update
architecture, and reworked lead identification to use the real database
identifier instead of customer names.

## What changed and why

### 1. Real Sarvam transcription (backend/src/services/providers/sarvamTranscriptionProvider.ts)

Implements the existing `TranscriptionProvider` interface
(`transcriptionProvider.ts`) — no parallel architecture was introduced.
Selected automatically in `providers/index.ts` the moment
`SARVAM_API_KEY` is set in the environment; falls back to the existing
`UnconfiguredTranscriptionProvider` otherwise, with no code change
needed either way.

The SDK call shape matches your working, manually-verified
`test-sarvam-transcription.js`:
`client.speechToText.transcribe({ file: <Uploadable> })`. The one
adaptation: this backend's existing audio contract
(`POST /api/bm/voice-updates/transcribe`, added in Phase 5) receives
base64-encoded audio in a JSON body, not a file on disk — so the decoded
audio is passed to the SDK as an in-memory `Buffer` with
`{ filename, contentType }` metadata (`Uploadable.WithMetadata`,
confirmed by reading the SDK's own `.d.ts` files in `node_modules`, not
assumed) rather than writing a temporary file and using
`fs.createReadStream`.

Handles: missing/empty audio (rejected before ever calling Sarvam),
empty transcript response, and any Sarvam-side failure — all mapped to
clear, safe error responses that never leak the raw provider error or
the API key.

### 2. Lead identification — number-based, not name-based (backend/src/services/voiceExtraction.ts)

Rewrote the matching logic so a spoken lead number (`"lead 101"`,
`"lead number 101"`, `"lead no. 101"`, `"lead #101"`) is matched against
`Lead.sourceSrNo` — the real, existing database identifier — as the
**primary** mechanism. Customer-name matching is retained only as a
fallback for clauses that name no lead number at all. This directly
follows the standing instruction from an earlier milestone: "the
application should not conceptually rely on customer names as the
primary lead identification mechanism... every lead should expose the
same stable identifier used by the database."

If a lead number is spoken but doesn't match any authorized lead, the
extractor does **not** fall back to guessing by name in the same
clause — a stated-but-unresolvable number is reported as not-found, not
silently reinterpreted.

**Seed data change**: `sourceSrNo` values were simplified from
`"SR-1001"`-style to plain `"101"`-style so the demo script ("Lead 101
final state sanctioning par hai...") resolves against real seeded leads
without requiring the BM to speak an awkward `"SR dash one zero zero
one"`. Applied to both `backend/prisma/seed.ts` and
`backend/tests/integration/fixtures.ts` (additive, no other test
assertions depended on the old values).

### 3. Status mapping — negation-aware, not naive keyword matching

The demo transcript specifically includes two phrases that a plain
single-keyword match would get backwards:

- `"application bhejna abhi baaki hai"` — the application has explicitly
  **not** been sent yet. A naive match on the word "application" would
  incorrectly report the `APPLICATION` stage. The extractor checks a
  `bhejna...baaki` negation pattern **before** the generic `APPLICATION`
  rule and correctly resolves this to `CONTACTED` (engaged, but not yet
  applied).
- `"abhi contact karna baaki hai"` — contact has explicitly **not**
  happened yet. A naive match on "contact" would incorrectly report
  `CONTACTED`. The extractor checks a `contact...karna...baaki` negation
  pattern before the generic `CONTACTED` rule and correctly resolves
  this to `INTERESTED` (the pre-contact stage).

Both are unit-tested individually (`tests/unit/voiceExtraction.test.ts`,
"the exact spec demo transcript" — items 104 and 105) precisely because
they're the cases most likely to silently misfire.

No new status values were invented. Every phrase in the dictionary maps
onto the five existing `PipelineStage` values
(`INTERESTED/CONTACTED/APPLICATION/APPROVAL/CONVERSION`) — the only
canonical status this schema has (see `docs/PHASE3_4_SCOPE.md` and
`docs/PHASE5_IMPLEMENTATION.md` for why `sourceLeadStatus` is a
deliberately separate, non-canonical field).

### 4. The combined endpoint — and one disclosed departure from the literal spec

`POST /api/bm/voice-updates/lead-update` (mounted under the existing
`/api/bm/voice-updates` namespace, per this project's existing routing
convention, rather than a new top-level `/api/voice`) orchestrates
transcribe → extract → auto-create-proposals in one call.

**What it does NOT do, deliberately**: write `Lead.cbiPesStage`
directly. It creates `PENDING` `LeadUpdateProposal` rows via the exact
same `createProposalFromAnySource` function every other creation path in
this codebase uses. This is a conscious departure from a literal reading
of "apply the new state... database updated" — reconciled this way
because:

1. This project's own instructions, repeated as *mandatory* across three
   prior milestones, are explicit: "the mobile application must never
   directly mutate database state... only CONFIRMED updates may modify
   the lead."
2. This feature's own instructions say: "If the project already has a
   lead-update service, reuse it... do not bypass existing business
   rules merely to make the demo work."
3. The response is honest about this — each resolved update reports
   `status: "pending_review"`, not `"updated"`, and a BM must still
   confirm each proposal (the existing single or batch confirm
   endpoints) before it actually changes a lead.

If immediate, no-confirmation-step database writes are genuinely wanted
for this specific endpoint going forward, that's a product decision to
make explicitly — not one to make implicitly by building around the
review-before-persistence rule.

### 5. Response shape

```jsonc
{
  "success": true,
  "transcript": "...",
  "languageCode": "hi-IN",
  "requestId": "...",
  "sessionId": "...",
  "updates": [
    {
      "leadNumber": "101",
      "leadId": "clx...",
      "previousStatus": "INTERESTED",
      "proposedStatus": "APPROVAL",
      "proposalId": "clx...",
      "status": "pending_review"
    }
  ],
  "unresolved": [{ "rawClause": "...", "reason": "NO_STAGE_MATCH" }],
  "notFound": [{ "leadNumber": "999", "rawClause": "..." }]
}
```

## Frontend changes

`VoiceUpdateScreen` (Phase 5's real recording UI, untouched otherwise)
now displays the spoken lead number prominently for each candidate
(`Lead 101 — Anil Sharma`, or just `Lead 101` if the extractor hasn't
resolved a name), and a not-found message names the specific unresolved
number rather than a generic "couldn't identify a lead" — surfacing the
same number-based identification the backend now uses. The existing
transcribe → extract → review → accept/resolve → confirm flow itself
was not restructured.

## Files changed

**Backend**: `services/providers/sarvamTranscriptionProvider.ts` (new),
`services/providers/transcriptionProvider.ts` (extended result type),
`services/providers/index.ts` (env-driven wiring), `config/env.ts`
(`sarvamApiKey`), `services/voiceExtraction.ts` (rewritten matching
logic), `services/voiceUpdate.service.ts` (`processVoiceLeadUpdate`),
`controllers/voiceUpdate.controller.ts`, `routes/voiceUpdate.routes.ts`,
`repositories/voiceUpdate.repository.ts` (added `sourceSrNo` to the
selected fields), `prisma/seed.ts` (lead-number simplification),
`.env.example`.

**Mobile**: `types/api.ts` (`spokenLeadNumber` field),
`screens/VoiceUpdate/VoiceUpdateScreen.tsx` (candidate display).

**Database**: none. No schema/migration change was needed — `sourceSrNo`
already existed on `Lead` from Phase 1.

**Tests**: `tests/unit/voiceExtraction.test.ts` (rewritten, 18/18,
including the exact six-phrase demo transcript),
`tests/unit/sarvamTranscriptionProvider.test.ts` (new, 6/6, SDK mocked
per this feature's own instruction not to hit the real API in automated
tests), `tests/integration/voiceLeadUpdate.test.ts` (new, covers the
combined endpoint's validation/authorization/provider-unconfigured path
plus lead-number resolution against real seed data),
`tests/integration/fixtures.ts` (lead-number simplification).

## Environment variables required

| Variable | Required for | Notes |
|---|---|---|
| `SARVAM_API_KEY` | Real transcription | Documented (commented out) in `backend/.env.example`. Never committed. Not exposed to the mobile bundle — Sarvam is called from the backend only. |

## Commands used / results

- `npm install` (backend) — clean.
- `npx eslint "src/**/*.ts" "tests/**/*.ts"` — clean.
- `npx jest tests/unit` — **77/77 passing**.
- `npx tsc --noEmit` / `npm run build` — same pre-existing Prisma-CLI
  sandbox-blocked cascade documented in every prior phase (no
  `@prisma/client` generated types in this build environment); no new,
  independent errors beyond that cascade.
- Mobile: `npm install`, `npx tsc --noEmit` — clean; `npx jest __tests__`
  — **15/15 passing**.

## Manual steps you must perform outside this environment

1. **Run `npx prisma generate && npx prisma migrate dev`** — same
   standing requirement as every prior phase; this sandbox cannot reach
   `binaries.prisma.sh`.
2. **Set `SARVAM_API_KEY`** in your real `.env` (never commit it) to
   actually activate `SarvamTranscriptionProvider` instead of the
   unconfigured fallback.
3. **Run the actual demo end-to-end** on a device with real audio — this
   environment cannot record or play audio, and `test-sarvam-transcription.js`
   was not re-run here (it would require the real key and a real
   `test-audio.wav`, neither available in this sandbox). The unit and
   integration tests exercise every layer of the pipeline except the
   literal Sarvam network call.
4. **Re-seed the database** (`npm run prisma:seed`) if your existing
   database still has the old `SR-1001`-style `sourceSrNo` values, so the
   demo's spoken numbers ("101", "102"...) actually resolve.
