# Worldwide Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Supabase-backed, all-time, unique-username, worldwide leaderboard for Cave Helicopter 1.0.1, with a basic server-side anti-cheat check on score submissions.

**Architecture:** A single `leaderboard` table in a new dedicated Supabase project, readable directly by the client (RLS `SELECT`-only for `anon`), writable only through two Edge Functions (`claim-username`, `submit-score`) running with the service-role key — this is what makes server-side validation (profanity, plausibility) actually enforceable rather than advisory. The client is a thin `src/net/` layer; a device-generated UUID (no login) is the player's identity, paired with a globally-unique username claimed once.

**Tech Stack:** Expo SDK 57 / React Native 0.86 / Reanimated 4.5 / Skia (existing). Supabase (`@supabase/supabase-js`) for Postgres + Edge Functions (Deno). `bad-words` for profanity filtering (client + server). `expo-crypto` for UUID generation. `react-native-url-polyfill` (required by supabase-js on RN/Hermes). Vitest for pure-logic tests (existing).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-11-leaderboard-design.md` — this plan implements it in full; deviations are called out explicitly in the relevant task.
- Username: 3–16 chars, `[a-zA-Z0-9_]` only, globally unique (case-insensitive), no login — tied to a locally-generated `player_id` UUID that is lost on reinstall.
- Leaderboard is **all-time only** — one row per player, `best_score` only ever increases.
- Anti-cheat is a **plausibility bound**, not full replay verification: `maxScore(T) = 120 × 10 × 0.95 × (T/1000) × 1.05` (see Task 2 for where each constant comes from — they mirror `src/config.ts`'s `scoring.basePointsPerShu`, `graze.multiplierTiers`, `difficulty.scrollSpeed.cap`).
- All writes to the `leaderboard` table go through Edge Functions using the service-role key. `anon` gets `SELECT` only — no RLS policy exists for `INSERT`/`UPDATE`/`DELETE`.
- No local Supabase CLI/Docker is installed in this environment — provisioning and Edge Function deployment happen directly against a real, dedicated Supabase project via the Supabase MCP tools, not `supabase start`. Verification of Edge Functions is by `curl` against the deployed function URL.
- This is a v1.0.1 patch — out of scope: weekly/seasonal boards, full replay anti-cheat, account recovery after reinstall, Android.
- A Privacy Policy URL becomes a hard requirement for App Store submission once this ships (see spec) — not part of this plan's tasks, flagged again in Task 10.

---

### Task 1: Provision the Supabase project and schema

**Files:**
- Create: `supabase/migrations/20260811000000_leaderboard.sql`

**Interfaces:**
- Produces: a Supabase project with a `leaderboard` table (`player_id uuid PK`, `username text`, `best_score integer`, `best_distance numeric`, `best_duration_ms integer`, `updated_at timestamptz`), a `get_rank(p_player_id uuid) returns integer` RPC, and RLS that allows `anon` `SELECT` only. Later tasks need: the project id, the project URL, and the anon (JWT) key.

- [ ] **Step 1: Get and confirm the project cost**

Call the Supabase MCP tools `get_cost` (type: `"project"`, organization_id: `"lbjvydhimgpoaoseiaul"`) then `confirm_cost` with the returned amount/recurrence. Free-tier projects should be `$0`, but this step surfaces the real number — show it to the user before proceeding if it's non-zero. Keep the returned `confirm_cost_id` for the next step.

- [ ] **Step 2: Create the project**

Call `create_project`:
```json
{
  "name": "cave-helicopter",
  "region": "us-east-1",
  "organization_id": "lbjvydhimgpoaoseiaul",
  "confirm_cost_id": "<from Step 1>"
}
```
Poll `get_project` with the returned id until `status` is `ACTIVE_HEALTHY` (can take a couple of minutes). Record the project id as `PROJECT_ID` — every later Supabase MCP call in this plan needs it.

- [ ] **Step 3: Write the migration file**

Create `supabase/migrations/20260811000000_leaderboard.sql`:

```sql
create table leaderboard (
  player_id        uuid primary key,
  username          text not null,
  best_score        integer not null,
  best_distance     numeric not null,
  best_duration_ms  integer not null,
  updated_at        timestamptz not null default now()
);

create unique index leaderboard_username_unique on leaderboard (lower(username));
create index leaderboard_score_desc on leaderboard (best_score desc);

alter table leaderboard enable row level security;

-- The board is public to read. There is deliberately no insert/update/
-- delete policy for anon — all writes go through Edge Functions using the
-- service-role key, which bypasses RLS entirely. This is what makes the
-- anti-cheat check in submit-score actually enforceable.
create policy "public read" on leaderboard
  for select
  to anon
  using (true);

-- Returns this player's 1-indexed rank by best_score, or null if they have
-- no row yet. NOTE: a bare `select count(*) + 1 ... where exists(...)` does
-- NOT do this — count(*) over zero matching rows is 0, not "no rows", so
-- the function would always return a row (1 for an unranked player, which
-- is wrong). The CASE below is what actually short-circuits to NULL.
create or replace function get_rank(p_player_id uuid)
returns integer
language sql
stable
as $$
  select case
    when exists (select 1 from leaderboard where player_id = p_player_id)
      then (
        select count(*) + 1
        from leaderboard l
        where l.best_score > (
          select best_score from leaderboard where player_id = p_player_id
        )
      )
    else null
  end;
$$;

