# Getting a `.ipa` for iPhone

## Why one isn't already in the zip

An `.ipa` is a compiled ARM64 iOS binary. Producing it requires `xcodebuild`,
the iOS SDK, and Apple's Swift/Clang toolchain — all macOS-only, and licensed so
they cannot be redistributed or run on Linux. There is no cross-compiler for
this and no workaround that produces a real, installable binary. Anything
claiming to be an `.ipa` that wasn't built on a Mac is a zip full of nothing.

So the question is not "how do I get an .ipa without a Mac" but "whose Mac".
Three answers, cheapest first.

---

## Option A — GitHub's Mac, free, no hardware (recommended)

`.github/workflows/ios-ipa.yml` rents a macOS runner from GitHub Actions,
builds the app there, and hands back a real `.ipa` as a downloadable artifact.
Free for public repositories; private repos get a monthly minutes allowance and
macOS minutes count 10× against it, so a build costs roughly 100 minutes of quota.

1. Push this project to a GitHub repository.
2. **Actions** tab → **Build iOS IPA** → **Run workflow**.
3. When it finishes (~5–10 min), open the run and download the
   **MASSFRONT-ipa** artifact.

With no secrets configured it produces `MASSFRONT-unsigned.ipa`. Unsigned means
iOS will refuse it as-is — nothing unsigned runs on a stock iPhone — so you
re-sign it with your own Apple ID at install time:

* **Sideloadly** (Windows or macOS, free) — plug the iPhone in, drag the `.ipa`
  in, enter your Apple ID. Re-signs and installs.
* **AltStore / SideStore** — same idea, and AltStore can refresh the app in the
  background so it doesn't expire.

A free Apple ID signature lasts **7 days**, after which the app stops launching
until you re-sign it. A paid Apple Developer account ($99/yr) extends that to a
year and unlocks TestFlight.

### Building a properly signed `.ipa` in CI

Add these four repository secrets and the same workflow switches to a signed
archive-and-export automatically — no file edits:

| Secret | What it is |
|---|---|
| `IOS_CERT_P12_BASE64` | your Apple Distribution certificate, `base64 -i cert.p12` |
| `IOS_CERT_PASSWORD` | the password you set when exporting that `.p12` |
| `IOS_PROFILE_BASE64` | your provisioning profile, `base64 -i profile.mobileprovision` |
| `IOS_TEAM_ID` | the 10-character Team ID from your Apple Developer account |

---

## Option B — a Mac you can borrow for ten minutes

1. Unzip `MASSFRONT-ios.zip`.
2. Open `ios/App/App.xcodeproj` in Xcode 15 or newer.
3. Select the **App** target → **Signing & Capabilities** → tick *Automatically
   manage signing* and pick your team (a free Apple ID works).
4. Plug in the iPhone, choose it as the destination, press **Run**.

That installs straight to the device without ever producing an `.ipa`. To get a
file instead: **Product → Archive → Distribute App → Ad Hoc / Development**.

First launch on the device will refuse to open until you approve the developer
certificate: **Settings → General → VPN & Device Management → Trust**.

---

## Option C — no Mac, no GitHub, working today

The game is a self-contained WebGL2 app, so it runs as a home-screen web app
with no build step at all:

1. Host the `www/` folder on any static HTTPS host (Cloudflare Pages, Netlify,
   GitHub Pages — all free).
2. Open the URL in **Safari** on the iPhone.
3. **Share → Add to Home Screen.**

It launches fullscreen with its own icon and no browser chrome, and everything
in the game works. Two honest limitations: there is no App Store presence, and
iOS may evict `localStorage`/IndexedDB — your saves and any downloaded patch —
after a long stretch without opening it. Export a `.mfsave` file before a long break
and that risk goes away.

---

## What I already fixed for iOS

* **Shared scheme committed** at `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`.
  Xcode keeps schemes per-user by default, and `xcodebuild -scheme App` cannot
  see a scheme that was never shared — CI would have failed before compiling a
  line.
* **Full AppIcon set** (all 18 iOS slots) generated from the existing art, opaque
  RGB with no alpha, which App Store validation requires.
* **Orientation locked to portrait** on iPad as well as iPhone, matching the
  manifest and the fact that the HUD has no landscape layout.
* **Web payload synced** into `ios/App/App/public` and verified byte-identical
  to `www/`.
