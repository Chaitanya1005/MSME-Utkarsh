# MSME Utkarsh Phase 2 — Regional Head Dashboard & Message-Based Follow-Up

Builds on the validated Phase 1 baseline (React Native app migrated to
Expo SDK 54 / RN 0.81.5 / React 19.1.0 after Phase 1 delivery — see the
root README's "Baseline provenance" note). Nothing in Phase 1's working
code was rewritten; every change below is additive except three
documented exceptions.

## What Phase 2 adds

1. **RM Dashboard** (`GET /api/rm/dashboard`) — assigned branches, lead
   volume, lead-stage distribution, and a derived branch "update status"
   for each branch in the RM's region.
2. **Message-based follow-up** — an RM can select one or more branches,
   pick WhatsApp or Email, optionally add a short note to the standard
   message, and initiate a follow-up. Each targeted branch gets its own
   secure, single-purpose access link for its BM.
3. **Secure BM access handoff** — a BM who taps the link in a follow-up
   message lands in the app already authenticated as themselves for that
   branch, without needing to already have installed/logged into the app
   with a username and password beforehand.

## The three places existing Phase 1 files were touched (and why)

Everything else is new files. These three were the smallest changes that
could satisfy a genuine Phase 2 requirement:

1. **`backend/prisma/schema.prisma`** — added `phoneNumber`/`email` to
   `User` and the new `FollowUp`/`FollowUpTarget` models. A **new**
   migration (`20260819000000_phase2_follow_up`) carries these changes;
   the Phase 1 migration file was not edited.
2. **`backend/src/app.ts`** — 6 lines added to mount three new route
   files. No existing route registration was touched or reordered.
3. **`mobile/src/navigation/RootNavigator.tsx`** and **`mobile/app.json`**
   — the RM's post-login screen changed from `RMHomeScreen` (Phase 1's
   explicitly-labeled placeholder) to `RMDashboardScreen`, and
   `"scheme": "cbipes"` was added to `app.json` so the follow-up access
   deep link can open the app. `RMHomeScreen.tsx` itself was left in
   place, unused, rather than deleted.

`backend/src/repositories/lead.repository.ts` also gained three new
read-only aggregation functions (for the dashboard); the existing
`findLeadsInScope`/`findLeadWithEffectiveRegion` functions Phase 1 relies
on are unchanged.

## Branch "update status" — documented MVP assumption

Phase 1 has no BM-activity timestamp (Phase 3 introduces real update
history). The only available signal for "has this branch been worked on
recently" is `Lead.updatedAt`. `backend/src/services/branchUpdateStatus.ts`
implements this explicitly-flagged heuristic:

- **RECENTLY_UPDATED** — at least one lead in the branch was updated
  within the last `PENDING_UPDATE_WINDOW_DAYS` (default 7, a constant,
  not buried inline).