grant execute on function get_rank(uuid) to anon;
```

- [ ] **Step 4: Apply the migration**

Call `apply_migration`:
```json
{
  "project_id": "<PROJECT_ID>",
  "name": "leaderboard",
  "query": "<the file contents from Step 3>"
}
```

- [ ] **Step 5: Verify the schema**

Call `list_tables` with `project_id: PROJECT_ID`, `schemas: ["public"]`, `verbose: true`. Confirm `leaderboard` appears with all 6 columns and the unique index. Then call `execute_sql` with:
```sql
select get_rank('99999999-9999-9999-9999-999999999999');
insert into leaderboard (player_id, username, best_score, best_distance, best_duration_ms)
values ('00000000-0000-0000-0000-000000000001', 'smoketest', 100, 500, 30000);
select get_rank('00000000-0000-0000-0000-000000000001');
delete from leaderboard where player_id = '00000000-0000-0000-0000-000000000001';
```
Expected: the first `get_rank` call (a player id with no row) returns `null` — this is the branch that actually matters, don't skip it. The second call (the just-inserted row) returns `1` (only row in the table). Then call `get_advisors` with `type: "security"` and confirm there's no "RLS disabled" finding for `leaderboard`.

- [ ] **Step 6: Record connection details for later tasks**

Call `get_project_url` and `get_publishable_keys` with `project_id: PROJECT_ID`. From the keys response, use the **legacy JWT anon key** (not the newer `sb_publishable_...` format) — Edge Functions verify the `Authorization` header as a Supabase-issued JWT by default, which the legacy anon key satisfies. Write both values down; Task 4 puts them in `.env`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260811000000_leaderboard.sql
git commit -m "feat: leaderboard schema (Supabase project, RLS, get_rank RPC)"
```

---

### Task 2: Shared pure logic — username rules and plausibility check

**Files:**
- Create: `src/net/leaderboardRules.ts`
- Test: `src/net/__tests__/leaderboardRules.test.ts`
- Create: `supabase/functions/_shared/leaderboardRules.ts` (Deno-runtime duplicate)

**Interfaces:**
- Produces (from `src/net/leaderboardRules.ts`, used by Task 6 and Task 9):
  `isValidUsernameFormat(username: string): boolean`
  `containsBlockedWord(username: string): boolean`
  `isClaimableUsername(username: string): boolean`
  `maxScoreForDuration(durationMs: number): number`
  `maxMetersForDuration(durationMs: number): number`
  `isPlausibleRun(score: number, distanceMeters: number, durationMs: number): boolean`
- Produces (from `supabase/functions/_shared/leaderboardRules.ts`, used by Task 3): the same six functions, Deno-runtime versions.

Deno Edge Functions can't import from `src/` (different runtime, deployed independently), so the logic is duplicated rather than shared by import. Both files start with a comment pointing at the other.

- [ ] **Step 1: Add the dependency**

```bash
npm install bad-words
```

- [ ] **Step 2: Write the failing tests**

Create `src/net/__tests__/leaderboardRules.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  isValidUsernameFormat,
  containsBlockedWord,
  isClaimableUsername,
  maxScoreForDuration,
  maxMetersForDuration,
  isPlausibleRun,
} from '../leaderboardRules';

describe('isValidUsernameFormat', () => {
  test('accepts alphanumeric + underscore, 3-16 chars', () => {
    expect(isValidUsernameFormat('Pilot_482')).toBe(true);
  });
  test('rejects too short', () => {
    expect(isValidUsernameFormat('ab')).toBe(false);
  });
  test('rejects too long', () => {
    expect(isValidUsernameFormat('a'.repeat(17))).toBe(false);
  });
  test('rejects symbols and spaces', () => {
    expect(isValidUsernameFormat('pilot 482')).toBe(false);
    expect(isValidUsernameFormat('pilot!')).toBe(false);
  });
});

describe('containsBlockedWord', () => {
  test('flags an obvious profane name', () => {
    expect(containsBlockedWord('fuckface')).toBe(true);
  });
  test('allows a clean name', () => {
    expect(containsBlockedWord('SkyPilot42')).toBe(false);
  });
});

describe('isClaimableUsername', () => {
  test('valid and clean passes', () => {
    expect(isClaimableUsername('SkyPilot42')).toBe(true);
  });
  test('valid format but profane fails', () => {
    expect(isClaimableUsername('fuckface')).toBe(false);
  });
  test('invalid format fails regardless of content', () => {
    expect(isClaimableUsername('ab')).toBe(false);
  });
});

describe('maxScoreForDuration', () => {
  test('matches the documented formula', () => {
    expect(maxScoreForDuration(1000)).toBeCloseTo(120 * 10 * 0.95 * 1.05);
  });
  test('scales linearly with duration', () => {
    expect(maxScoreForDuration(2000)).toBeCloseTo(maxScoreForDuration(1000) * 2);
  });
});

describe('maxMetersForDuration', () => {
  test('matches the documented formula', () => {
    expect(maxMetersForDuration(1000)).toBeCloseTo(0.95 * 100 * 1.05);
  });
});

describe('isPlausibleRun', () => {
  test('accepts a realistic run', () => {
    expect(isPlausibleRun(8000, 6000, 90000)).toBe(true);
  });
  test('rejects a score far beyond the theoretical ceiling', () => {
    expect(isPlausibleRun(999999, 6000, 90000)).toBe(false);
  });
  test('rejects a distance far beyond the theoretical ceiling', () => {
    expect(isPlausibleRun(8000, 999999, 90000)).toBe(false);
  });
  test('rejects non-finite, negative, or zero-duration inputs', () => {
    expect(isPlausibleRun(NaN, 100, 1000)).toBe(false);
    expect(isPlausibleRun(-1, 100, 1000)).toBe(false);
    expect(isPlausibleRun(100, 100, 0)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npm test -- leaderboardRules`
