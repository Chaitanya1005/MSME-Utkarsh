# MSME Utkarsh — Phase 1 + Phase 2 + Phase 3/4

MSME Utkarsh (CBI Performance Evaluation System) is a mobile application for
internal use within Central Bank of India, being developed by Inoviq.

**Phase 1** (Platform Foundation & Hierarchical Data Management) and
**Phase 2** (Regional Manager Dashboard & Message-Based Follow-Up) are
both in this repository. Phase 2 was built additively on top of the
validated Phase 1 baseline — see `docs/PHASE2_SCOPE.md` for exactly what
was added and the (three, documented) places existing Phase 1 files were
touched at all.

## Baseline provenance

This codebase was originally delivered as a React Native CLI project.
Between that delivery and the start of Phase 2, it was migrated locally
to an Expo-based workflow (Expo SDK 54, React Native 0.81.5, React
19.1.0) to get it actually running end-to-end. That migration, and
everything else validated locally (a real `npx prisma generate`/migrate,
a real Android build under `mobile/android`), is treated as the trusted
baseline for Phase 2 and was not touched, reversed, or re-litigated.

See `docs/PHASE1_SCOPE.md` for exactly what's in and out of Phase 1,
`docs/PHASE2_SCOPE.md` for Phase 2, and `docs/PHASE3_4_SCOPE.md` for the
combined Phase 3 (BM lead management) + Phase 4 (AI voice updates)
milestone — including the unified update-proposal pipeline both sources
share and the honest AI-provider boundary.

---

## 1. Repository layout

```
MSME Utkarsh/
├── backend/     Node.js + Express + TypeScript + Prisma + PostgreSQL API
├── mobile/      React Native + TypeScript mobile app (source only — see
│                "Mobile setup" below for why native folders aren't included)
└── docs/        Architecture, API, seed data, and scope documentation
```

## 2. Prerequisites

Already verified in the target development environment (do not re-do
generic setup):

- Node.js 24.11.1, npm 11.6.2, Git 2.46.0 (Windows)
- PostgreSQL (local instance)
- Physical Android device for testing (Android-first per spec)

You will additionally need:

- A local PostgreSQL server (v14+) reachable from your machine
- The React Native CLI environment (Android SDK, JDK) already set up per
  your existing React Native experience

## 3. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL to your local Postgres, and generate a real
# JWT_SECRET, e.g.:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed

npm run dev
# Backend now listening on http://localhost:4000
```

**Phase 2 note:** a second migration (`20260819000000_phase2_follow_up`)
adds the follow-up tables and BM contact fields. `npx prisma migrate dev`
picks up both migrations in order automatically — no separate step
needed, just run it once your `.env` is configured.

Verify it's alive:

```bash
curl http://localhost:4000/health
# {"success":true,"data":{"status":"ok"}}
```

### Running tests

```bash
cd backend
npm test
```

This runs both the pure unit tests (`tests/unit/`, no database required)
and the integration tests (`tests/integration/`, require
`DATABASE_URL` to point at a real, migrated Postgres — point it at a
disposable test database, e.g. `cbipes_test`, not your dev database,
since the test fixtures wipe all data on every run).

**See "Known limitations" below — the integration tests and the Prisma
migration/generate steps above could not be executed in the sandboxed
environment this project was authored in, and need to be run and
verified on your machine before this is treated as done.**

## 4. Mobile setup

The `mobile/` directory contains the Phase 1 application **source**
(`App.tsx`, `src/`, `__tests__/`, `package.json`, configs). It has been
verified in this build with a real `npm install` (939 packages, succeeds
cleanly against the public npm registry), a real `npx tsc --noEmit`
(clean), a real `npx eslint . --ext .ts,.tsx` (clean, 0 errors/0
warnings), and 4 real passing Jest unit tests against the API client
(`__tests__/apiClient.test.ts`). What it does **not** include is
generated native `android/` and `ios/` project folders — those are
large, environment-specific binaries/configs that are best generated
fresh by the React Native CLI on your machine rather than hand-authored,
and this sandbox has no Android SDK/JDK to generate or verify them
against:

```bash
# From a scratch directory, generate a fresh RN 0.75.4 project shell:
npx @react-native-community/cli init CBIPESTemp --version 0.75.4

