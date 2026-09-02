# MSME Utkarsh Phase 1 — Scope, Exclusions, and Assumptions

## In scope (implemented)

- React Native (TS) mobile app: login screen, role-aware foundation
  screens for RM and BM, all data fetched from the real backend API.
- Express (TS) REST API: authentication, organization scope, lead
  listing/detail, all backed by PostgreSQL via Prisma.
- Hierarchical data model: Central Office → Zone → Region → Branch →
  Lead, with region-level leads supported.
- MSME Utkarsh's own five-stage pipeline (`INTERESTED → CONTACTED →
  APPLICATION → APPROVAL → CONVERSION`) as a field on `Lead`, kept
  structurally separate from source/LMS status fields.
- Username + password authentication, bcrypt password hashing, JWT
  sessions.
- Server-side authorization enforced by role AND organizational scope,
  independent of the mobile client, with a documented, testable
  authorization test matrix.
- Centralized error handling, request validation (zod), consistent API
  response envelope, basic request logging (no secrets/PII logged).
- Reproducible local setup: Prisma migrations + a documented seed script.
- Automated tests: unit tests for authorization/password/JWT logic
  (executed, all passing), integration tests for auth/authorization/leads
  endpoints (written, pending execution against a real Postgres instance
  — see root README "Known limitations").

## Explicitly out of scope (deferred to later phases)

Per the original specification, none of the following were built:

- RM dashboard, performance analytics, branch follow-up workflows
- BM manual/bulk lead updates, update history
- WhatsApp, Email, or call/telephony integration of any kind
- Voice recording, speech-to-text, AI extraction, review/confirmation workflows
- Production LMS integration or synchronization
- Campaign management (CRUD, scheduling, analytics)
- User/organization administration UI, transfer management
- Offline mode / local sync / conflict resolution
- Production deployment of any kind

If you find yourself needing any of the above to make Phase 1 "feel more
complete," that is a signal to stop and flag it rather than build it —
per the original spec's explicit instruction.

## Documented assumptions

Where the spec required a decision but didn't hand down a business rule,
here is what was chosen and why — flagged so Phase 2+ can revisit deliberately:

1. **Source-status → MSME Utkarsh-stage mapping in seed data is arbitrary.**
   There is no real business rule provided for how `sourceLeadStatus` /
   `sourceCategorization` / `sourceStageProgress` should map to
   `cbiPesStage`. The seed script (`prisma/seed.ts`) assigns
   plausible-looking values purely so the field is exercised in demo
   data; this must not be read as a real mapping.
2. **Logout is stateless.** No server-side session/token store or
   blocklist exists in Phase 1 — logout is a client-side "forget the
   token" action. This was the simplest option consistent with "keep
   auth state management intentionally simple" (spec section 14); a
   token blocklist would be a reasonable Phase 6 hardening addition if
   immediate server-side revocation becomes a requirement.
3. **Unauthorized lead access returns 403, not 404.** A lead that exists
   but is outside the caller's scope returns `403 AUTHORIZATION_ERROR`
   rather than `404 NOT_FOUND`. This was chosen for consistency (all
   other scope violations in this API return 403) over "hiding"
   existence via 404, which felt like an arbitrary inconsistency to
   introduce without a stated requirement either way.
4. **Excel workbook was not available.** `MMZO LEADS.xlsx` was not
   provided during this build; the lead schema is derived from the
   column list documented in the original spec instead. If the real
   workbook has different column names, types, or validation rules
   (referenced in the original spec as present "for some fields"),
   reconcile the schema against it before Phase 2.
5. **Region-level leads carry no zone denormalization.** A lead's zone is
   always derivable through `branch → region → zone` or `region → zone`,
   and is not stored redundantly on `Lead` itself, per the spec's
   preference against unnecessary duplication.