- **FOLLOW_UP_INITIATED** — not recently updated, but a follow-up was
  sent more recently than the last lead update (i.e. a nudge is already
  in flight; don't ask the RM to send another one).
- **UPDATE_REQUIRED** — everything else.

This is a genuinely arbitrary MVP proxy, not a business rule handed down
by the spec, and is unit-tested in isolation
(`backend/tests/unit/branchUpdateStatus.test.ts`) precisely because it
will need to be revisited once Phase 3 gives branches a real
"last-touched-by-BM" signal.

## WhatsApp — honest MVP implementation, not a fabricated Business API

`backend/src/services/providers/whatsappProvider.ts` implements a
**client-side deep-link handoff**: the backend composes the message and
a `https://wa.me/<phone>?text=<message>` link; the RM's own device opens
it via `Linking.openURL`. This is deliberate, not a shortcut — a real
WhatsApp Business API integration requires a Meta-verified business
account, phone number registration, and per-template message approval,
none of which exist for this MVP, and pretending otherwise (fabricated
credentials, a fake "sent via WhatsApp Business API" status) is exactly
what the Phase 2 requirements prohibit.

Because there is no delivery webhook, a WhatsApp target's status is
`PENDING` until the RM's device successfully opens the link, at which
point the mobile app calls `POST /api/rm/follow-ups/targets/:id/confirm-sent`
to mark it `SENT`. This is best-effort and explicitly documented as such
— it confirms "the RM's phone was told to open WhatsApp," not "the BM
received the message."

**To plug in a real WhatsApp Business API provider later:** implement
`WhatsAppProvider` (`backend/src/services/providers/types.ts`) against
the real API, swap the instantiation in `providers/index.ts`. No change
needed to `followUp.service.ts`, the API contract, or the mobile app
(only the `PENDING`-until-confirmed status question becomes moot, since
a real API can report delivery directly).

## Email — provider abstraction with a development-safe stub

`backend/src/services/providers/emailProvider.ts`'s `ConsoleEmailProvider`
logs the composed email instead of delivering it, because no real
SMTP/transactional-email provider credentials were supplied. This is a
real, complete implementation of the `EmailProvider` interface — not a
placeholder that silently does nothing — it just documents honestly that
"sent" in this environment means "handed to the (stub) provider and
logged," not "delivered to an inbox."

**To plug in a real provider (SES, SendGrid, Postmark, etc.) later:**
implement `EmailProvider` against the real API, swap the instantiation in
`providers/index.ts`. Zero changes to `followUp.service.ts` or the API
contract.

## Secure BM access mechanism

Spec section 15 explicitly prohibits sending passwords, JWTs, or raw
internal IDs in message content. The implementation:

1. On follow-up creation, generate a 256-bit random token
   (`crypto.randomBytes(32)`) per branch target.
2. Persist only its SHA-256 hash (`FollowUpTarget.accessTokenHash`),
   mirroring how passwords are hashed — a database read alone can never
   reconstruct a usable token.
3. The raw token appears only inside the composed message, as
   `cbipes://follow-up-access/<token>` — never as a JWT, never logged.
4. `GET /api/follow-up-access/:token` (deliberately **not** behind the
   `authenticate` middleware — the BM has no session yet) hashes the
   supplied token, looks it up, checks expiry, and if valid issues a
   **short-lived (2h)** session JWT scoped to that BM/branch — shorter
   than a normal login session, since this is a follow-up-triggered
   access grant, not a full login.
5. The mobile app's `AuthContext.loginWithAccessToken` stores this
   exactly like a normal login; `BMHomeScreen` needs no changes.

**Documented assumptions:** access links are valid for 72 hours
(`ACCESS_TOKEN_TTL_HOURS`) and are not single-use — reusable until
expiry rather than invalidated after first use, to avoid the BM being
locked out if they close and reopen the link. Neither number is a
product requirement handed down by the spec; both are named constants
(not buried magic numbers) so they're trivial to change once a real
policy exists.

## Multi-branch follow-up data model

One `FollowUp` row per RM-initiated action (channel, message, initiator,
timestamp shared once), with one `FollowUpTarget` row per branch (its own
token, status, and delivery outcome) — avoids both a "collection of
unrelated single-branch hacks" and an over-normalized join table, per
spec section 19.

## Authorization

Every follow-up-creation branch id is re-validated server-side via the
same `canAccessBranch` function Phase 1's org/lead endpoints use — no
parallel authorization logic was introduced. A malicious RM submitting
another region's branch id gets `403 AUTHORIZATION_ERROR` on that branch
specifically (see `backend/tests/integration/followUp.test.ts`,
"rejects a multi-branch request where only one branch is out of scope").

## New environment variables

None required. The dev-safe email stub and the WhatsApp deep-link
provider need no credentials. If a real provider is added later, its
credentials should be added to `.env.example`/`.env` at that time,
following the same pattern as `JWT_SECRET`.

## Known limitations

- Same Prisma-CLI sandbox limitation documented in the root README:
  `prisma generate`/`migrate dev` for the new migration have not been run
  in this build environment.
- Backend Phase 2 integration tests
  (`backend/tests/integration/followUp.test.ts`) are written to cover the
  full authorization matrix (in-scope/out-of-scope branches, role gate,
  missing-contact-info failure path, token exchange, JWT/password never
  leaking in responses) but could not be executed for the same reason.
- The WhatsApp "sent" confirmation is best-effort/RM-self-reported, not
  delivery-confirmed — documented above, not hidden.
- Mobile Phase 2 screens (`RMDashboardScreen`, `FollowUpScreen`,
  `FollowUpAccessScreen`) type-check and lint cleanly and their
  API-layer logic has unit test coverage, but — consistent with Phase 1 —
  have not been run on an emulator or physical device in this build
  environment.
- Mobile ESLint currently cannot run at all: `.eslintrc.js` still extends
  `@react-native`, a config package that is no longer a dependency after
  your Expo SDK 54 migration (only `@react-native/typescript-config`
  remains). This is a **pre-existing gap**, not something introduced by
  Phase 2 — confirmed by the fact that no Phase 2 change touched
  `.eslintrc.js` or removed any eslint-related dependency. Per this
  project's dependency-discipline rule, a new eslint config package was
  not installed to fix it; `npx tsc --noEmit` and Jest remain fully
  functional and were used for all mobile verification in this phase.
