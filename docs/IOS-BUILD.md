# Getting MASSFRONT onto an iPhone

**No `.ipa` ships with this repo, and none can be produced here.** Apple only
permits compiling and code-signing an iOS app on macOS, with Xcode and an
Apple ID/Developer account. This environment is Linux — it can (and did)
prepare every part of the iOS project that doesn't require a Mac: the Xcode
project itself, the app icons, the launch screen, `Info.plist`, and the
web payload baked into `ios/App/App/public`. The one remaining step —
opening Xcode and pressing Run — needs a Mac, which only you have.

Two real paths exist. Pick based on what you have available today.

| | needs | result | App Store? |
|---|---|---|---|
| **A. PWA (below)** | any iPhone + a place to host `www/` | installed home-screen app, works today | no |
| **B. Xcode** | a Mac + free or paid Apple ID | real native app, `.ipa` | paid account only |

---

## Path A — Add to Home Screen (works today, no Mac needed)

MASSFRONT's web build is a self-contained WebGL2 app with no server-side
dependency, and `index.html` already carries the iOS PWA meta tags
(`apple-mobile-web-app-capable`, `apple-touch-icon` at 152/167/180px, and a
`manifest.json` with the right icon set). That means this path is not a
watered-down fallback — it's a genuinely complete way to play.