# Copy the native folders it created into this repo:
cp -r CBIPESTemp/android MSME Utkarsh/mobile/android
cp -r CBIPESTemp/ios MSME Utkarsh/mobile/ios
cp CBIPESTemp/metro.config.js MSME Utkarsh/mobile/metro.config.js
cp CBIPESTemp/Gemfile MSME Utkarsh/mobile/Gemfile 2>/dev/null || true
rm -rf CBIPESTemp

cd MSME Utkarsh/mobile
npm install
```

Then, before running on Android, update `src/config/env.ts` if you're
testing on a **physical device** rather than the emulator (see the
comment in that file — the emulator's special host alias won't work from
a real phone; use your machine's LAN IP instead).

### Windows + physical Android device (your actual setup)

You have a physical Android device connected via USB, on a Windows
machine, per the environment described in the original spec. Two ways to
reach your locally-running backend from that device:

**Option A — `adb reverse` (recommended, works over USB, no LAN/firewall
config needed):**
```powershell
adb devices                       # confirm the device shows up
adb reverse tcp:4000 tcp:4000      # forwards the device's localhost:4000 to your PC's localhost:4000
```
With this, leave `src/config/env.ts` pointing at `localhost:4000` (add a
`USE_ADB_REVERSE` toggle or just hardcode `http://localhost:4000/api`
for this workflow) — the device will resolve `localhost` back to your PC
through the USB connection.

**Option B — LAN IP (works over WiFi, needs firewall + same network):**
```powershell
ipconfig                          # find your PC's IPv4 address, e.g. 192.168.1.23
```
Then set `API_BASE_URL` in `src/config/env.ts` to
`http://192.168.1.23:4000/api`, and make sure Windows Firewall allows
inbound connections on port 4000 for your Node process, and the phone is
on the same WiFi network as the PC.

```powershell
npx react-native start
# in a second terminal:
npx react-native run-android
```

Login with one of the seeded accounts (see `docs/SEED_DATA.md`).

### What was verified vs. not, for mobile

| Check | Status |
|---|---|
| `npm install` | ✅ Ran — 939 packages installed cleanly |
| `npx tsc --noEmit` | ✅ Ran — clean, one real bug found and fixed (`LeadListParams` needed an index signature to satisfy `fetch` query typing) |
| `npx eslint . --ext .ts,.tsx` | ✅ Ran — clean, 0 errors after auto-fixing 2 style warnings |
| `npx jest __tests__/apiClient.test.ts` | ✅ Ran — 4/4 passing (API client auth-header/error-handling logic) |
| Metro bundler / `react-native start` | ❌ Not run — no RN CLI/Metro runtime exercised |
| Android build / emulator / physical device | ❌ Not run — no Android SDK/JDK/emulator in this sandbox |


## 5. Architecture

See `docs/ARCHITECTURE.md` for the full picture. Summary:

```
React Native (TS)
  -> src/api/client.ts (single fetch wrapper, attaches JWT)
  -> Express API (/api/auth, /api/org, /api/leads)
  -> middleware: authenticate (JWT) -> validate (zod) -> controller
  -> service layer (authorization enforced here, via src/services/authorization.ts)
  -> repository layer (Prisma queries)
  -> PostgreSQL
```

## 6. Authorization model

Enforced **only** on the backend, never trusted from the client (spec
section 27). See `docs/API.md` and `backend/src/services/authorization.ts`
for the full rule set:

- RM → their Region, every Branch in it, every Lead under those branches
  or directly under the Region (region-level leads).
- BM → their Branch and every Lead belonging to it. No region-level
  access.
