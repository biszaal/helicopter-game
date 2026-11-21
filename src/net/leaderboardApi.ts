import { getSupabase } from './supabaseClient';
import { runDurationMsForDistance } from '../engine/spawning';
import { getOrCreatePlayerId } from '../state/playerId';

export interface LeaderboardEntry {
  username: string;
  bestScore: number;
}

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'taken' | 'invalid' | 'profane' };

export async function claimUsername(username: string): Promise<ClaimResult> {
  await getOrCreatePlayerId(); // ensures an anonymous session exists to authenticate this call
  const { data, error } = await getSupabase().functions.invoke('claim-username', {
    body: { username },
  });
  if (error) throw error;
  return data as ClaimResult;
}

export async function submitScore(
  score: number,
  distanceMeters: number,
  runDurationMs: number,
): Promise<void> {
  await getOrCreatePlayerId(); // ensures an anonymous session exists to authenticate this call
  await getSupabase().functions.invoke('submit-score', {
    // best_duration_ms is an integer column: a fractional duration (as
    // syncBestScore's computed one is) makes the whole write fail. Rounded
    // up so the server's plausibility ceiling only ever gets more lenient.
    body: { score, distance: distanceMeters, runDurationMs: Math.ceil(runDurationMs) },
  });
}

/**
 * Makes sure the server holds the best score saved on this device. Runs
 * only submit live when they beat the LOCAL best, so a best set before the
 * player claimed a name (or one whose submit failed offline) would never
 * reach the board. The server keeps whichever score is higher, so this is
 * safe to call repeatedly. The best's own duration was never stored, but
 * run time is a pure function of distance (runDurationMsForDistance).
 */
export async function syncBestScore(
  bestScore: number,
  bestDistanceMeters: number,
): Promise<void> {
  if (bestScore <= 0 || bestDistanceMeters <= 0) return;
  await submitScore(
    bestScore,
    bestDistanceMeters,
    runDurationMsForDistance(bestDistanceMeters),
  );
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
