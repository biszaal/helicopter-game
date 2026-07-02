/**
 * Generates all app icons + splash art from a single vector design.
 * Run: node scripts/generate-assets.js
 *
 * Design language: dark cave, light grey-box helicopter (matches the in-game
 * placeholder), one amber "close call" spark where the rotor almost meets a
 * stalactite — the game's core mechanic, in the logo.
 */
const sharp = require('sharp');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');

const C = {
  bgTop: '#2d3440',
  bgBottom: '#14181f',
  caveBack: '#1e242e',
  caveFront: '#0d1117',
  heli: '#dce3ec',
  window: '#1a2028',
  spark: '#ffb648',
  streak: '#39414e',
  text: '#dce3ec',
};

/**
 * The helicopter mark + graze spark, drawn in a 1024-space.
 * Bounds (incl. spark): x 284..732, y 378..654 — centre ≈ (508, 516).
 */
function heliMark({ color = C.heli, withSpark = true, windowColor = C.window } = {}) {
  const spark = withSpark
    ? `
    <radialGradient id="sparkGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${C.spark}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${C.spark}" stop-opacity="0"/>
    </radialGradient>
    <circle cx="702" cy="406" r="52" fill="url(#sparkGlow)"/>
    <path d="M702 372 L713 395 L738 406 L713 417 L702 440 L691 417 L666 406 L691 395 Z" fill="${C.spark}"/>`
    : '';
  return `
  <g>
    <!-- rotor blade + mast -->
    <rect x="310" y="430" width="390" height="30" rx="15" fill="${color}"/>
    <rect x="495" y="455" width="30" height="50" fill="${color}"/>
    <!-- tail fin + boom -->
    <rect x="284" y="478" width="26" height="70" rx="12" fill="${color}"/>
    <rect x="292" y="526" width="130" height="30" rx="15" fill="${color}"/>
    <!-- body -->
    <rect x="400" y="498" width="240" height="104" rx="48" fill="${color}"/>
    <rect x="552" y="518" width="64" height="46" rx="18" fill="${windowColor}"/>
    <!-- skids -->
    <rect x="460" y="598" width="16" height="42" fill="${color}"/>
    <rect x="570" y="598" width="16" height="42" fill="${color}"/>
    <rect x="420" y="636" width="210" height="18" rx="9" fill="${color}"/>
    ${spark}
  </g>`;
}

function caveTeeth() {
  return `
  <g fill="${C.caveBack}">
    <polygon points="60,0 220,0 140,230"/>
    <polygon points="320,0 470,0 395,170"/>
    <polygon points="850,0 1010,0 935,240"/>
    <polygon points="120,1024 280,1024 200,850"/>
    <polygon points="690,1024 860,1024 778,860"/>
  </g>
  <g fill="${C.caveFront}">
    <polygon points="140,0 330,0 230,210"/>
    <polygon points="600,0 820,0 704,368"/>
    <polygon points="930,0 1024,0 1024,150"/>
    <polygon points="0,0 90,0 30,160"/>
    <polygon points="0,1024 100,790 220,1024"/>
    <polygon points="820,1024 916,830 1010,1024"/>
  </g>`;
}

function speedStreaks() {
  return `
  <g fill="${C.streak}">
    <rect x="130" y="536" width="110" height="14" rx="7"/>
    <rect x="96" y="572" width="150" height="14" rx="7"/>
    <rect x="150" y="608" width="90" height="14" rx="7"/>
  </g>`;
}

function bgGradient(w, h) {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.bgTop}"/>
      <stop offset="100%" stop-color="${C.bgBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>`;
}

// ---- Full app icon: cave scene + helicopter, 1024×1024 full bleed ----
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bgGradient(1024, 1024)}
  ${caveTeeth()}
  ${speedStreaks()}
  ${heliMark()}
</svg>`;

// ---- Android adaptive foreground: heli centred in the ~66% safe zone ----
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <g transform="translate(256 256) scale(0.62) translate(-508 -516)">
    ${heliMark()}
  </g>
</svg>`;

// ---- Android adaptive background: gradient + faint teeth at the edges ----
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1024 1024">
  ${bgGradient(1024, 1024)}
  ${caveTeeth()}
</svg>`;

// ---- Android monochrome: white silhouette, no spark ----
const monochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432" viewBox="0 0 432 432">
  <g transform="translate(216 216) scale(0.6) translate(-492 -516)">
    ${heliMark({ color: '#ffffff', withSpark: false, windowColor: 'rgba(0,0,0,0)' })}
  </g>
</svg>`;

// ---- Splash: heli mark + wordmark on transparent (bg colour via app.json) ----
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 400) scale(1.05) translate(-508 -516)">
    ${heliMark()}
  </g>
  <text x="512" y="700" text-anchor="middle" fill="${C.text}"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700"
    font-size="140" letter-spacing="26">CAVE</text>
  <text x="512" y="775" text-anchor="middle" fill="${C.spark}"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600"
    font-size="52" letter-spacing="20">HELICOPTER</text>
</svg>`;

async function run() {
  await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(path.join(OUT, 'icon.png'));
  await sharp(Buffer.from(foregroundSvg)).resize(512, 512).png().toFile(path.join(OUT, 'android-icon-foreground.png'));
  await sharp(Buffer.from(backgroundSvg)).resize(512, 512).png().toFile(path.join(OUT, 'android-icon-background.png'));
  await sharp(Buffer.from(monochromeSvg)).resize(432, 432).png().toFile(path.join(OUT, 'android-icon-monochrome.png'));
  await sharp(Buffer.from(splashSvg)).resize(1024, 1024).png().toFile(path.join(OUT, 'splash-icon.png'));
  await sharp(Buffer.from(iconSvg)).resize(48, 48).png().toFile(path.join(OUT, 'favicon.png'));
  console.log('assets written to', OUT);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