- Every lead/branch/region-scoped endpoint re-derives the caller's scope
  from their verified JWT on every request; it never trusts a
  client-supplied region/branch id as anything other than "the thing to
  check against the caller's actual scope."

## 7. Known limitations / what was NOT verified in this environment

Being explicit here rather than overclaiming (per the project's own
instructions to self-audit honestly):

1. **`prisma generate` / `prisma migrate dev` / `prisma validate` /
   `prisma format` could not be run** in the sandboxed environment this
   was built in — every one of them requires downloading an engine
   binary from `binaries.prisma.sh`, which returned `403 Forbidden` from
   that environment's network (all four commands were attempted and all
   four failed identically). The Prisma schema and a hand-authored
   equivalent SQL migration are provided, but you must run
   `npx prisma generate && npx prisma migrate dev` yourself as the first
   real step, and treat Prisma's own migration output as authoritative
   over the hand-authored SQL if they ever diverge.
2. **Backend integration tests (`tests/integration/`) have not been
   executed**, for the same reason (they require a generated Prisma
   Client). They were written to the mandatory authorization test matrix
   in spec section 49 and are ready to run once step 1 is done. Attempted
   in this environment, they fail specifically and only at Prisma Client
   construction (`@prisma/client did not initialize yet`), not on any
   application code.
3. **What WAS executed and verified, with results:**
   - Backend: `npx tsc --noEmit` (clean apart from errors strictly
     downstream of the missing generated Prisma types — no independent
     bugs), `npx eslint "src/**/*.ts" "tests/**/*.ts"` (clean, 0
     issues), `npm test tests/unit` — **25/25 passing** (authorization
     matrix, password hashing, JWT sign/verify/expiry/forgery).
   - Mobile: `npm install` (939 packages, clean), `npx tsc --noEmit`
     (clean — caught and fixed one real typing bug), `npx eslint . --ext
     .ts,.tsx` (clean, 0 errors after auto-fixing 2 style warnings),
     `npx jest __tests__/apiClient.test.ts` — **4/4 passing** (API
     client auth header attachment and error handling).
4. **The React Native app has not been bundled, built, or run** on an
   emulator or a physical Android device — no Android SDK/JDK/emulator
   exists in this sandbox. TypeScript compilation and linting against the
   installed RN 0.75.4 toolchain both passed, which is meaningfully more
   verification than "the code looks right," but it is not the same as a
   running app.
5. **No Excel file (`MMZO LEADS.xlsx`) was provided** to this build. The
   lead schema was built from the column list in the original spec
   (section 15) rather than the actual workbook. If your real workbook
   has different column names, types, or validation rules, reconcile
   `prisma/schema.prisma` against it before Phase 2 begins.
6. **The source-status → MSME Utkarsh-stage mapping used in `prisma/seed.ts`
   is explicitly arbitrary**, invented only to exercise the pipeline
   field in seed/demo data (spec sections 18, 53). It is not a real
   business rule and is commented as such in the seed file.

## 7b. Phase 2 verification results (this build)

- Backend: `npm install` (578 packages), `npx eslint "src/**/*.ts"
  "tests/**/*.ts"` (clean), `npx jest tests/unit` — **50/50 passing**
  (25 inherited from Phase 1 + 25 new: `branchUpdateStatus`,
  `secureToken`, `messageTemplate`, `requireRole`).
- Backend Phase 2 integration tests
  (`tests/integration/followUp.test.ts`) written, not executed — same
  Prisma-engine sandbox limitation as Phase 1.
- Mobile: `npm install` (833 packages, Expo SDK 54 stack), `npx tsc
  --noEmit` (clean on first pass), `npx jest __tests__` — **6/6 passing**
  (4 inherited + 2 new `followUpApi` tests).
- Mobile ESLint could not run — pre-existing gap from the Expo migration,
  see `docs/PHASE2_SCOPE.md` "Known limitations" for detail and why it
  was documented rather than silently fixed with a new dependency.
