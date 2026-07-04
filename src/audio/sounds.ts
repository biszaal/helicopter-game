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
  click.volume = 0.7;
  rotor.volume = ROTOR_BASE_VOLUME;
  rotor.loop = true;
  crash.volume = 0.9;
  zone.volume = 0.8;
  whoosh.volume = 0.5;
  players = { click, rotor, crash, zone, whoosh };
}

export function setSoundEnabled(on: boolean): void {
  soundOn = on;
  if (!on) players?.rotor.pause();
}

export function playClick(): void {
  if (!soundOn || players === null) return;
  players.click.seekTo(0);
  players.click.play();
}

export function startRotor(): void {
  if (!soundOn || players === null) return;
  setRotorIntensity(0); // fresh runs start at base pitch
  players.rotor.seekTo(0);
  players.rotor.play();
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
  players.whoosh.seekTo(0);
  players.whoosh.play();
}

/** Zone milestone chime. */
export function playZoneChime(): void {
  if (!soundOn || players === null) return;
  players.zone.seekTo(0);
  players.zone.play();
}

export function stopRotor(): void {
  players?.rotor.pause();
}

export function playCrash(): void {
  if (!soundOn || players === null) return;
  players.crash.seekTo(0);
  players.crash.play();
}
