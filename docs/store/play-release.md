# Google Play release — Cave Helicopter (Android)

Package `com.biszaal.helicopter`. Play Console app **Cave Helicopter Game**, in the Biszaal
Tech Ltd **organization** developer account (`biszaaltech@gmail.com`), alongside Ludo,
Cascade and Expenzez. Organization accounts are exempt from Google's 12-testers-for-14-days
rule, so a release can go from Internal testing straight to Production.

Everything below was entered in Play Console on 20 Nov 2026. This file records what was
answered and why, so the answers can be kept in step with the app.

## What is automated, and what is not

| Step | How |
|---|---|
| Production build (.aab) | `npx eas-cli build -p android --profile production`. The upload keystore lives on EAS. `versionCode` is kept on EAS and auto-increments. |
| First upload to Play | **By hand**: Google's API cannot accept an app's first upload. Test and release → Testing → Internal testing → Create new release → upload the `.aab` from the EAS build page. |
| Later uploads | `npx eas-cli submit -p android` once `submit.production.android.serviceAccountKeyPath` is set in `eas.json` and the key file is in the repo root (gitignored). No key is set up yet. |

## Store listing

Grow users → Store presence → Main store listing. Default language en-US.

- **App name** (30): `Cave Helicopter Game`
- **Short description** (80): `Fly a helicopter through a closing cave. Graze rocks to multiply your score.`
- **Full description** (4000):

```
Fly a helicopter through a cave that keeps closing in. Drag anywhere to steer, let go to hold your height, and see how far you can get.

FLY CLOSE, SCORE MORE
Skim past a rock without touching it and your multiplier climbs, all the way to ×10. Play it safe and it drains away again. The biggest scores belong to the pilots who fly closest to danger.

A CAVE THAT FIGHTS BACK
The deeper you go, the faster you fly and the bigger the rocks grow. Narrow corridors pinch the cave around you, and further in, walls of rock leave you a single gap.

FOUR ZONES
Start in the Shallows, then push on through The Drift, where rocks float up and down, The Walls, under a dark city skyline, and The Deep, where the cave glows with crystals.

SIX HELICOPTERS
Every 1,000 points earns a coin. Spend them in the shop on new colours, from Midnight and Ember all the way to Gold.

WORLDWIDE LEADERBOARD
Pick a username and see how your best run compares with pilots everywhere. It's optional: skip it and nothing leaves your phone.

• Simple one-finger controls
• No ads and no in-app purchases
• Plays offline (the leaderboard needs a connection)
• Sound and haptics you can switch off
```

Every claim maps to `src/config.ts`: zones and their distances (`zones`), the ×10 top tier
(`graze.multiplierTiers`), drifting rocks from The Drift (`behaviors.drift.unlockZone 1`),
rock walls from The Walls (`behaviors.rockWall.unlockZone 2`), 1,000 points per coin
(`coins.pointsPerCoin`), and six skins (`shop.skins`). Update the copy if those change.

**Graphics**, all in `docs/store/play/`:

| Asset | File | Notes |
|---|---|---|
| App icon | `icon-512.png` | `assets/icon.png` scaled to 512 × 512 |
| Feature graphic | `feature-graphic-1024x500.png` | A frame from The Walls with the title over it |
| Phone screenshots | `screenshots/01-fly-close.png` … `05-six-helicopters.png` | 1920 × 1080 (16:9), so they count toward promotion eligibility |

The screenshots are real frames from the game on the Android emulator, set in a captioned
frame. To reach the deeper zones the helicopter was made crash-proof in a local, uncommitted
edit for one run, so the multipliers in shots 2–4 are higher than a typical player's.
Captions: "Fly close, score more", "A cave that fights back", "Four zones to reach", "How
deep can you go?", "Six helicopters".

**Store settings**: category Game → **Arcade**. Contact email **hello@biszaaltech.com** (the
address in the privacy policy and the deletion page). Website https://www.biszaaltech.com/games.

