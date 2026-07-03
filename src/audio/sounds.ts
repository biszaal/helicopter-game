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
} | null = null;

const ROTOR_BASE_VOLUME = 0.45;
/** At full scroll-speed ramp the rotor spins 25% faster (pitch rises too —
 * no pitch correction on purpose) and plays 20% louder. */
const ROTOR_RATE_SPAN = 0.25;
const ROTOR_VOLUME_SPAN = 0.2;

/** Idempotent. Call once at app start, before any play call matters. */
export async function initAudio(): Promise<void> {
  if (players !== null) return;
  await setAudioModeAsync({ playsInSilentMode: true });
  const click = createAudioPlayer(require('../../assets/sounds/click.wav'));
  const rotor = createAudioPlayer(require('../../assets/sounds/rotor-loop.wav'));
  const crash = createAudioPlayer(require('../../assets/sounds/crash.wav'));
  const zone = createAudioPlayer(require('../../assets/sounds/zone.wav'));
  click.volume = 0.7;
  rotor.volume = ROTOR_BASE_VOLUME;
  rotor.loop = true;
  crash.volume = 0.9;
  zone.volume = 0.8;
  players = { click, rotor, crash, zone };
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

/** Rotor urgency mapped from the scroll-speed ramp progress (0–1). */
export function setRotorIntensity(progress: number): void {
  if (players === null) return;
  const p = Math.min(1, Math.max(0, progress));
  players.rotor.setPlaybackRate(1 + ROTOR_RATE_SPAN * p);
  players.rotor.volume = ROTOR_BASE_VOLUME * (1 + ROTOR_VOLUME_SPAN * p);
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
