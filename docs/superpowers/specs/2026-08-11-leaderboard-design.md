# Worldwide Leaderboard — Design (v1.0.1)

Approved in chat 2026-08-11. First network/backend feature in the app — until
now everything is local-only (AsyncStorage, `src/state/settings.tsx`), no
accounts, no data leaves the device. This changes that, on purpose, for one
narrow feature: a single global "best scores" board.

## Identity: unique username, no login

- One row per player. A player is identified by a `player_id` — a
  `crypto.randomUUID()` generated once on-device and persisted alongside the
  existing settings blob (`src/state/settings.tsx` storage key). Lost on
  reinstall; that's an accepted tradeoff, not a bug to fix here.
- **Username is unique**, enforced by a case-insensitive unique index in
  Postgres (`unique index on lower(username)`) — first claim wins. No real
  auth backs this: if a device is reinstalled, its old username stays
  attached to the now-orphaned `player_id` forever. Account recovery is
  explicitly out of scope (see below).
- Constraints: 3–16 characters, `[a-zA-Z0-9_]` only. Checked client-side for
  instant feedback, re-checked server-side as the source of truth.
- Claim flow: prompted the first time the player opens the Leaderboard
  screen (or from Settings to change it later, which re-claims — the old
  username is released). Submits to the `claim-username` Edge Function,
  which checks the profanity block-list, checks the format, and attempts
  the unique insert/update. A `23505` (unique violation) from Postgres means
  "taken" — surfaced as "username taken, try another," not a crash.

## Data model (Supabase Postgres)

Single table:

```sql
create table leaderboard (
  player_id     uuid primary key,
  username      text not null,
  best_score    integer not null,
  best_distance numeric not null,
  best_duration_ms integer not null,
  updated_at    timestamptz not null default now()
);
create unique index leaderboard_username_unique on leaderboard (lower(username));
create index leaderboard_score_desc on leaderboard (best_score desc);
```

**RLS**: `SELECT` open to `anon` (the board is public). No `INSERT`/`UPDATE`/
`DELETE` policy for `anon` at all — every write goes through Edge Functions
using the service-role key, which bypasses RLS. This is what makes the
anti-cheat check below actually enforceable instead of advisory.

**Reads** go straight from the client via the Supabase JS client (no Edge
Function needed for a public `SELECT`):
- Top 100: `select username, best_score from leaderboard order by best_score desc limit 100`.
- Own rank (pinned even if outside top 100): an RPC
  `get_rank(p_player_id uuid) returns integer` — a single indexed count
  query (`count(*) where best_score > (select best_score from leaderboard where player_id = p_player_id)`).

## Edge Functions

**`claim-username`** — `{ playerId, username }` → checks format + block-list,
attempts `insert ... on conflict (player_id) do update set username = excluded.username`
guarded by the unique index; returns `{ ok: true }` or `{ ok: false, reason: 'taken' | 'invalid' | 'profane' }`.

**`submit-score`** — `{ playerId, score, distance, runDurationMs }`:
1. Reject non-finite / negative / non-integer inputs outright.
2. **Plausibility check.** `src/config.ts` fixes `scoring.basePointsPerShu = 120`,
   `graze.multiplierTiers` maxing at `10`, and `difficulty.scrollSpeed.cap = 0.95`
   shu/s. Points bank at `basePointsPerShu × multiplier × scrollSpeed(t)` per
   second, and both multiplier and speed are capped — so a deliberately
   generous (not exact) upper bound for a run of `T` seconds is:
   ```
   maxScore(T) = basePointsPerShu × 10 × 0.95 × T   // = 1140 × T
   maxMeters(T) = 0.95 × T × scoring.metersPerShu    // = 95 × T
   ```
   Reject (with a small `×1.05` slack for timing jitter) if
   `score > maxScore(runDurationMs / 1000) × 1.05` or the claimed distance
   exceeds `maxMeters` similarly. This isn't full replay verification — it
   doesn't model the actual ramp ODE or the fact that ×10 requires
   sustained back-to-back grazes — it just kills the trivial case of an
   arbitrary large number posted for a short/no run. Good enough for v1;
   tightening it later (e.g. modeling the real ramp) is a follow-up if abuse
   shows up.
3. If a row exists for `player_id` and `score <= best_score`, no-op
   (return current rank). Otherwise upsert the new best and return the new
   rank.

Both functions share one profanity block-list (a bundled word array —
same list used by the client for instant feedback, duplicated
server-side as the enforced copy).

## Client integration

- `src/state/playerId.ts` — generates/persists the device UUID.
- `src/state/username.ts` (or folded into `settings.tsx`) — holds the
  claimed username locally once `claim-username` succeeds; `null` until
  claimed.
- `src/net/leaderboard.ts` — thin wrapper: `claimUsername()`, `submitScore()`,
  `fetchTop100()`, `fetchOwnRank()`. Supabase client configured with the
  project's anon key (public, safe to bundle — RLS is what protects writes,
  not the key).
- Hook into `recordRun` (`src/state/settings.tsx`) — when a run's score beats
  the local `bestScore`, fire `submitScore()` after the local state update.
  Fire-and-forget: no loading spinner, no error dialog on the death screen.
  A failed submission (offline, server error) is simply retried the next
  time the player beats their best — no queue, no background retry job.
- `src/screens/LeaderboardScreen.tsx` — new menu entry alongside Shop/
  Settings. Scrollable top-100 list, player's own row pinned/highlighted
  even when outside the top 100 (fetched via `fetchOwnRank`). Loading/
  empty/error states, same visual language as `ShopScreen`.

## Privacy & App Store requirements (blocker, not part of this build)

Once a username + device id leave the device, Apple requires a **Privacy
Policy URL** in App Store Connect (distinct from the Support/Marketing URL
already discussed) and an updated App Privacy questionnaire (Identifiers +
User Content: username, collected, linked to a random device id, not used
for tracking). I'll draft the policy text as a follow-up doc; hosting it
somewhere public is on the user before 1.0.1 can be submitted — flagged
here so it isn't discovered at submission time.

## Out of scope

- Full replay-based anti-cheat.
- Weekly/seasonal boards (all-time only, per the earlier decision).
- Account recovery / re-linking a username after reinstall.
- Reporting/flagging other players' usernames after the fact (block-list
  catches obvious cases at claim time only).
- Android (the app is iOS-only today; the schema doesn't prevent a future
  Android client from using the same backend).

## Verification

Headless: `npx tsc --noEmit`; vitest for the plausibility-bound math and the
profanity block-list matcher (pure functions, same pattern as
`src/engine`). Edge Functions tested against a local Supabase instance
(`supabase start`) before deploying. On device: claim a username, confirm
duplicate claims are rejected, beat a best score and confirm it appears on
the board within the top-100 fetch, confirm a synthetic out-of-bounds score
POSTed directly at the Edge Function (bypassing the client) is rejected.
