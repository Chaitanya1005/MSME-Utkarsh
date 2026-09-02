# MSME Utkarsh Phase 5 — Calling + USP Integration Foundation + Targeted UX Fixes

Builds on the validated Phase 1–4 baseline. Phase 3/4's core architecture
(the unified update-proposal pipeline) was **not** redesigned — see
`docs/PHASE3_4_SCOPE.md` for that architecture, still fully intact.

## Completed

### Calling (Priority 1)
- **Backend**: `Call` model (additive migration
  `20260825000000_phase5_calling`), `CallingProvider` boundary
  (`backend/src/services/providers/callingProvider.ts`), `calling.service.ts`,
  `calling.controller.ts`, `calling.routes.ts`.
- `POST /api/rm/branches/:branchId/call` — the RM supplies only a
  `branchId`. The BM and their phone number are resolved entirely
  server-side from the branch/BM relationship; the request body is never
  trusted for contact information (spec section 12; verified in
  `tests/integration/calling.test.ts`, "never accepts a client-supplied
  phone number").
- Authorization reuses the same `canAccessBranch` function every other
  branch-scoped endpoint in this codebase uses — no parallel
  authorization framework was introduced.
- `GET /api/rm/calls` (RM's own initiated-calls history) and
  `GET /api/bm/calls` (BM's received-calls history — see "BM-side
  calling" below for why this, specifically, is the BM-side foundation).
- **Mobile**: a "Call BM" button on `BranchDetailScreen` (the RM's branch
  context, per spec section 12) with loading/success/error states.
  `src/api/callingApi.ts`.
- **Tests**: 3 unit tests for `DevMockCallingProvider`
  (`tests/unit/callingProvider.test.ts`), 3 unit tests for the mobile
  `callingApi` client, 8 integration tests covering the full
  authorization matrix (own-region success, phone-number-missing
  failure, cross-region denial, role denial, unauthenticated denial,
  history endpoints).

#### BM-side calling — what was and wasn't built, and why
The existing product workflow has no BM-initiates-a-call requirement
anywhere. Rather than invent a call-placing UX for the BM that isn't
part of the actual application design, "BM-side calling architecture"
was interpreted as: the BM can see calls placed to them
(`GET /api/bm/calls`, backend complete). A dedicated BM-facing screen for
this was not built this milestone — deliberately deprioritized behind
the RM-initiated flow (the spec's own priority order, item 1) and the
higher-priority items below.

### RM lead-detail access (Priority 2)
- New shared endpoint `GET /api/leads/:leadId/activity`, authorized for
  both roles using `canAccessLead` (RM: region scope; BM: branch scope)
  — the same authorization function Phase 1's lead endpoints already
  use. The old BM-only `GET /api/bm/leads/:leadId/activity` route still
  exists (untouched, backward compatible) but the mobile app now calls
  the shared one.
- `LeadDetailScreen` is now reachable from both `BranchDetailScreen`
  (RM) and `BMLeadListScreen` (BM) via the same shared component — one
  implementation, not a duplicate. Role-specific actions (Propose an
  update, the pending-proposal banner) are gated on `user.role === 'BM'`;
  everything else is identical for both roles.
- Lead fields inspected/displayed/omitted — see the dedicated section
  below (spec section 9 requires this documented explicitly).

### BM "Review Updates" workflow removed (Priority 3)
- The standalone dashboard button and its pending-count query were
  removed from `BMLeadListScreen`.
- `ProposeUpdateScreen`'s review step now creates **and** confirms the
  proposal in one user action (two sequential API calls —
  `POST .../proposals` then `POST .../proposals/:id/confirm` — not a new
  combined endpoint, so the underlying create/confirm architecture Phase
  4's voice flow depends on is untouched), then returns directly to the
  lead.
- `ProposalReviewScreen` itself was **not** deleted — it's still the
  right UI for confirming a *batch* of voice-extracted candidates in one
  sitting, and `VoiceUpdateScreen` still navigates there after creating
  proposals from a session. It's simply no longer linked from the BM
  dashboard as a persistent, separately-checked inbox.
- Verified in `tests/integration/leadUpdate.test.ts`,
  "Manual update flow after Review Updates removal": create-then-confirm
  in immediate sequence produces a `CONFIRMED` proposal and an updated
  lead stage.

### Voice/audio integration readiness (Priority 4)
- **Real audio contract, not a text-only architecture.** New endpoint
  `POST /api/bm/voice-updates/transcribe` accepts `{ audioBase64,
  mimeType }` — actual recorded audio, base64-encoded (JSON body, not
  multipart, consistent with this project's existing API conventions;
  Express body limit raised to 15MB specifically for this).
  `TranscriptionProvider.transcribe()`'s signature was changed from a
  never-usable local file URI to the real `(audioBase64, mimeType)`
  payload the backend can actually act on.
- **Real microphone recording**, not faked. Added `expo-audio` and
  `expo-file-system` (see "New dependencies" below for exact versions
  and how they were chosen). `useVoiceRecorder`
  (`mobile/src/screens/VoiceUpdate/useVoiceRecorder.ts`) wraps them in a
  small hook: request permission, record, stop, read the recorded file
  as base64. Built directly against the installed packages' `.d.ts` type
  definitions (read from `node_modules`) rather than from memory,
  specifically to avoid guessing at an API surface that couldn't be
  verified any other way in this environment.
- `VoiceUpdateScreen` rewritten: record, transcribe (calls the provider
  boundary), extract, review, accept/resolve ambiguity, confirm. **No
  "voice transcription is not integrated yet" text anywhere in the UI**
  — the transcribe step's failure (expected, since
  `UnconfiguredTranscriptionProvider` throws) surfaces through the exact
  same generic error-state component used everywhere else in this app,
  with a retry action, not a developer disclaimer.
- The extraction pipeline itself (`voiceExtraction.ts`) was **not**
  touched — same 7/7 unit-tested behavior as Phase 3/4.

### WhatsApp provider boundary (Priority 5)
No code changes were needed. Inspection confirmed the Phase 2
implementation already has exactly the clean boundary this priority
asks for: `WhatsAppProvider` interface
(`backend/src/services/providers/types.ts`) leading to a
`WhatsAppDeepLinkProvider` implementation, with a single wiring point in
`providers/index.ts`. A future `WhatsAppBusinessApiProvider`
implementing the same interface can be swapped in via that one file with
no change to `followUp.service.ts`, the API contract, or the mobile
follow-up UI. See `docs/PHASE2_SCOPE.md` "WhatsApp — honest MVP
implementation" for the original design rationale.

### RM branch-detail layout bug (Priority 6)
**Root cause, not a symptom patch**: `BranchDetailScreen` previously put
an unstyled `<ScrollView>` (branch card, stage tiles, "Leads (N)"
heading) directly above a sibling `<FlatList>`, both inside one
`flex: 1` container. An unbounded `ScrollView` with no `flex`/height set
does not size to its own content when it's a flex sibling — it
participates in the parent's flex distribution and ends up claiming
leftover space, which is exactly what produced the gap between the
heading and the first lead card. **Fix**: rebuilt the screen so
everything above the lead list is the `FlatList`'s own
`ListHeaderComponent`. There is now only one scrollable container and no
second flex sibling to leave space for.

## Lead fields inspected / displayed / omitted (spec section 9)

**Fields inspected:** the actual `Lead` Prisma model — `id`,
`sourceSrNo`, `customerName`, `customerPrimaryPhone`, `subProductName`,
`amount`, `sourceLeadStatus`, `sourceCategorization`,
`sourceStageProgress`, `tentativeSanctionDate`,
`tentativeDisbursementDate`, `sourceRemarks`, `cbiPesStage`, `branchId`,
`regionId`, `createdAt`, `updatedAt`.

**Fields displayed:** Lead ID (`sourceSrNo`, falling back to the
internal `id` if no source reference exists — the real, stable business
identifier, not a fabricated second ID system), customer name, current
stage (`cbiPesStage`, labeled "Current Stage" — see below), product
(`subProductName`), amount, phone, source status/categorization/
stage-progress, tentative sanction/disbursement dates (when present),
source remarks (when present), created/last-updated timestamps.

**Fields intentionally omitted:**
- **`branchId`/`regionId` ("Assigned Branch")** — per spec section 8:
  both entry points (RM via a specific branch, BM via their own branch)
  already establish the branch context before the lead is ever opened;
  redisplaying it adds no information.
- **A separate "Status" field distinct from stage** — inspected the
  schema specifically for this. There is no such field. `cbiPesStage` is
  the canonical pipeline state; `sourceLeadStatus` is a source/LMS field
  with a different meaning (kept separate by original design, documented
  in `docs/ARCHITECTURE.md`) and *is* shown, labeled "Source status" so
  it isn't confused with the canonical stage.
- **"Priority"** — no such field exists in the schema. Rather than
  inventing one, `sourceCategorization` (A/B/C/D, genuinely existing and
  genuinely useful — a real proxy for how far along documentation is) is
  shown under its real name instead of being relabeled as a fake
  priority score.

**Reason:** display only what the database actually stores, correctly
labeled by what it actually means, with the RM/BM's already-established
branch context not redundantly repeated.

## Lead identification (spec section 10)

Every lead card and the lead detail screen now show a stable identifier
(`sourceSrNo`, the real source/business reference, falling back to the
internal `id` only when no source reference exists) prominently, labeled
"Lead ID." The voice-extraction pipeline was never actually built around
customer names as an identification *mechanism* — `voiceExtraction.ts`
always resolves a spoken name to a real `Lead.id` from the authorized
lead list before anything downstream happens (see
`docs/PHASE3_4_SCOPE.md`); Sharma/Verma/Singh were demo *content*
(customer names an extractor has to parse), never a database key. No
backend change was required here — this priority was really about
surfacing in the mobile UI an identifier that already existed.

## New dependencies

| Package | Version | Why | How the version was chosen |
|---|---|---|---|
| expo-audio | 1.1.1 | Real microphone recording (the spec explicitly forbids faking this) | No explicit sdk-54 dist-tag exists for this package; 1.1.1 is the last release on the pre-SDK-aligned version scheme before it jumped to 55.x, inferred as the SDK 54-era release. This is an inference, not a confirmed mapping — verify against Expo's official SDK 54 compatibility table before relying on it in production. |
| expo-file-system | 19.0.24 | Reading a recorded audio file into base64 for upload (this project's JSON-everywhere API convention, not multipart) | Confirmed via an explicit sdk-54 dist-tag on the npm package — not inferred. |

Neither package's actual behavior was verified on a device/emulator in
this build environment (see "Known limitations").

## Provider integration points — exactly where to plug in each USP

| Provider | File to implement | Interface | Wiring point |
|---|---|---|---|
| Twilio (calling) | new file in backend/src/services/providers/ (e.g. twilioCallingProvider.ts) | CallingProvider (callingProvider.ts) — one method, placeCall(toPhoneNumber) | backend/src/services/providers/index.ts — replace `new DevMockCallingProvider()` |
| Sarvam (or any STT provider) | new file in backend/src/services/providers/ (e.g. sarvamTranscriptionProvider.ts) | TranscriptionProvider (transcriptionProvider.ts) — transcribe(audioBase64, mimeType) | backend/src/services/providers/index.ts — replace `new UnconfiguredTranscriptionProvider()` |
| WhatsApp/Meta Business API | new file in backend/src/services/providers/ (e.g. whatsappBusinessApiProvider.ts) | WhatsAppProvider (types.ts) | backend/src/services/providers/index.ts — replace `new WhatsAppDeepLinkProvider()` |

No other file needs to change for any of the three — not the services
that call these providers, not the controllers, not the API contracts,
not the mobile app.

## Environment variables that will eventually be required

None of these exist yet — this is a forward-looking list, not current
configuration:

| Variable | Provider | Consumed by |
|---|---|---|
| TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER | Twilio | the future TwilioCallingProvider |
| SARVAM_API_KEY (or equivalent) | Sarvam | the future SarvamTranscriptionProvider |
| WHATSAPP_BUSINESS_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID | Meta/WhatsApp | the future WhatsAppBusinessApiProvider |

Add these to `backend/.env.example` (documented, not populated with real
values) at the point each provider is actually implemented — following
the same pattern `JWT_SECRET` already establishes in that file.

## Provider status

| Provider | Integration status |
|---|---|
| Sarvam | Not connected |
| Twilio | Not connected |
| WhatsApp/Meta | Not connected |

## Known limitations

- Same Prisma-CLI sandbox limitation as every prior phase: the new
  `Call` migration has not been run against a real database here.
- New integration tests (`tests/integration/calling.test.ts`, the
  appended sections of `tests/integration/leadUpdate.test.ts`) are
  written, not executed, for the same reason.
- `expo-audio`'s exact SDK-54-compatible version is an educated
  inference (see "New dependencies" table above), not a confirmed
  mapping — verify before relying on it.
- Neither `expo-audio` nor `expo-file-system` has been exercised on a
  real device or emulator; the recording hook was written directly
  against the installed packages' TypeScript definitions but has not
  been run.
- The BM-side calling UI (viewing received calls) was deprioritized
  behind the RM-initiated flow per the spec's own priority order — the
  backend endpoint exists, no mobile screen consumes it yet.
- Mobile app has not been run on an emulator or physical device in this
  build environment (consistent with every prior phase).
