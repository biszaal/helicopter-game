drop policy "public read" on leaderboard;
create policy "public read" on leaderboard
  for select
  to anon, authenticated
  using (true);

grant execute on function get_rank(uuid) to authenticated;