Expected: FAIL — `src/net/leaderboardRules.ts` doesn't exist yet.

- [ ] **Step 4: Implement `src/net/leaderboardRules.ts`**

```ts
import Filter from 'bad-words';

const filter = new Filter();

/** 3-16 chars, alphanumeric + underscore only. */
export function isValidUsernameFormat(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

export function containsBlockedWord(username: string): boolean {
  return filter.isProfane(username);
}

export function isClaimableUsername(username: string): boolean {
  return isValidUsernameFormat(username) && !containsBlockedWord(username);
}

/**
 * Constants mirrored from src/config.ts (scoring.basePointsPerShu,
 * scoring.metersPerShu, graze.multiplierTiers, difficulty.scrollSpeed.cap).
 * This file exists so the plausibility math is unit-tested in one place —
 * the enforcement that actually matters runs server-side, in
 * supabase/functions/_shared/leaderboardRules.ts, which duplicates these
 * same functions for the Deno runtime. If you tune scoring/difficulty in
 * config.ts, update both copies.
 */
const BASE_POINTS_PER_SHU = 120;
const MAX_MULTIPLIER = 10;
const SCROLL_SPEED_CAP = 0.95; // shu/s
const METERS_PER_SHU = 100;
/** Generous slack around the theoretical ceiling for frame-timing jitter —
 * this is deliberately loose; it exists to reject fabricated submissions,
 * not to model the exact ramp. */
const SLACK = 1.05;

export function maxScoreForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return BASE_POINTS_PER_SHU * MAX_MULTIPLIER * SCROLL_SPEED_CAP * seconds * SLACK;
}

export function maxMetersForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return SCROLL_SPEED_CAP * seconds * METERS_PER_SHU * SLACK;
}

export function isPlausibleRun(
  score: number,
  distanceMeters: number,
  durationMs: number,
): boolean {
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationMs)
  ) {
    return false;
  }
  if (score < 0 || distanceMeters < 0 || durationMs <= 0) return false;
  if (score > maxScoreForDuration(durationMs)) return false;
  if (distanceMeters > maxMetersForDuration(durationMs)) return false;
  return true;
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm test -- leaderboardRules`
Expected: PASS, all cases green.

- [ ] **Step 6: Write the Deno duplicate**

Create `supabase/functions/_shared/leaderboardRules.ts`:

```ts
// Deno-runtime duplicate of src/net/leaderboardRules.ts. Edge Functions
// deploy independently of the RN app and can't import from src/, so this
// is a manual copy — if you change one, change both. The only difference
// from the client copy is the `npm:` import specifier Deno needs.
import Filter from 'npm:bad-words@^4';

const filter = new Filter();

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,16}$/.test(username);
}

export function containsBlockedWord(username: string): boolean {
  return filter.isProfane(username);
}

export function isClaimableUsername(username: string): boolean {
  return isValidUsernameFormat(username) && !containsBlockedWord(username);
}

const BASE_POINTS_PER_SHU = 120;
const MAX_MULTIPLIER = 10;
const SCROLL_SPEED_CAP = 0.95;
const METERS_PER_SHU = 100;
const SLACK = 1.05;

export function maxScoreForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return BASE_POINTS_PER_SHU * MAX_MULTIPLIER * SCROLL_SPEED_CAP * seconds * SLACK;
}

export function maxMetersForDuration(durationMs: number): number {
  const seconds = durationMs / 1000;
  return SCROLL_SPEED_CAP * seconds * METERS_PER_SHU * SLACK;
}

export function isPlausibleRun(
  score: number,
  distanceMeters: number,
  durationMs: number,
): boolean {
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationMs)
  ) {
    return false;
  }
  if (score < 0 || distanceMeters < 0 || durationMs <= 0) return false;
  if (score > maxScoreForDuration(durationMs)) return false;
  if (distanceMeters > maxMetersForDuration(durationMs)) return false;
  return true;
}
```

Add the sync pointer to the top of `src/net/leaderboardRules.ts` too — insert this as the very first line:
```ts
// Mirrored in supabase/functions/_shared/leaderboardRules.ts for the Deno
// Edge Functions — if you change one, change both.
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/net/leaderboardRules.ts src/net/__tests__/leaderboardRules.test.ts supabase/functions/_shared/leaderboardRules.ts
git commit -m "feat: leaderboard username rules and score plausibility check"
```

---

### Task 3: Deploy the Edge Functions

**Files:**
- Create: `supabase/functions/claim-username/index.ts`
- Create: `supabase/functions/submit-score/index.ts`

**Interfaces:**
- Consumes: `supabase/functions/_shared/leaderboardRules.ts` (Task 2) — `isValidUsernameFormat`, `containsBlockedWord`, `isPlausibleRun`.
- Produces: two deployed HTTPS endpoints, `POST /functions/v1/claim-username` and `POST /functions/v1/submit-score`, consumed by Task 6's `leaderboardApi.ts`.
  - `claim-username` request `{ playerId: string, username: string }` → response `{ ok: true } | { ok: false, reason: 'invalid' | 'profane' | 'taken' }`.
  - `submit-score` request `{ playerId: string, score: number, distance: number, runDurationMs: number }` → response `{ ok: true, improved: boolean } | { ok: false, reason?: string }`.

