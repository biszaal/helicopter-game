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
