# MSME Utkarsh Phase 3/4 — BM Lead Management & AI Voice Updates

Builds on the validated Phase 1/2 baseline (see `docs/PHASE2_SCOPE.md`
"Baseline provenance" — that baseline was itself real, continued local
development, confirmed via git history before this milestone began).

## What Phase 3/4 adds

1. **RM improvements**: multi-branch selection (Select All / Select
   Requiring Update / individual toggle / "Selected: X of Y"), and a
   branch-detail screen.
2. **Phase 3 — BM lead management**: lead list, lead detail, manual
   update proposals, mandatory review-before-persistence, activity
   history.
3. **Phase 4 — AI voice updates**: transcript submission, deterministic
   multi-lead extraction, ambiguity resolution, and the same
   review/confirm/persist pipeline as manual updates.

## The core architectural invariant — actually enforced, not just described

Every lead-stage change, regardless of source, passes through exactly
one persistence function:
`backend/src/repositories/leadUpdate.repository.ts#confirmProposalTransaction`.
It is the *only* code in this codebase that writes `Lead.cbiPesStage`.
Both `leadUpdate.service.ts#createManualProposal` (Phase 3) and
`voiceUpdate.service.ts#createProposalsFromSession` (Phase 4) funnel into
the same `createProposalFromAnySource` function to create a `PENDING`
`LeadUpdateProposal` — neither one has any code path that mutates a lead
directly. This isn't a design intention stated in a comment somewhere; it
is structurally true — grep the repository layer and
`confirmProposalTransaction` is the only `lead.update` call that touches
`cbiPesStage`.

## AI provider boundary — what's real and what's honestly stubbed