- [ ] **Step 1: Write `claim-username`**

Create `supabase/functions/claim-username/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isValidUsernameFormat, containsBlockedWord } from '../_shared/leaderboardRules.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const body = await req.json().catch(() => null);
  const playerId = body?.playerId;
  const username = body?.username;

  if (typeof playerId !== 'string' || typeof username !== 'string') {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 400 });
  }
  if (!isValidUsernameFormat(username)) {
    return Response.json({ ok: false, reason: 'invalid' });
  }
  if (containsBlockedWord(username)) {
    return Response.json({ ok: false, reason: 'profane' });
  }

  const { data: existing, error: selectError } = await supabase
    .from('leaderboard')
    .select('player_id')
    .eq('player_id', playerId)
    .maybeSingle();

  if (selectError) {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 500 });
  }

  // Update-only-the-name for an existing player, insert-with-zero-score for
  // a new one — an upsert here would overwrite best_score back to 0 on
  // every rename, which is wrong.
  const { error: writeError } = existing
    ? await supabase
        .from('leaderboard')
        .update({ username, updated_at: new Date().toISOString() })
        .eq('player_id', playerId)
    : await supabase.from('leaderboard').insert({
        player_id: playerId,
        username,
        best_score: 0,
        best_distance: 0,
        best_duration_ms: 0,
      });

  if (writeError) {
    if (writeError.code === '23505') {
      return Response.json({ ok: false, reason: 'taken' });
    }
    return Response.json({ ok: false, reason: 'invalid' }, { status: 500 });
  }

  return Response.json({ ok: true });
});
```

- [ ] **Step 2: Write `submit-score`**

Create `supabase/functions/submit-score/index.ts`:

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isPlausibleRun } from '../_shared/leaderboardRules.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const body = await req.json().catch(() => null);
  const { playerId, score, distance, runDurationMs } = body ?? {};

  if (
    typeof playerId !== 'string' ||
    typeof score !== 'number' ||
    typeof distance !== 'number' ||
    typeof runDurationMs !== 'number'
  ) {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!isPlausibleRun(score, distance, runDurationMs)) {
    return Response.json({ ok: false, reason: 'implausible' }, { status: 400 });
  }

  const { data: existing, error: selectError } = await supabase
    .from('leaderboard')
    .select('best_score')
    .eq('player_id', playerId)
    .maybeSingle();

  if (selectError) {
    return Response.json({ ok: false }, { status: 500 });
  }
  if (existing === null) {
    // No claimed username — nothing to attach this score to.
    return Response.json({ ok: false, reason: 'no_username' }, { status: 404 });
  }
  if (score <= existing.best_score) {
    return Response.json({ ok: true, improved: false });
  }

  const { error: updateError } = await supabase
    .from('leaderboard')
    .update({
      best_score: score,
      best_distance: distance,
      best_duration_ms: runDurationMs,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', playerId);

  if (updateError) {
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, improved: true });
});
```

- [ ] **Step 3: Deploy both functions**

Call `deploy_edge_function` for `claim-username`:
```json
{
  "project_id": "<PROJECT_ID>",
  "name": "claim-username",
  "entrypoint_path": "index.ts",
  "verify_jwt": true,
  "files": [
    { "name": "index.ts", "content": "<Step 1 file contents>" },
    { "name": "_shared/leaderboardRules.ts", "content": "<Task 2 Step 6 file contents>" }
  ]
}
```
Then the same shape for `submit-score` (entrypoint `index.ts` from Step 2, same `_shared/leaderboardRules.ts` content).

- [ ] **Step 4: Verify `claim-username` against the deployed function**

Using the project URL and anon key from Task 1 Step 6:

```bash
export SUPABASE_URL="https://<PROJECT_ID>.supabase.co"
export ANON_KEY="<legacy anon JWT from Task 1 Step 6>"

# valid claim
curl -s -X POST "$SUPABASE_URL/functions/v1/claim-username" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"11111111-1111-1111-1111-111111111111","username":"TestPilot1"}'
# expect: {"ok":true}

# duplicate username, different player
curl -s -X POST "$SUPABASE_URL/functions/v1/claim-username" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"22222222-2222-2222-2222-222222222222","username":"TestPilot1"}'
# expect: {"ok":false,"reason":"taken"}

# profane name
curl -s -X POST "$SUPABASE_URL/functions/v1/claim-username" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"33333333-3333-3333-3333-333333333333","username":"fuckface"}'
# expect: {"ok":false,"reason":"profane"}

# too short
curl -s -X POST "$SUPABASE_URL/functions/v1/claim-username" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"44444444-4444-4444-4444-444444444444","username":"ab"}'
# expect: {"ok":false,"reason":"invalid"}
```

- [ ] **Step 5: Verify `submit-score` against the deployed function**

```bash
# plausible score for the player claimed above — should succeed
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-score" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"11111111-1111-1111-1111-111111111111","score":8000,"distance":6000,"runDurationMs":90000}'
# expect: {"ok":true,"improved":true}

# absurd score for the same run duration — should be rejected
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-score" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"11111111-1111-1111-1111-111111111111","score":999999999,"distance":6000,"runDurationMs":90000}'
# expect: {"ok":false,"reason":"implausible"}