1. **Host the `www/` folder** somewhere reachable over HTTPS. Any static host
   works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, or even
   `python3 -m http.server` on a machine on the same Wi-Fi as the phone (use
   its LAN IP, e.g. `http://192.168.1.20:8000`, over plain HTTP — Add to Home
   Screen doesn't require HTTPS on a local network, but a public host does).
2. On the iPhone, open that URL **in Safari** — it must be Safari; Chrome and
   other iOS browsers cannot install to the Home Screen because they don't
   implement it, Apple reserves that to WebKit.
3. Tap the **Share** icon → **Add to Home Screen** → **Add**.
4. Launch it from the new home-screen icon. It opens full-screen, with no
   Safari chrome, its own icon, and a black status bar — indistinguishable
   at a glance from a native install.

### What genuinely works
- Full gameplay: the WebGL2 renderer, the sim, the whole UI. Nothing in the
  game is native-only.
- Local save data (`localStorage`) and match state persist between launches.
- The in-game OTA updater (`src/updater.js`) stores downloaded builds in
  IndexedDB and works fine under Safari/WKWebView — both support IndexedDB.

### What to know before relying on it
- **No App Store listing, no StoreKit.** A Home Screen web app can't be
  distributed through the App Store and can't do native in-app purchases.
- **iOS can evict storage on disuse.** Safari's storage policy can clear a
  site's `localStorage`/IndexedDB if the installed app goes unopened for an
  extended stretch (weeks, tied to Intelligent Tracking Prevention / on-device
  storage pressure). Actively-played installs aren't affected in practice;
  an install that sits untouched for a long time could lose local saves and
  any OTA-downloaded update package, falling back to the version that shipped
  in `www/` at install time.
- **The OTA updater needs a server.** Out of the box there's "no update
  server set" (visible on the main menu) — it applies deltas from a URL you
  configure yourself, same as the native build. Without one, the PWA is a
  static snapshot of whatever `www/` contained when the user added it to
  Home Screen; you'd need to tell users to remove and re-add it to pick up
  a new build, or stand up an update server and have them set it once from
  Settings → Update Source.
- No push notifications, no background execution, no haptics beyond what
  Safari exposes to a web page (i.e. none).

This is the right path if you want the user playing *today*, or if you never
intend to publish to the App Store.

---

## Path B — the real native app, through Xcode

### What's already done for you
- `ios/App/App.xcodeproj` — a complete, current Capacitor 8 iOS project.
- App icons for every required iOS size (20/29/40/58/60/76/80/87/120/152/
  167/180/1024 px) are populated in
  `ios/App/App/Assets.xcassets/AppIcon.appiconset`, generated from the
  game's 1024px master in `assets/icons/`. All are opaque RGB (no alpha),
  which the App Store's icon validator requires.
- Launch screen: the 2732×2732 splash is in
  `ios/App/App/Assets.xcassets/Splash.imageset`.
- `Info.plist`: status bar hidden, home indicator auto-hidden, full screen,
  portrait plus both landscape directions on iPhone, all four orientations on
  iPad, and a matching `assets/app.webmanifest` `"orientation": "any"` policy.
  The War Table/HUD capture gate covers portrait and landscape. `arm64`/`metal` only
  (no 32-bit), and `ITSAppUsesNonExemptEncryption = false` so App Store
  Connect stops asking the export-compliance question.
- Inline media playback and no-user-gesture-required playback are already on
  — Capacitor's `CAPBridgeViewController` sets
  `allowsInlineMediaPlayback = true` and
  `mediaTypesRequiringUserActionForPlayback = []` unconditionally, so nothing
  extra was needed there.
- No permissions requested — the game doesn't touch camera, mic, location,
  photos, contacts, etc., and `Info.plist` declares none of those usage
  strings, so no unnecessary permission prompts will appear.
- App identity matches the Android build exactly: bundle ID
  `com.creatorjd.massfront`, display name `MASSFRONT`, version `1.0` (build
  `1`) — same as `android/app/build.gradle`'s `applicationId`/`versionName`.
- The current web build is already synced in:
  `ios/App/App/public` was refreshed with `npx cap sync ios` and verified to
  be byte-identical to the repo's `www/` folder.
- **No CocoaPods.** This project uses Swift Package Manager
  (`ios/App/CapApp-SPM`), Capacitor 8's default. There's no `Podfile`, no
  `pod install` step, and no Pods folder to go stale — Xcode resolves the
  `capacitor-swift-pm` package from GitHub automatically the first time you
  open the project (needs internet once for that).

### What you need
- A Mac running **macOS 13 or later**, with **Xcode 15 or later** installed
  from the App Store (free).
- An Apple ID. A free personal Apple ID is enough to build and run on your
  own iPhone. You do **not** need a paid account for that.
- A USB cable (or Wi-Fi debugging once paired once) to connect the iPhone,
  or the iOS Simulator if you just want to see it run.

### Steps
1. Unzip `MASSFRONT-ios.zip` on the Mac.
2. Open it: either double-click `ios/App/App.xcodeproj`, or from a terminal
   in the unzipped folder run `npx cap open ios` (this needs `npm install`
   first if you want the Capacitor CLI available — it's optional, opening
   the `.xcodeproj` directly works identically).
3. Let Xcode finish resolving Swift packages (a progress bar at the top on
   first open — this needs internet).
4. Select the **App** target in the project navigator → **Signing &
   Capabilities** tab.
5. Tick **Automatically manage signing**, then pick your name under **Team**
   (sign into your Apple ID in Xcode → Settings → Accounts first if it's not
   listed).
6. Plug in the iPhone (or pick a Simulator), select it as the run
   destination in the toolbar, and press **Run** (▶).
7. First launch on a physical device: iOS will refuse to open it until you
   go to **Settings → General → VPN & Device Management** on the phone and
   trust the developer certificate.

### The free-account catch
With a **free Apple ID**, the app is signed with a certificate that expires
**every 7 days** — after that, iOS refuses to launch it and you have to
reconnect the phone to Xcode and press Run again to re-sign it. This is an
Apple policy, not a limitation of this project; there's no way around it
without enrolling in the paid program.

With a **paid Apple Developer account ($99/year)**, signed builds last a
year, and you unlock:
- **TestFlight** — upload a build (Product → Archive → Distribute App →
  App Store Connect), and invite testers by email; no App Store review
  needed for internal testers (up to 100), external testers need a light
  review (usually under a day).
- **App Store submission** — the same Archive path, choosing
  "App Store Connect" as the destination, then filling in the listing and
  submitting for review.

### If you're preparing for App Store review
- **Age rating**: fantasy machine-on-machine combat, no blood, no human
  characters — this typically lands at 9+.
- **Privacy**: the game makes no network requests and collects nothing
  unless you've configured cloud sync/sign-in (see `docs/ACCOUNTS.md`) — if
  you haven't, declare "Data Not Collected".
- **Screenshots**: Apple requires 6.7" and 6.5" iPhone sizes at minimum.

### Rebuilding after future changes
Nothing under `ios/` should be hand-edited except through Capacitor. After
any change to the web game (`src/`, `index.html`, `assets/`), re-run
`npm run ios:sync` (which packs `www/` and runs `npx cap sync ios`) before
opening/rebuilding in Xcode, so the native shell picks up the new build.

---

## Bottom line

Nothing here is blocked by anything fixable in this environment. The Xcode
project, icons, splash, `Info.plist`, and web payload are done and verified
against a live boot of the game (iPhone-sized viewports, both with and
without a notch — no clipping, no console errors, no page errors). The only
gap is that Apple requires macOS to compile and sign, which is a platform
rule, not a missing step here. If you want to be playing on your phone in
the next five minutes, use Path A. If you want an App Store listing or a
signed `.ipa`, Path B needs your Mac and your Apple ID.
