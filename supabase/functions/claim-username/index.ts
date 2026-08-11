import { createClient } from 'npm:@supabase/supabase-js@2';
// Deployed via the Supabase MCP deploy_edge_function tool, which nests
// uploaded files under its own source/ dir — the deploy call's files array
// must use './_shared/leaderboardRules.ts' even though this file (matching
// the real repo layout) correctly imports '../_shared/leaderboardRules.ts'.
import { isValidUsernameFormat, containsBlockedWord } from '../_shared/leaderboardRules.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 401 });
  }
  const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authData.user) {
    return Response.json({ ok: false, reason: 'invalid' }, { status: 401 });
  }
  const playerId = authData.user.id;

  const body = await req.json().catch(() => null);
  const username = body?.username;

  if (typeof username !== 'string') {
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
