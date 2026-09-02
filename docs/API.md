# MSME Utkarsh Phase 1 — API Reference

Base URL (local dev): `http://localhost:4000/api`

All responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { /* ... */ } }

// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { /* optional */ } } }
```

Authenticated endpoints require `Authorization: Bearer <token>`.

---

## Auth

### `POST /api/auth/login`
- **Auth required:** No
- **Body:** `{ "username": string, "password": string }`
- **Success (200):** `{ token: string, user: { id, username, name, role, regionId, branchId } }`
- **Errors:** `400 VALIDATION_ERROR` (missing/malformed fields), `401 INVALID_CREDENTIALS` (unknown username or wrong password — identical response either way, by design)

### `GET /api/auth/me`
- **Auth required:** Yes
- **Purpose:** Returns the current authenticated user's full profile, including their region or branch.
- **Success (200):** `{ id, username, name, role, region: {id,name}|null, branch: {id,name}|null }`
- **Errors:** `401 AUTHENTICATION_ERROR` (missing/invalid/expired token, or account deactivated since the token was issued)

### `POST /api/auth/logout`
- **Auth required:** Yes
- **Purpose:** Documented endpoint for symmetry with login; JWTs are stateless in Phase 1 so this does not invalidate the token server-side — the mobile app discards its stored token.
- **Success (200):** `{ loggedOut: true }`

---

## Organization

All endpoints below require authentication. Every one of them enforces
the caller's organizational scope server-side (see
`backend/src/services/authorization.ts`); passing an ID outside the
caller's scope returns `403 AUTHORIZATION_ERROR`, not a filtered/empty
result — the caller is told plainly that access was denied.

### `GET /api/org/scope`
- **Purpose:** Returns the caller's own authorized scope. For an RM: their region + every branch in it. For a BM: their branch.
- **Success (200), RM:** `{ role: "RM", region: {id,name,zone}, branches: [{id,name,bm}] }`
- **Success (200), BM:** `{ role: "BM", branch: {id,name,region:{id,name}} }`

### `GET /api/org/regions/:regionId`
- **Access:** RM only, and only their own region.
- **Errors:** `403 AUTHORIZATION_ERROR` if not the caller's region (including for BMs, who have no region access at all), `404 NOT_FOUND` if the region id doesn't exist.

### `GET /api/org/regions/:regionId/branches`
- **Access:** RM only, and only their own region.
- **Success (200):** array of `{ id, name, bm }`.

### `GET /api/org/branches/:branchId`
- **Access:** BM for their own branch; RM for any branch within their region.
- **Errors:** `403 AUTHORIZATION_ERROR`, `404 NOT_FOUND`.

---

## Leads

All endpoints below require authentication and enforce scope
identically to the organization endpoints above.

### `GET /api/leads`
- **Query params:**
  - `page` (default 1), `pageSize` (default 20, max 100)
  - `branchId` (optional) — must be within caller's scope or `403`
  - `regionId` (optional) — must be within caller's scope or `403`
  - `cbiPesStage` (optional) — one of `INTERESTED|CONTACTED|APPLICATION|APPROVAL|CONVERSION`
- **Behavior:** Returns only leads within the caller's authorized scope. For an RM this means every lead under any branch in their region, plus any lead assigned directly to their region. For a BM this means only leads belonging to their branch. Filters can only narrow the result further — they can never be used to see outside the caller's scope.
- **Success (200):** `{ items: Lead[], page, pageSize, total, totalPages }`

### `GET /api/leads/:leadId`
- **Behavior:** Returns a single lead if — and only if — it is within the caller's authorized scope.
- **Errors:** `403 AUTHORIZATION_ERROR` if the lead exists but is outside scope (deliberately not `404`, so as not to imply "wrong" IDs vs "yours" IDs are distinguishable from the outside — either way the caller is told plainly "not authorized"), `404 NOT_FOUND` if the lead id doesn't exist at all.

**Lead shape:**
```jsonc
{
  "id": "clx...",
  "sourceSrNo": "SR-1001",
  "customerName": "...",
  "customerPrimaryPhone": "...",
  "subProductName": "...",
  "amount": "250000.00",
  "sourceLeadStatus": "Open",
  "sourceCategorization": "B",         // A | B | C | D
  "sourceStageProgress": "UNDER_PROCESS",
  "tentativeSanctionDate": null,
  "tentativeDisbursementDate": null,
  "sourceRemarks": null,
  "cbiPesStage": "CONTACTED",          // INTERESTED | CONTACTED | APPLICATION | APPROVAL | CONVERSION
  "branchId": "clx...",
  "regionId": null,
  "createdAt": "2026-08-16T00:00:00.000Z",
  "updatedAt": "2026-08-16T00:00:00.000Z"
}
```

---

## Error codes

| HTTP | code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body/params/query failed validation |
| 401 | `AUTHENTICATION_ERROR` | Missing/invalid/expired token |
| 401 | `INVALID_CREDENTIALS` | Login failed |
| 403 | `AUTHORIZATION_ERROR` | Authenticated, but not authorized for this resource |
| 404 | `NOT_FOUND` | Resource does not exist |
| 500 | `DATABASE_ERROR` | A database error occurred (details never exposed to the client) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

## Not implemented in Phase 1 (by design)

Lead update endpoints (`PATCH/POST /api/leads/:leadId`), campaign
endpoints, WhatsApp/Email/call endpoints, voice/AI endpoints, and any
administration endpoints are intentionally absent — see
`docs/PHASE1_SCOPE.md`.

---

## Phase 2 additions

See `docs/PHASE2_SCOPE.md` for full design rationale (provider
abstractions, secure-access mechanism, branch-status heuristic). All
Phase 1 endpoints above are unchanged.

### `GET /api/rm/dashboard`
- **Access:** RM only (`403` for any other role).
- **Success (200):**
```jsonc
{
  "region": { "id": "...", "name": "Region A1" },
  "branches": [
    {
      "id": "...", "name": "Branch A101",
      "bm": { "id": "...", "name": "Sanjay Rao" },
      "totalLeads": 4,
      "leadsByStage": { "INTERESTED": 1, "CONTACTED": 1, "APPLICATION": 0, "APPROVAL": 1, "CONVERSION": 1 },
      "lastLeadUpdateAt": "2026-08-15T10:00:00.000Z",
      "latestFollowUp": { "channel": "EMAIL", "sentAt": "2026-08-16T09:00:00.000Z", "status": "SENT" },
      "updateStatus": "RECENTLY_UPDATED"
    }
  ],
  "summary": { "totalBranches": 2, "branchesRequiringUpdate": 1, "branchesWithFollowUpInFlight": 0, "totalLeads": 7 }
}
```

### `POST /api/rm/follow-ups`
- **Access:** RM only. Every `branchId` is re-validated against the
  caller's region server-side — see `docs/PHASE2_SCOPE.md` "Authorization".
- **Body:** `{ branchIds: string[], channel: "WHATSAPP" | "EMAIL", customNote?: string (max 300 chars) }`
- **Success (201):**
```jsonc
{
  "followUpId": "...",
  "channel": "WHATSAPP",
  "targets": [
    { "branchId": "...", "branchName": "Branch A101", "status": "PENDING", "whatsAppDeepLinkUrl": "https://wa.me/..." },
    { "branchId": "...", "branchName": "Branch A102", "status": "FAILED", "failureReason": "Branch Head has no phone number on file" }
  ]
}
```
- **Errors:** `400 VALIDATION_ERROR` (empty branch list, unsupported channel, note too long), `403 AUTHORIZATION_ERROR` (any branch outside the RM's region, or caller is not an RM), `404 NOT_FOUND` (a branch id doesn't exist).

### `GET /api/rm/follow-ups`
- **Access:** RM only. Returns the caller's own recent follow-ups (most recent 20) with per-target status.

### `POST /api/rm/follow-ups/targets/:targetId/confirm-sent`
- **Access:** RM only, and only for a target belonging to a follow-up they themselves initiated.
- **Purpose:** Best-effort confirmation that a WhatsApp deep link was opened (see `docs/PHASE2_SCOPE.md` — there is no delivery webhook without a real WhatsApp Business API).
- **Errors:** `400 VALIDATION_ERROR` if the target isn't a WhatsApp target or isn't currently `PENDING`, `404 NOT_FOUND` if the target doesn't belong to the caller.

### `GET /api/follow-up-access/:token`
- **Access:** Public — deliberately not behind `authenticate`. Authorization comes entirely from possessing the correct opaque token.
- **Purpose:** The secure BM handoff. Exchanges a one-time access token for a real, short-lived (2h) BM session.
- **Success (200):** `{ token: string, user: { id, username, name, role: "BM", branch: {id, name} } }`
- **Errors:** `401 INVALID_ACCESS_TOKEN` (unknown token — deliberately generic, does not reveal whether a token ever existed), `401 ACCESS_TOKEN_EXPIRED`, `409 BRANCH_HAS_NO_BM`, `410 ACCESS_TOKEN_INVALID` (follow-up delivery failed, link inactive).

---

## Phase 3/4 additions

See `docs/PHASE3_4_SCOPE.md` for the unified update pipeline and AI
provider boundary. All endpoints below require authentication and
`requireRole('BM')`, plus a per-resource check that the lead/proposal
actually belongs to the caller's own branch.

### `POST /api/bm/leads/:leadId/proposals`
Creates a `PENDING` proposal. **Does not** change the lead's stage.
Body: `{ proposedStage: PipelineStage, remarks?: string }`.

### `GET /api/bm/leads/:leadId/proposals`
All proposals (any status) for one lead.

### `GET /api/bm/leads/:leadId/activity`
Confirmed-only audit trail for one lead.

### `GET /api/bm/proposals?status=PENDING`
All proposals across the caller's branch, optionally filtered by status.
This is what the mobile "Review Updates" screen polls — manual and
voice-sourced proposals appear identically.

### `POST /api/bm/proposals/:proposalId/confirm`
The only endpoint that ever changes `Lead.cbiPesStage`. Transactional:
updates the lead, marks the proposal `CONFIRMED`, and writes a
`LeadActivity` row together or not at all. `409 PROPOSAL_NOT_PENDING` if
already confirmed/rejected.

### `POST /api/bm/proposals/confirm-batch`
Body: `{ proposalIds: string[] }`. Confirms each independently — a
failure on one does not block the others; response is a per-id
success/error array (spec section 24's partial-failure handling).

### `POST /api/bm/proposals/:proposalId/reject`
Marks `REJECTED`. No activity row is written.

### `POST /api/bm/voice-updates/extract`
Body: `{ transcript: string }`. Runs the deterministic extractor (see
`docs/PHASE3_4_SCOPE.md`) and returns candidates — **nothing is
persisted as a proposal yet**. Success (201):
`{ sessionId, candidates: ExtractedCandidate[] }`, where each candidate
has `ambiguityReason: 'NO_LEAD_MATCH' | 'MULTIPLE_LEAD_MATCH' | 'NO_STAGE_MATCH' | null`.

### `POST /api/bm/voice-updates/sessions/:sessionId/proposals`
Body: `{ items: [{ leadId, proposedStage, remarks? }] }` — the BM's
resolved/accepted candidates. Creates `PENDING` proposals with
`source: 'VOICE_AI'`, via the exact same creation function the manual
endpoint uses. Response: `{ created: number, failed: [{leadId, error}] }`.