# no claimed username for this player id
curl -s -X POST "$SUPABASE_URL/functions/v1/submit-score" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"playerId":"99999999-9999-9999-9999-999999999999","score":100,"distance":100,"runDurationMs":10000}'
# expect: {"ok":false,"reason":"no_username"} with a 404 status
```

Then clean up the smoke-test rows via `execute_sql`:
```sql
delete from leaderboard where player_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/claim-username/index.ts supabase/functions/submit-score/index.ts
git commit -m "feat: claim-username and submit-score Edge Functions"
```

---

### Task 4: Client Supabase wiring

**Files:**
- Modify: `package.json` (add `@supabase/supabase-js`, `react-native-url-polyfill`, `expo-crypto`)
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `src/net/supabaseClient.ts`

**Interfaces:**
- Produces: `getSupabase(): SupabaseClient` — used by Task 6.

- [ ] **Step 1: Install dependencies**

```bash
npx expo install expo-crypto
npm install @supabase/supabase-js react-native-url-polyfill
```

- [ ] **Step 2: Add the env template**

Create `.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_LEGACY_ANON_JWT
```

- [ ] **Step 3: Ignore the real env file**

In `.gitignore`, under the existing `# local env files` comment, add a line so plain `.env` (not just `.env*.local`) is ignored:
```
# local env files
.env
.env*.local
```

- [ ] **Step 4: Create the real `.env`**

Create `.env` (untracked) at the repo root using the values recorded in Task 1 Step 6:
```
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_ID>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<legacy anon JWT>
```
Expo SDK inlines `EXPO_PUBLIC_*` vars from `.env` into the bundle automatically — no extra Metro config needed.

- [ ] **Step 5: Implement the client**

Create `src/net/supabaseClient.ts`:

```ts
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Lazily created singleton. The leaderboard is the only Supabase consumer,
 * so nothing pays for this until a caller actually needs it. */
export function getSupabase(): SupabaseClient {
  if (client === null) {
    if (!url || !anonKey) {
      throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check .env',
      );
    }
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore src/net/supabaseClient.ts
git commit -m "feat: Supabase client wiring for the leaderboard"
```
(`.env` itself is never committed — confirm `git status` doesn't list it.)

---

### Task 5: Device player id

**Files:**
- Create: `src/state/playerId.ts`
- Test: `src/state/__tests__/playerId.test.ts`

**Interfaces:**
- Produces: `getOrCreatePlayerId(): Promise<string>` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/state/__tests__/playerId.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
  },
}));

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

