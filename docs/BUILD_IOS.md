# MASSFRONT on iPhone and iPad

MASSFRONT fully supports Apple devices through the Safari-installed Progressive
Web App (PWA). This is the sole current Apple delivery route, not a fallback.

Native iOS/IPA/Xcode/TestFlight/App Store delivery is permanently retired. Do
not sync an iOS wrapper, build or sign an IPA, configure Apple credentials,
submit to a store, or make any of those actions a release gate.

## Install from Safari

1. Open the current hosted game in **Safari** on the iPhone or iPad. The
   official playtest is
   `https://creatorjd-massfront-playtest.static.hf.space/`.
2. Open the Share sheet and choose **Add to Home Screen**.
3. Confirm **Add**, then launch MASSFRONT from its Home Screen icon.
4. Use the first real tap in the game to unlock audio when prompted by WebKit.

The installed game launches in standalone mode from the same packed web bytes
used by the browser and HF Space release channels. Updates arrive through the
service-worker/web release and the in-game Hugging Face OTA path; Apple does
not have a separate native version number or package.

## Supported Apple browser contract

A release must preserve and verify:

- Safari/WebKit WebGL2 rendering and the complete gameplay/UI path;
- PWA manifest, icons, service worker, Add-to-Home-Screen installation and
  standalone launch;
- `.m4a`/AAC audio for Safari, first-gesture `AudioContext` unlock, and resume
  after interruption; keep `.ogg` effects for browsers without AAC support;
- `viewport-fit=cover`, `env(safe-area-inset-*)`, home-indicator/notch spacing,
  orientation changes and `visualViewport` resizing;
- device-pixel-ratio limits and readable phone/tablet layouts;
- `localStorage`/IndexedDB saves, OTA shadow staging, activation and rollback;
- offline relaunch of the installed version and a clear recovery path when an
  update fails.

## Apple acceptance checklist

Use the exact packed bytes intended for HF Space.

1. Verify the local packed preview and inspect real screenshots; a clean
   console is not a visual pass.
2. Publish only with explicit authorization, then open the exact live Space URL
   in Safari on a real iPhone or iPad.
3. Add it to the Home Screen and launch from the icon. Confirm standalone mode,
   icon/splash, first frame and WebGL2 renderer.
4. Check portrait and landscape layouts, notch/home-indicator safe areas,
   scrolling panels and touch gestures.
5. Start a real match, unlock and resume AAC audio, save progress, close and
   relaunch, exercise OTA activation/rollback, and test the documented offline
   path.
6. Record device, OS, Space commit/URL, version, screenshots and pass/fail for
   each check in the release handoff.

This Apple acceptance belongs to the packed-preview/HF Space/PWA surfaces. It
never creates a sixth release channel and never requires a native artifact.

## Browser-platform limits

- There is no App Store listing, TestFlight build, IPA or StoreKit integration.
- Native-only capabilities such as unrestricted background execution, native
  push, and native haptics are outside the supported product contract.
- Safari may evict site storage under device pressure or after extended disuse.
  Cloud saves and exported saves remain the recovery choices where available;
  the release must not promise that local browser storage is permanent.
- Public installation requires a reachable HTTPS host. Local HTTP is useful for
  development but is not the release/install surface.

## Retained native history

Before the native lane was retired, the repository carried a Capacitor/Xcode
scaffold with a full icon set, a 2732px splash, Swift Package Manager wiring,
and `Info.plist` settings for arm64/Metal, fullscreen presentation, status/home
indicator behavior, orientation and export-compliance metadata. Those files
also documented why a native build required macOS/Xcode and Apple signing.

That material may remain for provenance and for Safari/WebKit lessons that also
apply to the PWA. It is not current build guidance. See
[`IOS-BUILD.md`](IOS-BUILD.md) and [`IOS-IPA.md`](IOS-IPA.md) for the explicit
native-path tombstones.
