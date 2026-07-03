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
} | null = null;

/** Idempotent. Call once at app start, before any play call matters. */
export async function initAudio(): Promise<void> {
  if (players !== null) return;
  await setAudioModeAsync({ playsInSilentMode: true });
  const click = createAudioPlayer(require('../../assets/sounds/click.wav'));
  const rotor = createAudioPlayer(require('../../assets/sounds/rotor-loop.wav'));
  const crash = createAudioPlayer(require('../../assets/sounds/crash.wav'));
  click.volume = 0.7;
  rotor.volume = 0.45;
  rotor.loop = true;
  crash.volume = 0.9;
  players = { click, rotor, crash };
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
  players.rotor.seekTo(0);
  players.rotor.play();
}

export function stopRotor(): void {
  players?.rotor.pause();
}

export function playCrash(): void {
  if (!soundOn || players === null) return;
  players.crash.seekTo(0);
  players.crash.play();
}
