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
-- no row yet (a SQL function returns null when its query yields zero rows).
create or replace function get_rank(p_player_id uuid)
returns integer
language sql
stable
as $$
  select count(*) + 1
  from leaderboard l
  where l.best_score > (
    select best_score from leaderboard where player_id = p_player_id
  )
  and exists (select 1 from leaderboard where player_id = p_player_id);
$$;

grant execute on function get_rank(uuid) to anon;
