# Building MASSFRONT for iPhone and iPad

Everything that can be prepared off a Mac is prepared. The Xcode project exists,
the icons and launch images are in the asset catalogue, `Info.plist` is
configured, and the web layer carries the WKWebView fixes. What remains is the
compile itself, which Apple only permits on macOS.

There are two ways to get the game onto an Apple device, and one of them needs
nothing but Safari.

---

## Option A — install from Safari, right now (no Mac, no account)

The game ships as an installable web app. On the iPhone or iPad:

1. Open the hosted `index.html` in **Safari** (it must be Safari — Chrome on iOS
   cannot install to the Home Screen).
2. Share sheet → **Add to Home Screen**.
3. Launch it from the Home Screen icon.

It runs full screen with no browser chrome, keeps its own icon and splash
screen, stores progress locally, and behaves like an installed app. This is a
genuine iOS build path, not a fallback — it is how a large number of mobile web
games ship — and it is the fastest way to play on a phone today.

Its one real limitation is the App Store: a Home Screen web app cannot be listed
there, and cannot use StoreKit.

---

## Option B — a native `.ipa` through Xcode

Requirements: a Mac running macOS 13 or later, Xcode 15+, Node 18+, and an
Apple ID. No CocoaPods needed — this project uses Swift Package Manager
(`ios/App/CapApp-SPM`), which Xcode resolves automatically on first open. A
free Apple ID is enough to run on your own device; a paid Apple Developer
account ($99/yr) is required for TestFlight and the App Store.

    git clone <this project>          # or unpack the tarball
    cd massfront-game
    npm install
    npm run ios:sync                  # stages www/ and copies it into the Xcode project
    npx cap open ios                  # opens ios/App/App.xcodeproj in Xcode

In Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Tick *Automatically manage signing* and choose your Team. Xcode will
   provision `com.creatorjd.massfront`; change the bundle identifier if that one
   is taken.
3. Pick your device from the run destination menu and press **Run**.

To produce a distributable build: **Product → Archive**, then *Distribute App*.
Choose *TestFlight & App Store* for the store, or *Ad Hoc* / *Development* for
direct device installs.

After any change to the game, `npm run ios:sync` and build again. Nothing in
`ios/` needs editing by hand — it is generated, and `sync` refreshes the web
payload inside it.

---

## What is already configured

**Icons and launch images.** `assets/icons/` holds the full set, generated from
one 1024px master, and every required iOS size (20/29/40/58/60/76/80/87/120/
152/167/180/1024px) plus the 2732 splash are populated in
`ios/App/App/Assets.xcassets` as an explicit appiconset — safe for any Xcode
version and command-line builds, not dependent on the single-size
auto-generation feature. Regenerate any of them at any size from the master
if the artwork changes.

**`Info.plist`.**
- Required capabilities are `arm64` + `metal` rather than the default `armv7`,
  which is a 32-bit capability that would refuse to build against a modern-only
  deployment target.
- Portrait only on iPhone. A one-handed strategy HUD has no landscape layout,
  and letting the device rotate into one it does not have is worse than not
  offering it.
- Status bar hidden, light content, full screen, home indicator auto-hidden —
  the HUD owns the bottom edge.
- `ITSAppUsesNonExemptEncryption = false`, so App Store Connect stops asking the
  export-compliance question on every upload. The game ships no cryptography.

**WKWebView behaviour.** Safari needs several things stated that Chrome infers,
and any one of them missing turns a game gesture into a browser gesture:
long-press callout, text selection, tap highlight, rubber-band scrolling and
double-tap zoom are all disabled, with selection re-enabled only on text inputs
and `pan-y` restored inside the scrolling panels.

**Audio.** iOS creates every `AudioContext` suspended and will only resume it
inside a real user gesture — and can suspend it again afterwards for a call or
the ring switch. A one-shot unlock listener stays armed for the whole session
and plays the silent buffer WebKit actually wants.

**Resolution.** Device pixel ratio is capped at 2.0, and at 1.75 on the larger
iPhone panels. A Pro Max at DPR 3 asks for roughly two and a half times the
pixels of the same scene on a typical Android phone for no visible gain at
command-view zoom, and fill rate is this renderer's bottleneck.

**Viewport.** `viewport-fit=cover` plus `env(safe-area-inset-*)` throughout, and
the canvas re-measures on `orientationchange` and on `visualViewport` resize —
Safari fires the former before layout settles, and WKWebView resizes again when
the home indicator area animates.

---

## App Store notes

If you take it to review, three things matter for this game specifically.

*Age rating* — fantasy machine-on-machine violence with no blood and no human
figures. 9+ is the usual outcome; 12+ if you describe it conservatively.

*Privacy* — the game collects nothing and makes no network requests. Declare
"Data Not Collected", which is the simplest possible nutrition label.

*Screenshots* — 6.7" and 6.5" iPhone sizes are required. The base-building view
is the one that communicates what the game is; for the action frame, capture a
live match at command zoom with a full army engaged.

The Mega Battle / SANDBOX mode was removed in 1.33.45 — it was a 10,000-unit
bench that no longer represented the game, and it sat on the front strip as if
it were a mode. It used to be the recommended screenshot source, so capture
from a real match instead.