## App content

Policy and programmes → App content. All ten declarations are complete.

- **Privacy policy**: https://www.biszaaltech.com/games/helicopter/privacy
- **Ads**: No.
- **Sign-in details (app access)**: nothing is restricted. No login, no paywall.
- **Advertising ID**: No. No ads or analytics SDKs. Check the merged manifest for
  `com.google.android.gms.permission.AD_ID` if a dependency is ever added.
- **Government apps**, **financial features**, **health apps**: none.
- **Target audience**: 13–15, 16–17, 18+. The privacy policy says the game is not directed
  to children under 13, and choosing under-13 groups would bring in the Families policy.
- **Content rating** (IARC, category Game, contact biszaaltech@gmail.com): every question
  answered No. The crash is a vehicle hitting rock, with no characters, blood or aggression.
  Usernames are shown on a leaderboard, but there is no chat, messaging or media sharing.
  Result: **ESRB Everyone, PEGI 3, IARC 3+**, with no content descriptors.

### Data safety

- Collects or shares required data: **Yes**. Encrypted in transit: **Yes** (HTTPS to Supabase).
- Account creation: **Other**: "Optional leaderboard only. Opening the leaderboard creates an
  anonymous account automatically, and the player picks a public username. No email, password
  or sign-in."
- Delete account URL: https://www.biszaaltech.com/games/helicopter/delete-account. The game
  links to it from Settings › Delete my leaderboard data. That in-app route is what Google's
  account-deletion policy requires.
- Data types, all **collected, not shared, not ephemeral, optional** (players choose to use
  the leaderboard):

| Category → type | What it is | Purposes |
|---|---|---|
| Personal info → **User IDs** | The anonymous account id and the chosen username | App functionality, Account management |
| App activity → **Other actions** | Best score, distance, run duration, time set | App functionality, Fraud prevention (the server's plausibility check) |

Nothing else is collected: no location, contacts, device or advertising IDs, diagnostics or
crash logs. Supabase hosts the data for us, which Play does not count as sharing.

## Release notes (first release, 500 max)

```
Cave Helicopter's first release on Android. Fly a helicopter through a cave that keeps closing in, graze the rocks for up to ×10 points, unlock six helicopters, and take on the worldwide leaderboard.
```

## Permissions

The app needs only INTERNET, VIBRATE and MODIFY_AUDIO_SETTINGS (plus network state and wake
lock from libraries). `app.json` removes everything else with expo-audio's
`recordAudioAndroid: false` and `android.blockedPermissions` (RECORD_AUDIO,
SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE). **versionCode 3, the first internal
build, predates that change and still requests them.** versionCode 4 is clean. Check a bundle
with `unzip -p app.aab base/manifest/AndroidManifest.xml | strings | grep permission`.
`android.permission.DUMP` still shows up in that output, and that is expected: it is the
`android:permission` that guards AndroidX's `ProfileInstallReceiver`, not a permission the
app requests.

## Production submission (21 Nov 2026)

- versionCode 4 (1.0.1) sent to Production, full rollout, all 177 countries plus rest of world,
  together with the store listing and every App content declaration (12 changes). Managed
  publishing is off, so it goes live as soon as Google approves it.
- Play's pre-review check flagged `android.hardware.screen.landscape` as a required feature
  (from the landscape orientation lock). It was ignored, with the reason given: the game only
  runs in landscape, so the requirement is correct.
- Form factors: Play opted the app into Google Play Games on PC by default, and that was left
  on.

## Before promoting to production

- [ ] Played on a real Android phone from the internal track: a run to The Drift, the
      back button (pause, menu), Settings › Delete my leaderboard data, and claiming a name.
- [ ] Check the right edge in landscape on a phone with a side camera cutout. In Expo Go on
      the emulator the background gradient stopped about 100 px short of the edge.
- [ ] Publishing overview shows no remaining issues, then send for review.
