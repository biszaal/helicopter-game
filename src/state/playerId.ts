import { getSupabase } from '../net/supabaseClient';

/** The device's stable leaderboard identity — a Supabase Anonymous Auth
 * session. No visible login UI, nothing the player types; the session is
 * persisted by the Supabase client itself (Task 4's AsyncStorage-backed
 * config), not managed here. Lost on reinstall, same as the old
 * device-UUID approach — there is no account to recover it with. */
export async function getOrCreatePlayerId(): Promise<string> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session !== null) return session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || data.user === null) {
    throw error ?? new Error('Anonymous sign-in returned no user');
  }
  return data.user.id;
}
