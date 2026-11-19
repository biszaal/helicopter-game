# Supabase project: shared with Cascade

This project (`cave-helicopter`, ref `dqiwnvfqmexpuzbwjhha`, us-east-1) is **shared by two
games**. Since 19 November 2026 it also hosts the backend of **Cascade: Colour Sorting**
(`com.biszaal.cascade`, repo `biszaal/cascade`), whose own project was lost. Every change made
here reaches live Cascade players as well as Helicopter's.

## Who owns what

| Owner | Objects |
|---|---|
| Helicopter | `public.leaderboard`, `public.get_rank`, edge functions `submit-score` and `claim-username`, the migrations in `supabase/migrations/` |
| Cascade | everything named `cascade_*` in `public`: tables `cascade_profiles`, `cascade_progress`, `cascade_level_results`, `cascade_daily_results` (with their `cascade_*` constraints and indexes), functions `cascade_daily_leaderboard`, `cascade_delete_my_account`, `cascade_handle_new_user`, and the trigger `cascade_on_auth_user_created` on `auth.users` |
| Both | `auth.users`, and the project settings, anonymous sign-ins in particular |

Cascade's schema lives in the Cascade repo's `supabase/migrations/` (0001-0007). It was applied
with `supabase db query --project-ref dqiwnvfqmexpuzbwjhha`, not `supabase db push`, so this
repo's migration history contains only Helicopter's migrations, and `db push` from here won't
try to change Cascade's objects.

## Rules for changes from this repo

- **Leave `cascade_*` alone.** Don't drop, rename or alter those objects, or the
  `cascade_on_auth_user_created` trigger on `auth.users`.
- **Never reset the project** (`supabase db reset` against it, or wiping the database): Cascade's
  players' results go with it.
- **Keep anonymous sign-ins on.** Both games sign every player in anonymously.
- **No schema-wide permission changes** on `public` (blanket `revoke`, or
  `alter default privileges`). Grant and revoke per object instead.
- **Don't delete `auth.users` in bulk.** Cascade's rows reference their user with
  `on delete cascade`, so they go too. Each game's players are separate auth users: a person who
  plays both has one account per game.
- **Name new objects so they can't collide.** Cascade owns the `cascade_` prefix. A new
  Helicopter object should use a `helicopter_` prefix, or at least a name Cascade can't plausibly
  reach for (`profiles`, `progress` and `delete_my_account` are exactly that kind of name).

The trigger on `auth.users` only acts on users Cascade tagged at sign-up
(`raw_user_meta_data->>'game' = 'cascade'`), so Helicopter's anonymous sign-ins are unaffected.