- Mobile app not run on an emulator or device in this build environment
  (same as Phase 1).

## 7c. Phase 3/4 verification results (this build)

- Backend: `npx eslint "src/**/*.ts"` (clean, 1 real bug caught and fixed
  — an unused parameter after a refactor), `npx jest tests/unit` —
  **57/57 passing** (50 inherited + 7 new `voiceExtraction` tests
  covering the spec's own Sharma/Verma/Singh example, ambiguity
  detection, and the "never return an unauthorized lead id" invariant).
- Backend Phase 3/4 integration tests (`tests/integration/leadUpdate.test.ts`)
  written, covering manual + voice proposal creation, the confirm
  transaction, double-confirm rejection, and cross-branch authorization
  denial — not executed, same Prisma-engine sandbox limitation.
- Mobile: `npm install` (833 packages), `npx tsc --noEmit` (clean on the
  first pass across ~10 new/changed screens), `npx jest __tests__` —
  **12/12 passing** (7 inherited + 5 new `leadUpdateApi`/`voiceUpdateApi`
  tests).
- Mobile app not run on an emulator or device in this build environment.
- Real microphone recording was not implemented this milestone — see
  `docs/PHASE3_4_SCOPE.md` "Known limitations" for what that means
  concretely and what's real regardless (the entire pipeline downstream
  of "a transcript exists").

## 7d. Phase 5 verification results (this build)

- Backend: `npx eslint "src/**/*.ts" "tests/**/*.ts"` (clean), `npx jest
  tests/unit` — **60/60 passing** (57 inherited + 3 new
  `DevMockCallingProvider` tests).
- Backend Phase 5 integration tests (`tests/integration/calling.test.ts`,
  plus new sections appended to `tests/integration/leadUpdate.test.ts`
  covering the shared activity endpoint and the post-removal manual
  update flow) written, not executed — same Prisma-engine sandbox
  limitation as every prior phase.
- Mobile: `npm install` (840 packages, including the new `expo-audio`
  and `expo-file-system`), `npx tsc --noEmit` (clean), `npx jest
  __tests__` — **15/15 passing** (12 inherited + 3 new `callingApi`
  tests).
- See `docs/PHASE5_IMPLEMENTATION.md` for the full implementation report,
  provider integration points, and known limitations specific to this
  phase (notably: the `expo-audio` version pin is an inference, not a
  confirmed SDK-54 mapping — flagged explicitly there).

## 7e. Voice-to-Lead-Update (real Sarvam integration) verification results

- Backend: `npx eslint "src/**/*.ts" "tests/**/*.ts"` (clean), `npx jest
  tests/unit` — **77/77 passing** (60 inherited + 18 rewritten
  `voiceExtraction` tests for number-based matching + 6 new
  `sarvamTranscriptionProvider` tests, SDK mocked per this feature's own
  instruction not to hit the real API automatically). `npm run build` /
  `npx tsc --noEmit` show the same pre-existing Prisma-generation cascade
  documented in every prior phase — no new independent errors.
- Backend integration tests (`tests/integration/voiceLeadUpdate.test.ts`)
  written, not executed — same Prisma-engine sandbox limitation.
- Mobile: `npx tsc --noEmit` (clean), `npx jest __tests__` — **15/15
  passing**.
- Full details, the negation-handling design for the demo's trickiest two
  phrases, and manual steps you need to perform (setting
  `SARVAM_API_KEY`, running a real end-to-end test with actual audio) are
  in `docs/VOICE_LEAD_UPDATE.md`.

## 8. Documentation index

- `docs/ARCHITECTURE.md` — component/data-flow architecture
- `docs/API.md` — endpoint-by-endpoint reference
- `docs/SEED_DATA.md` — seeded users, credentials, and the authorization
  test matrix
- `docs/PHASE1_SCOPE.md` — what's in and explicitly out of Phase 1, and
  documented assumptions
