import { describe, expect, test, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock('../supabaseClient', () => ({
  getSupabase: () => ({ functions: { invoke }, rpc, from }),
}));

vi.mock('../../state/playerId', () => ({
  getOrCreatePlayerId: () => Promise.resolve('player-123'),
}));

import {
  claimUsername,
  submitScore,
  syncBestScore,
  fetchTop100,
  fetchOwnRank,
} from '../leaderboardApi';
import { runDurationMsForDistance } from '../../engine/spawning';

describe('syncBestScore', () => {
  beforeEach(() => invoke.mockReset());

  test('submits the saved best with the duration its distance takes', async () => {
    invoke.mockResolvedValue({ data: { ok: true, improved: true }, error: null });
    await syncBestScore(16715, 10656);
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: {
        score: 16715,
        distance: 10656,
        // Rounded up: best_duration_ms is an integer column, and the exact
        // 127854.805… ms made Postgres reject every sync (2026-11-20).
        runDurationMs: Math.ceil(runDurationMsForDistance(10656)),
      },
    });
    const { runDurationMs } = invoke.mock.calls[0][1].body;
    expect(Number.isInteger(runDurationMs)).toBe(true);
  });

  test('does nothing when there is no saved best yet', async () => {
    await syncBestScore(0, 0);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('claimUsername', () => {
  beforeEach(() => invoke.mockReset());

  test('ensures a session exists, then invokes claim-username with just the username', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const result = await claimUsername('SkyPilot');
    expect(invoke).toHaveBeenCalledWith('claim-username', {
      body: { username: 'SkyPilot' },
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('submitScore', () => {
  beforeEach(() => invoke.mockReset());

  test('ensures a session exists, then invokes submit-score with just the run summary', async () => {
    invoke.mockResolvedValue({ data: { ok: true, improved: true }, error: null });
    await submitScore(8000, 6000, 90000);
    expect(invoke).toHaveBeenCalledWith('submit-score', {
      body: { score: 8000, distance: 6000, runDurationMs: 90000 },
    });
  });
});

describe('fetchTop100', () => {
  test('maps rows to camelCase entries', async () => {
    const order = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({
        data: [{ username: 'A', best_score: 100 }],
        error: null,
      }),
    });
    const select = vi.fn().mockReturnValue({ order });
    from.mockReturnValue({ select });

    const entries = await fetchTop100();
    expect(entries).toEqual([{ username: 'A', bestScore: 100 }]);
  });
});

describe('fetchOwnRank', () => {
  test('returns the rank from the RPC', async () => {
    rpc.mockResolvedValue({ data: 42, error: null });
    const rank = await fetchOwnRank();
    expect(rpc).toHaveBeenCalledWith('get_rank', { p_player_id: 'player-123' });
    expect(rank).toBe(42);
  });
});
