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
