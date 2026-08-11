import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/** Lazily created singleton. The leaderboard is the only Supabase consumer,
 * so nothing pays for this until a caller actually needs it.
 *
 * persistSession/autoRefreshToken are true — the player's identity is an
 * anonymous Supabase Auth session (Task 5), which must survive app
 * restarts the same way the old device-generated UUID did, and the
 * Edge Functions verify this session's JWT server-side (Task 3), so it
 * can't be left to expire silently mid-session. */
export function getSupabase(): SupabaseClient {
  if (client === null) {
    if (!url || !anonKey) {
      throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — check .env',
      );
    }
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
