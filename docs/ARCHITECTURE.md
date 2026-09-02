# MSME Utkarsh Phase 1 — Architecture

## Component overview

```
┌─────────────────────────┐
│  React Native (TS)      │
│  ─ screens/              │
│  ─ auth/AuthContext      │  <- dedicated session state, AsyncStorage-backed
│  ─ api/client.ts         │  <- single fetch wrapper, attaches JWT
│  ─ TanStack Query        │  <- server-state cache
└────────────┬─────────────┘
             │ HTTPS/JSON (REST, JWT bearer auth)
┌────────────▼─────────────┐
│  Express app (TS)         │
│  helmet, cors, json       │
├───────────────────────────┤
│  routes/                  │  method + path -> middleware chain
│  middleware/               │  authenticate -> validate -> handler
│  controllers/               │  thin: parse req, call service, send response
│  services/                   │  business logic + authorization enforcement
│  repositories/                 │  Prisma queries only, no business logic
└────────────┬───────────────────┘
             │ Prisma Client
┌────────────▼─────────────┐
│  PostgreSQL                │
└───────────────────────────┘
```

## Why this layering

- **Controllers stay thin.** They parse the (already-validated) request,
  call exactly one service function, and send the response. No business
  logic lives here.
- **Services own business logic and authorization.** Every scope check —
  "can this RM see this branch," "can this BM see this lead" — happens in
  `src/services/`, backed by the pure, framework-independent functions in
  `src/services/authorization.ts`. Keeping authorization pure (no
  Express `Request`, no Prisma types) means it can be unit tested
  directly and reused identically everywhere it's needed.
- **Repositories only know Prisma.** They take already-authorized
  parameters (e.g. "these are the branchIds you're allowed to query") and
  turn them into Prisma queries. They never decide who is allowed to see
  what — that would let an authorization bug hide inside a query
  builder where it's harder to unit test in isolation.

This is a deliberate defense-in-depth split: even if a controller forgot
to check authorization (it can't, in this codebase, because the
authenticate middleware runs before it and services throw on unauthorized
scope), the repository layer never trusts an ID from anywhere but a
pre-computed, service-derived scope.

## Data model

```
CentralOffice
  └─ Zone (many)
       └─ Region (many)
            ├─ RM (User, one — regionId is unique on User)
            └─ Branch (many)
                 ├─ BM (User, one — branchId is unique on User)
                 └─ Lead (many)

Region
  └─ Lead (many) — leads that exist at region level, not yet
                    assigned to a specific branch
```

A `Lead` belongs to exactly one of `Branch` or `Region` — enforced by a
`CHECK` constraint in the migration SQL (`leads_org_assignment_check`)
in addition to being validated by the service layer. This is what makes
region-level leads representable without inventing a more complex
assignment engine (spec sections 8, 21).

A `User`'s organizational assignment is role-specific and mutually
exclusive, also enforced by a `CHECK` constraint
(`users_role_assignment_check`): an `RM` has `regionId` set and
`branchId` null; a `BM` has the reverse; `CO`/`ZM` (unused in Phase 1)
have neither.

### Source/LMS fields vs. MSME Utkarsh pipeline

The `Lead` model deliberately keeps two families of fields separate and
never auto-derives one from the other (spec sections 16–20):

| Concept | Field(s) | Owner |
|---|---|---|
| LMS status text | `sourceLeadStatus` | Source/LMS |
| Doc-completeness categorization (A–D) | `sourceCategorization` | Source/LMS |
| LMS pipeline progress | `sourceStageProgress` | Source/LMS |
| MSME Utkarsh's own 5-stage pipeline | `cbiPesStage` | MSME Utkarsh |

`cbiPesStage` defaults to `INTERESTED` for any newly created lead and is
never computed from the source fields by any Phase 1 code path. The only
place source values and a `cbiPesStage` appear together is
`prisma/seed.ts`, where the pairing is explicitly documented as an
arbitrary demo convenience, not a business rule.

## Authentication & session flow

1. Mobile app starts → `AuthContext` checks `AsyncStorage` for a stored
   JWT.
2. If found, it's set on the API client and validated via
   `GET /api/auth/me`. Success → authenticated state with the current
   user. Failure (expired/invalid/account deactivated) → the stored token
   is cleared and the app falls back to the login screen — never left in
   a broken in-between state.
3. If not found → login screen immediately, no flash of authenticated UI.
4. `POST /api/auth/login` verifies username + bcrypt-hashed password,
   returns a JWT containing `{ userId, username, role, regionId?,
   branchId? }`. The mobile app stores it and re-fetches `/auth/me` for
   the full profile (never derives display data from the raw JWT
   payload).
5. Every subsequent request carries `Authorization: Bearer <token>`. The
   `authenticate` middleware verifies signature + expiry and attaches the
   decoded identity to `req.user` before any controller runs.
6. Logout is currently a client-side action (JWTs are stateless in Phase
   1 — no server-side session store). `POST /api/auth/logout` exists as a
   documented, stable endpoint so token blocklisting can be added later
   (a reasonable Phase 6 hardening item) without changing the client's
   contract.

## Extensibility for Phases 2–6

- **Phase 2 (RM dashboard, message follow-up):** adds new screens reading
  from the same `/api/org/scope` and a new follow-up API; the existing
  auth/scope plumbing needs no changes.
- **Phase 3 (BM manual updates):** adds `PATCH`/`POST` endpoints on
  `/api/leads/:leadId` reusing the same `getAuthorizedLead` authorization
  check already written for `GET`.
- **Phase 4 (voice/AI):** adds a new ingestion path that ultimately calls
  the same lead-update service Phase 3 introduces; the org/lead schema
  does not need to change.
- **Phase 6 (LMS integration):** the source/LMS field family on `Lead` is
  already structurally distinct from the MSME Utkarsh pipeline specifically so
  a future LMS sync job can write into `source*` fields without touching
  `cbiPesStage`, and vice versa.
