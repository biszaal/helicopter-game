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
    body: { score, distance: distanceMeters, runDurationMs },
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
