import { describe, expect, test, vi } from 'vitest';

// sounds.ts imports expo-audio at module scope; the real package pulls in
// RN/Metro globals (__DEV__) that don't exist under vitest, so it must be
// stubbed out before sounds.ts is imported.
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(() => ({ seekTo: vi.fn(), play: vi.fn() })),
  setAudioModeAsync: vi.fn(() => Promise.resolve()),
}));

const { restartAndPlay } = await import('../sounds');

/**
 * expo-audio's seekTo() is async on both iOS (Swift continuation) and
 * Android (AsyncFunction), while play() is synchronous. Calling them
 * back-to-back without awaiting the seek lets play() race ahead of the
 * native rewind — audible as a sound that sometimes just doesn't play.
 */
function makeDeferredPlayer() {
  const calls: string[] = [];
  let resolveSeek!: () => void;
  const seekPromise = new Promise<void>((resolve) => {
    resolveSeek = () => {
      calls.push('seek-resolved');
      resolve();
    };
  });
  const player = {
    seekTo: () => {
      calls.push('seek-called');
      return seekPromise;
    },
    play: () => {
      calls.push('play-called');
    },
  };
  return { player, calls, resolveSeek };
}

describe('restartAndPlay', () => {
  test('does not call play() until the seek has resolved', async () => {
    const { player, calls, resolveSeek } = makeDeferredPlayer();

    restartAndPlay(player as unknown as Parameters<typeof restartAndPlay>[0]);

    // Seek is in flight; play() must not have fired yet.
    expect(calls).toEqual(['seek-called']);

    resolveSeek();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toEqual(['seek-called', 'seek-resolved', 'play-called']);
  });
});
