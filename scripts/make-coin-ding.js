// Synthesized coin-collect ding: a 90 ms E6 blip with a soft 2nd harmonic.
// Played with a rising playback rate for consecutive pickups (arpeggio).
const fs = require('fs');
const SR = 44100;
const N = Math.floor(SR * 0.09);
const buf = new Float64Array(N);

const F = 1318.51; // E6
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const env = Math.exp(-t * 40);
  buf[i] =
    env *
    (0.8 * Math.sin(2 * Math.PI * F * t) +
      0.25 * Math.sin(2 * Math.PI * F * 2 * t));
}

let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = 0.7 / peak;
const fade = Math.floor(SR * 0.002); // de-click both edges
const data = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  let v = buf[i] * gain;
  if (i < fade) v *= i / fade;
  if (i > N - fade) v *= (N - i) / fade;
  data.writeInt16LE(Math.round(v * 32767), i * 2);
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