**Real, and unit-tested (`backend/tests/unit/voiceExtraction.test.ts`,
7/7 passing):** `voiceExtraction.ts` is a deterministic, rule-based
extractor. It splits a transcript into clauses, matches each clause
against the BM's own authorized leads by name substring, extracts a
target `PipelineStage` from a keyword dictionary (including the Hinglish
terms from the spec's own example utterance), and — critically — flags
genuine ambiguity (`NO_LEAD_MATCH`, `MULTIPLE_LEAD_MATCH`,
`NO_STAGE_MATCH`) instead of guessing. It never returns a lead ID outside
the branch-scoped list it was given.

**Honestly stubbed:** this is *not* a large language model. No LLM API
credentials were supplied for this project, and this project's own
instructions are explicit that a stub must not be presented as a working
production AI capability. What a real LLM-based extractor would add over
this implementation: handling paraphrases, synonyms beyond the fixed
keyword list, and multi-clause sentences without explicit punctuation
boundaries. The provider boundary
(`backend/src/services/providers/transcriptionProvider.ts`) is exactly
where such an upgrade would plug in — replacing `voiceExtraction.ts`'s
role (or wrapping it) without touching `voiceUpdate.service.ts`, the API
contract, or anything downstream of "candidates".

**Speech-to-text is not connected at all.**
`UnconfiguredTranscriptionProvider.transcribe()` throws immediately with
a clear message — no fake transcription, no silent fallback that pretends
to have understood audio it never processed. The mobile
`VoiceUpdateScreen` therefore accepts BM-typed/pasted transcript text as
the honest MVP way to exercise the real extraction pipeline. **Actual
microphone recording UI (e.g. via `expo-audio`) was not implemented in
this milestone** — see "Known limitations" below. To connect a real
provider later: implement `TranscriptionProvider`, wire it in
`providers/index.ts`, and give the mobile app a record button that
uploads audio and calls a new `POST /api/bm/voice-updates/transcribe`
endpoint before calling `/extract` — no other part of the pipeline
changes.

## Database changes

Additive migration `20260824000000_phase3_4_lead_updates` (the Phase 1
and Phase 2 migrations are untouched):

- `User.phoneNumber`/`email` (Phase 2) — unchanged.
- **`LeadUpdateProposal`** — one row per proposed change, from either
  source. `status: PENDING | CONFIRMED | REJECTED`. `voiceSessionId` and
  `transcriptExcerpt` are populated only for `source = VOICE_AI`.
- **`LeadActivity`** — the immutable audit trail. Written exactly once,
  only when a proposal is confirmed, in the same transaction as the
  `Lead.cbiPesStage` update. A `REJECTED` proposal never produces an
  activity row — rejected proposals are not part of a lead's real
  history.
- **`VoiceUpdateSession`** — one row per BM voice interaction (transcript
  + status), so multiple `LeadUpdateProposal` rows can trace back to the
  single interaction that produced them (spec section 7's "multiple lead
  updates from one voice interaction").

Chose three tables, not more: a `LeadActivity`-only design would have
conflated "proposed" with "happened," and a table per AI-processing-stage
would have been unnecessary complexity for what `VoiceUpdateSession`
already captures in one row.

## Why no new branch-detail endpoint

`BranchDetailScreen` (mobile) composes its view entirely from two
existing endpoints: `GET /api/org/branches/:branchId` (Phase 1) and
`GET /api/leads?branchId=` (Phase 1, already authorization-scoped). No
backend change was needed for RM branch detail — a new endpoint would
have duplicated logic the lead-listing endpoint already has.

## API additions

All under `/api/bm/` (BM-only, enforced via `requireRole('BM')` plus a
per-resource branch-ownership check — see `docs/API.md` for the full
list): `POST/GET /api/bm/leads/:leadId/proposals`,
`GET /api/bm/leads/:leadId/activity`, `GET /api/bm/proposals`,
`POST /api/bm/proposals/:id/confirm`,
`POST /api/bm/proposals/confirm-batch`,
`POST /api/bm/proposals/:id/reject`,
`POST /api/bm/voice-updates/extract`,
`POST /api/bm/voice-updates/sessions/:id/proposals`.

## Mobile changes

- `RMDashboardScreen` (existing Phase 2 file, minimally extended): Select
  All / Select Requiring Update / individual checkbox selection, tap now
  opens branch detail instead of toggling selection.
- New: `BranchDetailScreen` (RM), `BMLeadListScreen` (supersedes
  `BMHomeScreen`, left in place unused — same pattern as
  `RMHomeScreen`→`RMDashboardScreen`), `LeadDetailScreen`,
  `ProposeUpdateScreen` (form → mandatory review step → creates a
  `PENDING` proposal only), `VoiceUpdateScreen` (transcript → AI review
  with ambiguity resolution → creates `PENDING` proposals), and
  `ProposalReviewScreen` — the single confirm/reject screen both the
  manual and voice flows funnel into.
- `RootNavigator` extended with all of the above; no existing screen
  removed.

## Known limitations

- Same Prisma-CLI sandbox limitation as Phase 1/2: the new migration has
  not been run against a real database in this build environment.
- Backend Phase 3/4 integration tests (`tests/integration/leadUpdate.test.ts`)
  are written, covering the full manual + voice + confirm + authorization
  matrix, but not executed here for the same reason.
- **Real microphone recording was not implemented.** `VoiceUpdateScreen`
  accepts typed/pasted transcript text only. Adding real audio capture
  (`expo-audio`, compatible with Expo SDK 54) plus a transcription-upload
  endpoint is the natural next step and was deliberately scoped out of
  this milestone in favor of a fully real, tested extraction/review/
  confirm/persist pipeline downstream of "transcript text exists."
- Mobile screens type-check and lint cleanly (`npx tsc --noEmit` clean,
  full install verified), but — consistent with every prior phase — have
  not been run on an emulator or physical device in this build
  environment.
- The `voiceExtraction.ts` keyword dictionary is intentionally small
  (English + the specific Hinglish terms from the spec's example). A
  real deployment would need this expanded or replaced with a real
  LLM-based extractor behind the same boundary.
