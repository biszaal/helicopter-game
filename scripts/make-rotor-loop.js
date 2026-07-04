// Synthesized helicopter rotor loop. Every deterministic component has an
// integer number of cycles in the loop length, so the wrap is mathematically
// seamless; the noise bed gets a 50 ms wrap-crossfade. Replaces a recorded
// loop whose energy varied 85x per cycle with a broken seam.
const fs = require('fs');
const SR = 44100;
const L = 32; // seconds
const N = SR * L;

// Broadband body: double-lowpassed noise, wrap-faded tail -> head.
const noise = new Float64Array(N);
let lp = 0;
let lp2 = 0;
for (let i = 0; i < N; i++) {
  const w = Math.random() * 2 - 1;
  lp += 0.12 * (w - lp);
  lp2 += 0.5 * (lp - lp2);
  noise[i] = lp2;
}
const fade = Math.floor(SR * 0.05);
for (let i = 0; i < fade; i++) {
  const t = i / fade;
  noise[N - fade + i] = noise[N - fade + i] * (1 - t) + noise[i] * t;
}

const TWO_PI = 2 * Math.PI;
const CHOP_HZ = 13; // main-rotor blade pass (integer cycles in L)
const TAIL_HZ = 52; // tail-rotor buzz
const buf = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  // Raised-cosine pulse train: one "whoomp" per blade pass.
  const chopPhase = (t * CHOP_HZ) % 1;
  const pulse = Math.pow(0.5 + 0.5 * Math.cos(TWO_PI * chopPhase), 3);
  const chopAm = 0.45 + 0.55 * pulse;
  const tailAm = 0.9 + 0.1 * Math.sin(TWO_PI * TAIL_HZ * t);
  // Engine hum: neighbouring integer partials beat at 1 Hz for movement.
  const hum =
    0.16 * Math.sin(TWO_PI * 104 * t) +
    0.12 * Math.sin(TWO_PI * 105 * t) +
    0.07 * Math.sin(TWO_PI * 208 * t);
  buf[i] = noise[i] * 2.2 * chopAm * tailAm + hum * (0.8 + 0.2 * pulse);
}

let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = 0.6 / peak;
const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(buf[i] * gain * 32767), i * 2);
}
const h = Buffer.alloc(44);
h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4);
h.write('WAVE', 8); h.write('fmt ', 12);
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28);
h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
h.write('data', 36); h.writeUInt32LE(data.length, 40);
fs.writeFileSync(process.argv[2], Buffer.concat([h, data]));
console.log('wrote', process.argv[2]);
