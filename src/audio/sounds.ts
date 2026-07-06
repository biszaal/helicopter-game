import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

/**
 * Sound manager. Players are created once by initAudio() and reused; every
 * play call is a cheap seek-to-start + play. The module-level enabled flag
 * is synced from settings so UI-thread event handlers (via runOnJS) never
 * need React context.
 */

let soundOn = true;
let players: {
  click: AudioPlayer;
  rotor: AudioPlayer;
  crash: AudioPlayer;
  zone: AudioPlayer;
  whoosh: AudioPlayer;
  ding: AudioPlayer;
} | null = null;

const ROTOR_BASE_VOLUME = 0.45;
/** Extra rotor volume at the full scroll-speed ramp (fraction of base).
 * Intensity is volume-ONLY by design: every AVPlayer rate change is an
 * audible discontinuity and the looper churns queue items per cycle, so
 * playbackRate modulation made the loop stutter and warble. Volume changes
 * are click-free. */
const ROTOR_VOLUME_SPAN = 0.35;

/** Status updates are unused — a long interval keeps the native periodic
 * time observer and its JS events out of the frame budget. */
const PLAYER_OPTIONS = { updateInterval: 60000 };

/** Rewind then play, waiting for the seek to actually land first.
 * seekTo() is async on both iOS and Android while play() is synchronous —
 * firing them back-to-back let play() race ahead of the native rewind, so
 * a one-shot sound retriggered at/near its end (the common case) sometimes
 * played zero audible frames. */
export function restartAndPlay(player: Pick<AudioPlayer, 'seekTo' | 'play'>): void {
  player.seekTo(0).then(() => player.play());
}

/** Idempotent. Call once at app start, before any play call matters. */
export async function initAudio(): Promise<void> {
  if (players !== null) return;
  await setAudioModeAsync({ playsInSilentMode: true });
  const click = createAudioPlayer(
    require('../../assets/sounds/click.wav'),
    PLAYER_OPTIONS,
  );
  const rotor = createAudioPlayer(
    require('../../assets/sounds/rotor-loop.wav'),
    PLAYER_OPTIONS,
  );
  const crash = createAudioPlayer(
    require('../../assets/sounds/crash.wav'),
    PLAYER_OPTIONS,
  );
  const zone = createAudioPlayer(
    require('../../assets/sounds/zone.wav'),
    PLAYER_OPTIONS,
  );
  const whoosh = createAudioPlayer(
    require('../../assets/sounds/whoosh.wav'),
    PLAYER_OPTIONS,
  );
  const ding = createAudioPlayer(
    require('../../assets/sounds/ding.wav'),
    PLAYER_OPTIONS,
  );
  click.volume = 0.7;
  rotor.volume = ROTOR_BASE_VOLUME;
  rotor.loop = true;
  crash.volume = 0.9;
  zone.volume = 0.8;
  whoosh.volume = 0.5;
  ding.volume = 0.6;
  players = { click, rotor, crash, zone, whoosh, ding };
}

export function setSoundEnabled(on: boolean): void {
  soundOn = on;
  if (!on) players?.rotor.pause();
}

export function playClick(): void {
  if (!soundOn || players === null) return;
  restartAndPlay(players.click);
}

export function startRotor(): void {
  if (!soundOn || players === null) return;
  setRotorIntensity(0); // fresh runs start at base pitch
  restartAndPlay(players.rotor);
}

/** Rotor urgency from the scroll-speed ramp progress (0–1) — volume only. */
export function setRotorIntensity(progress: number): void {
  if (players === null) return;
  const p = Math.min(1, Math.max(0, progress));
  players.rotor.volume = ROTOR_BASE_VOLUME * (1 + ROTOR_VOLUME_SPAN * p);
}

/** Graze banked — a quick air-cut past the rock. */
export function playWhoosh(): void {
  if (!soundOn || players === null) return;
  restartAndPlay(players.whoosh);
}

/** Zone milestone chime. */
export function playZoneChime(): void {
  if (!soundOn || players === null) return;
  restartAndPlay(players.zone);
}

const DING_STREAK_WINDOW_MS = 1000;
const DING_RATE_STEP = 0.06;
const DING_RATE_MAX = 1.6;
let dingStreak = 0;
let lastDingAtMs = 0;

/** Coin collected. Consecutive pickups within a second climb in pitch —
 * a trail reads as an arpeggio. Rate on a ONE-SHOT player is safe (the
 * looper lesson applies to loops). */
export function playCoinDing(): void {
  if (!soundOn || players === null) return;
  const now = Date.now();
  dingStreak = now - lastDingAtMs <= DING_STREAK_WINDOW_MS ? dingStreak + 1 : 0;
  lastDingAtMs = now;
  players.ding.setPlaybackRate(
    Math.min(DING_RATE_MAX, 1 + DING_RATE_STEP * dingStreak),
  );
  restartAndPlay(players.ding);
}

export function stopRotor(): void {
  players?.rotor.pause();
}

export function playCrash(): void {
  if (!soundOn || players === null) return;
  restartAndPlay(players.crash);
}
