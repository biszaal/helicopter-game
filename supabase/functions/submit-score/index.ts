import { createClient } from 'npm:@supabase/supabase-js@2';
// Deployed via the Supabase MCP deploy_edge_function tool, which nests
// uploaded files under its own source/ dir — the deploy call's files array
// must use './_shared/leaderboardRules.ts' even though this file (matching
// the real repo layout) correctly imports '../_shared/leaderboardRules.ts'.
import { isPlausibleRun } from '../_shared/leaderboardRules.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authData.user) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const playerId = authData.user.id;

  const body = await req.json().catch(() => null);
  const { score, distance, runDurationMs } = body ?? {};

  if (
    typeof score !== 'number' ||
    typeof distance !== 'number' ||
    typeof runDurationMs !== 'number'
  ) {
    return Response.json({ ok: false }, { status: 400 });
  }
  // best_duration_ms is an integer column. App builds 1.0.1 (iOS 11, Android
  // 4) send a fractional duration when syncing a saved best, which made the
  // UPDATE fail with a 500 and left those players at 0. Rounded up here so
  // already-shipped clients work, and so the plausibility ceiling only ever
  // gets more lenient by under 1 ms.
  const durationMs = Math.ceil(runDurationMs);
  if (!isPlausibleRun(score, distance, durationMs)) {
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
      best_duration_ms: durationMs,
      updated_at: new Date().toISOString(),
    })
    .eq('player_id', playerId);

  if (updateError) {
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, improved: true });
});