describe('getOrCreatePlayerId', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  test('creates and persists an id on first call', async () => {
    const { getOrCreatePlayerId } = await import('../playerId');
    const id = await getOrCreatePlayerId();
    expect(id).toBe('test-uuid-1234');
    expect(store.get('cave-heli:player-id-v1')).toBe('test-uuid-1234');
  });

  test('returns the same id on a second call in the same session', async () => {
    const { getOrCreatePlayerId } = await import('../playerId');
    const first = await getOrCreatePlayerId();
    const second = await getOrCreatePlayerId();
    expect(second).toBe(first);
  });

  test('reads a previously persisted id instead of generating a new one', async () => {
    store.set('cave-heli:player-id-v1', 'already-persisted-id');
    const { getOrCreatePlayerId } = await import('../playerId');
    const id = await getOrCreatePlayerId();
    expect(id).toBe('already-persisted-id');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- playerId`
Expected: FAIL — `src/state/playerId.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/state/playerId.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const STORAGE_KEY = 'cave-heli:player-id-v1';

let cached: string | null = null;

/** The device's stable leaderboard identity — generated once, persisted
 * forever until reinstall. There is no account to recover it with. */
export async function getOrCreatePlayerId(): Promise<string> {
  if (cached !== null) return cached;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    cached = stored;
    return stored;
  }
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  cached = id;
  return id;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- playerId`
Expected: PASS, all three cases green.

- [ ] **Step 5: Commit**

```bash
git add src/state/playerId.ts src/state/__tests__/playerId.test.ts
git commit -m "feat: device-generated leaderboard player id"
```

---

### Task 6: Leaderboard API client

**Files:**
- Create: `src/net/leaderboardApi.ts`
- Test: `src/net/__tests__/leaderboardApi.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` (Task 4), `getOrCreatePlayerId()` (Task 5).
- Produces (used by Task 8 and Task 9):
  `claimUsername(username: string): Promise<ClaimResult>` where `ClaimResult = { ok: true } | { ok: false; reason: 'taken' | 'invalid' | 'profane' }`
  `submitScore(score: number, distanceMeters: number, runDurationMs: number): Promise<void>`
  `fetchTop100(): Promise<LeaderboardEntry[]>` where `LeaderboardEntry = { username: string; bestScore: number }`
  `fetchOwnRank(): Promise<number | null>`

- [ ] **Step 1: Write the failing tests**

Create `src/net/__tests__/leaderboardApi.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock('../supabaseClient', () => ({
  getSupabase: () => ({ functions: { invoke }, rpc, from }),
}));

vi.mock('../../state/playerId', () => ({
  getOrCreatePlayerId: () => Promise.resolve('player-123'),
}));

import { claimUsername, submitScore, fetchTop100, fetchOwnRank } from '../leaderboardApi';

describe('claimUsername', () => {
  beforeEach(() => invoke.mockReset());

  test('invokes claim-username with playerId and username', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await claimUsername('SkyPilot');
    expect(invoke).toHaveBeenCalledWith('claim-username', {
      body: { playerId: 'player-123', username: 'SkyPilot' },
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('submitScore', () => {
  beforeEach(() => invoke.mockReset());

  test('invokes submit-score with the run summary', async () => {
    invoke.mockResolvedValue({ data: { ok: true, improved: true }, error: null });
    await submitScore(8000, 6000, 90000);
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: { playerId: 'player-123', score: 8000, distance: 6000, runDurationMs: 90000 },
    });
  });
});

describe('fetchTop100', () => {
  test('maps rows to camelCase entries', async () => {
    const order = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: [{ username: 'A', best_score: 100 }],
        error: null,
      }),
    });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const entries = await fetchTop100();
    expect(entries).toEqual([{ username: 'A', bestScore: 100 }]);
  });
});

describe('fetchOwnRank', () => {
  test('returns the rank from the RPC', async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    const rank = await fetchOwnRank();
    expect(rpc).toHaveBeenCalledWith('get_rank', { p_player_id: 'player-123' });
    expect(rank).toBe(42);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- leaderboardApi`
Expected: FAIL — `src/net/leaderboardApi.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/net/leaderboardApi.ts`:

```ts
import { getSupabase } from './supabaseClient';
import { getOrCreatePlayerId } from '../state/playerId';

export interface LeaderboardEntry {
  username: string;
  bestScore: number;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'taken' | 'invalid' | 'profane' };

export async function claimUsername(username: string): Promise<ClaimResult> {
  const playerId = await getOrCreatePlayerId();
  const { data, error } = await getSupabase().functions.invoke('claim-username', {
    body: { playerId, username },
  });
  if (error) throw error;
  return data as ClaimResult;
}

export async function submitScore(
  score: number,
  distanceMeters: number,
  runDurationMs: number,
): Promise<void> {
  const playerId = await getOrCreatePlayerId();
  await getSupabase().functions.invoke('submit-score', {
    body: { playerId, score, distance: distanceMeters, runDurationMs },
  });
}

export async function fetchTop100(): Promise<LeaderboardEntry[]> {
  const { data, error } = await getSupabase()
    .from('leaderboard')
    .select('username, best_score')
    .order('best_score', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: { username: string; best_score: number }) => ({
    username: row.username,
    bestScore: row.best_score,
  }));
}

export async function fetchOwnRank(): Promise<number | null> {
  const playerId = await getOrCreatePlayerId();
  const { data, error } = await getSupabase().rpc('get_rank', { p_player_id: playerId });
  if (error) throw error;
  return typeof data === 'number' ? data : null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- leaderboardApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/leaderboardApi.ts src/net/__tests__/leaderboardApi.test.ts
git commit -m "feat: leaderboard API client"
```

---

### Task 7: Username field in settings

**Files:**
- Modify: `src/state/settings.tsx`

**Interfaces:**
- Produces: `useSettings().username: string | null` and `useSettings().setUsername(name: string): void` — used by Task 8 and Task 9.

- [ ] **Step 1: Add the field to the `Settings` interface and `DEFAULTS`**

In `src/state/settings.tsx`, add to the `Settings` interface (after `selectedSkin: string;`):
```ts
  /** Claimed leaderboard username, or null if never claimed. */
  username: string | null;
```
And to `DEFAULTS` (after `selectedSkin: FREE_SKIN_ID,`):
```ts
  username: null,
```

- [ ] **Step 2: Add `setUsername` to the context value interface**

In `SettingsContextValue` (after `selectSkin: (id: string) => void;`):
```ts
  /** Records the leaderboard username after a successful claim. */
  setUsername: (name: string) => void;
```

- [ ] **Step 3: Implement and expose it**

After the existing `selectSkin` callback definition, add:
```ts
  const setUsername = useCallback(
    (name: string) => patch({ username: name }),
    [patch],
  );
```
Add `setUsername,` to the `SettingsContext.Provider` value object (alongside `selectSkin,`).

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/state/settings.tsx
git commit -m "feat: persist claimed leaderboard username in settings"
```

---

### Task 8: Submit a score on a new personal best

**Files:**
- Modify: `src/engine/useGameLoop.ts`
- Modify: `src/render/GameScreen.tsx`

**Interfaces:**
- Consumes: `submitScore()` (Task 6), `useSettings().bestScore` / `.username` (Task 7, existing).
- Produces: `useGameLoop()`'s returned `GameLoop` gains `elapsed: SharedValue<number>` (run time in seconds since the last `resetRun`) — available to any future consumer, not just this task.

- [ ] **Step 1: Expose `elapsed` from the game loop**

In `src/engine/useGameLoop.ts`, add to the `GameLoop` interface (after `grazeSeed: SharedValue<number>;`, before `rocks: RockSlot[];`):
```ts
  /** Run time (s) since the last resetRun — how long the current attempt
   * has lasted. */
  elapsed: SharedValue<number>;
```
Add `elapsed,` to the `return { ... }` object at the end of the hook (alongside `grazeSeed,`).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (the shared value already exists internally; this only exposes it).

- [ ] **Step 3: Wire the submission in `GameScreen.tsx`**

Destructure `elapsed` from `loop` alongside the other shared values (find the existing destructure that includes `grazeSeed, rocks, pinches,` and add `elapsed,` to it).

Add the import:
```ts
import { submitScore } from '../net/leaderboardApi';
```

Change the `useSettings()` destructure at the top of the component from:
```ts
const { recordRun, selectedSkin } = useSettings();
```
to:
```ts
const { recordRun, selectedSkin, bestScore, username } = useSettings();
```

Change `handleDeath` from:
```ts
const handleDeath = (finalScore: number, distance: number) => {
    const coins = Math.floor(finalScore / config.coins.pointsPerCoin);
    setGameOver({ score: finalScore, distance, coins });
    stopRotor();
    playCrash();
    hapticCrash();
    recordRun(finalScore, distance, coins);
  };
```
to:
```ts
const handleDeath = (finalScore: number, distance: number, runDurationMs: number) => {
    const coins = Math.floor(finalScore / config.coins.pointsPerCoin);
    setGameOver({ score: finalScore, distance, coins });
    stopRotor();
    playCrash();
    hapticCrash();
    // Fire-and-forget: no username claimed yet, or a network failure,
    // should never interrupt the death screen. Checked BEFORE recordRun,
    // which is what actually updates bestScore.
    if (finalScore > bestScore && username !== null) {
      submitScore(finalScore, distance, runDurationMs).catch(() => {});
    }
    recordRun(finalScore, distance, coins);
  };
```

Update the `useAnimatedReaction` that calls it — change:
```ts
runOnJS(handleDeath)(
          Math.floor(score.value),
          Math.floor(scrollX.value * config.scoring.metersPerShu),
        );
```
to:
```ts
runOnJS(handleDeath)(
          Math.floor(score.value),
          Math.floor(scrollX.value * config.scoring.metersPerShu),
          Math.floor(elapsed.value * 1000),
        );
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

This is UI/engine glue code with no existing test coverage pattern for `GameScreen.tsx` (screens in this codebase are verified on-device, not unit tested — see Task 10's device pass). Confirm now with a quick read-through: `elapsed.value` is read on the UI thread inside the same `useAnimatedReaction` that reads `score.value`/`scrollX.value`, at the exact moment `phase` transitions to `PHASE_DEAD` — before `resetRun()` could zero it on a later retry.

- [ ] **Step 6: Commit**

```bash
git add src/engine/useGameLoop.ts src/render/GameScreen.tsx
git commit -m "feat: submit a score to the leaderboard on a new personal best"
```

---

### Task 9: Leaderboard screen and navigation

**Files:**
- Create: `src/render/LeaderboardScreen.tsx`
- Modify: `App.tsx`
- Modify: `src/render/MenuScreen.tsx`
- Modify: `src/render/LoadingScreen.tsx`

**Interfaces:**
- Consumes: `claimUsername`, `fetchTop100`, `fetchOwnRank` (Task 6); `isValidUsernameFormat` (Task 2); `useSettings().username` / `.setUsername` (Task 7).

- [ ] **Step 1: Implement the screen**

Create `src/render/LeaderboardScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { isValidUsernameFormat } from '../net/leaderboardRules';
import {
  claimUsername,
  fetchOwnRank,
  fetchTop100,
  type LeaderboardEntry,
} from '../net/leaderboardApi';
import { useSettings } from '../state/settings';
import { GameButton } from './GameButton';
import { theme } from './theme';

interface LeaderboardScreenProps {
  onBack: () => void;
}

export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const { username, setUsername } = useSettings();
  const [claiming, setClaiming] = useState(username === null);
  const [draftName, setDraftName] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [ownRank, setOwnRank] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([fetchTop100(), fetchOwnRank()])
      .then(([top, rank]) => {
        setEntries(top);
        setOwnRank(rank);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!claiming) load();
  }, [claiming, load]);

  const handleClaim = () => {
    if (!isValidUsernameFormat(draftName)) {
      setClaimError('3-16 letters, numbers, or _');
      return;
    }
    setClaimError(null);
    claimUsername(draftName)
      .then((result) => {
        if (!result.ok) {
          setClaimError(
            result.reason === 'taken'
              ? 'That name is taken'
              : result.reason === 'profane'
                ? 'Not allowed — try another'
                : 'Invalid name',
          );
          return;
        }
        setUsername(draftName);
        setClaiming(false);
      })
      .catch(() => setClaimError('Network error — try again'));
  };

  if (claiming) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>PICK A NAME</Text>
        <TextInput
          style={styles.input}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="username"
          placeholderTextColor="rgba(220, 227, 236, 0.35)"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={16}
        />
        {claimError !== null && <Text style={styles.error}>{claimError}</Text>}
        <View style={styles.claimButton}>
          <GameButton label="CLAIM" onPress={handleClaim} />
        </View>
        <View style={styles.footer}>
          <GameButton label="BACK" variant="secondary" onPress={onBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>LEADERBOARD</Text>
      {loadError && (
        <Text style={styles.error}>Couldn't load — check your connection</Text>
      )}
      {entries === null && !loadError && <Text style={styles.hint}>Loading…</Text>}
      {entries !== null && (
        <ScrollView style={styles.list}>
          {entries.map((entry, i) => (
            <View
              key={entry.username}
              style={[styles.row, entry.username === username && styles.rowSelf]}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.name}>{entry.username}</Text>
              <Text style={styles.score}>{entry.bestScore}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      {ownRank !== null && ownRank > 100 && (
        <View style={[styles.row, styles.rowSelf, styles.rowPinned]}>
          <Text style={styles.rank}>{ownRank}</Text>
          <Text style={styles.name}>{username}</Text>
        </View>
      )}
      <View style={styles.footer}>
        <GameButton label="BACK" variant="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.backgroundTop,
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 14,
  },
  title: {
    color: theme.colors.hud,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  hint: {
    color: '#8a94a3',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 24,
  },
  error: {
    color: theme.colors.amber,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  input: {
    marginTop: 28,
    width: 240,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 182, 72, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: theme.colors.hud,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
  claimButton: {
    marginTop: 20,
  },
  list: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(220, 227, 236, 0.08)',
  },
  rowSelf: {
    backgroundColor: 'rgba(255, 182, 72, 0.1)',
  },
  rowPinned: {
    width: '100%',
    maxWidth: 480,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 182, 72, 0.3)',
  },
  rank: {
    width: 48,
    color: '#8a94a3',
    fontSize: 14,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: theme.colors.hud,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  score: {
    color: theme.colors.coinGold,
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    paddingTop: 14,
    alignItems: 'center',
  },
});
```

- [ ] **Step 2: Wire the screen into `App.tsx`**

Add the import:
```ts
import { LeaderboardScreen } from './src/render/LeaderboardScreen';
```
Change the `Screen` union:
```ts
type Screen = 'menu' | 'game' | 'settings' | 'shop' | 'leaderboard';
```
Add a case to the `switch`, alongside the `'shop'` case:
```ts
case 'leaderboard':
      current = <LeaderboardScreen onBack={() => setScreen('menu')} />;
      break;
```
Pass a new handler to `MenuScreen`:
```tsx
<MenuScreen
          onPlay={() => setScreen('game')}
          onSettings={() => setScreen('settings')}
          onShop={() => setScreen('shop')}
          onLeaderboard={() => setScreen('leaderboard')}
        />
```

- [ ] **Step 3: Add the menu button**

In `src/render/MenuScreen.tsx`, add `onLeaderboard: () => void;` to `MenuScreenProps` and destructure it in the function signature (`{ onPlay, onSettings, onShop, onLeaderboard }`). Add a fourth button after SETTINGS:
```tsx
<GameButton label="PLAY" onPress={onPlay} />
          <GameButton label="SHOP" variant="secondary" onPress={onShop} />
          <GameButton
            label="LEADERBOARD"
            variant="secondary"
            onPress={onLeaderboard}
          />
          <GameButton label="SETTINGS" variant="secondary" onPress={onSettings} />
```

- [ ] **Step 4: Grow the fixed action-area slot for the 4th button**

Both `MenuScreen.tsx` and `LoadingScreen.tsx` have an `actionArea` style with a hardcoded `height: 200` — they're deliberately mirrored (see the comment on each) so the boot-screen crossfade doesn't shift the title position. Adding a 4th non-compact button needs more room: change `height: 200` to `height: 260` in **both** files' `actionArea` style. This is an estimate (4 buttons × ~54px + 3 gaps × 14px ≈ 258px) — confirm it visually in Step 6 below and adjust the number in both files together if the buttons clip or the boot crossfade jumps.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: On-device verification**

Run the app (Expo dev client — this app uses Skia/Reanimated/gesture-handler native modules, so it is not Expo-Go-compatible) and confirm:
- MENU shows a 4th LEADERBOARD button, no visual clipping against SHOP/SETTINGS, and the boot-loading-screen-to-menu crossfade doesn't visibly jump the title.
- Tapping LEADERBOARD with no username set shows the "PICK A NAME" prompt; claiming a valid, available name shows the board.
- Claiming a name already taken (e.g. one from Task 3's curl tests, if not yet cleaned up, or claim the same name twice on two fresh installs/simulators) shows "That name is taken".
- Playing a run that beats your local best score, then reopening LEADERBOARD, shows your entry updated.
- Force-close network (airplane mode) and confirm the death screen still works normally — no crash, no error dialog — and the board screen shows "Couldn't load".

- [ ] **Step 7: Commit**

```bash
git add src/render/LeaderboardScreen.tsx App.tsx src/render/MenuScreen.tsx src/render/LoadingScreen.tsx
git commit -m "feat: leaderboard screen, username claim flow, and menu entry"
```

---

### Task 10: Version bump and final verification

**Files:**
- Modify: `app.json`
- Modify: `package.json`

**Interfaces:** None — this is the release-readiness pass.

- [ ] **Step 1: Bump the version**

In `app.json`, change `"version": "1.0.0"` to `"version": "1.0.1"`.
In `package.json`, change `"version": "1.0.0"` to `"version": "1.0.1"`.
(`eas.json`'s `production.autoIncrement: true` handles the iOS build number automatically — no change needed there.)

- [ ] **Step 2: Full headless verification**

Run, in order:
```bash
npm test
npx tsc --noEmit
npx expo export --platform ios
```
Expected: all tests pass (existing 50 + the new ones from Tasks 2, 5, 6), no type errors, and the export completes without bundler errors (confirms the new Supabase/net code and the `bad-words`/`expo-crypto`/`react-native-url-polyfill` dependencies all bundle cleanly).

- [ ] **Step 3: Commit**

```bash
git add app.json package.json
git commit -m "chore: bump version to 1.0.1"
```

- [ ] **Step 4: Note the remaining App Store blocker**

Not a code task, but don't submit 1.0.1 without it: per the spec, a Privacy Policy URL and an updated App Privacy questionnaire (username + device id, collected, not used for tracking) are now required in App Store Connect since this version sends data off-device for the first time. This wasn't required for 1.0.0.
