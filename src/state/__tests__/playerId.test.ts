import { describe, expect, test, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const signInAnonymously = vi.fn();

vi.mock('../../net/supabaseClient', () => ({
  getSupabase: () => ({ auth: { getSession, signInAnonymously } }),
}));

import { getOrCreatePlayerId } from '../playerId';

describe('getOrCreatePlayerId', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInAnonymously.mockReset();
  });

  test('returns the existing session user id without signing in again', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'existing-user-id' } } } });
    const id = await getOrCreatePlayerId();
    expect(id).toBe('existing-user-id');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  test('signs in anonymously and returns the new user id when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: { id: 'new-anon-id' } }, error: null });
    const id = await getOrCreatePlayerId();
    expect(id).toBe('new-anon-id');
  });

  test('throws if anonymous sign-in fails', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInAnonymously.mockResolvedValue({ data: { user: null }, error: new Error('boom') });
    await expect(getOrCreatePlayerId()).rejects.toThrow('boom');
  });
});
