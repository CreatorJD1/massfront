# Native iOS build path — permanently retired

This page is a tombstone, not a build guide.

The owner permanently retired native iOS/IPA/Xcode/TestFlight/App Store
delivery. Apple remains fully supported through the Safari-installed PWA. Use
[`BUILD_IOS.md`](BUILD_IOS.md) for the current installation, compatibility and
acceptance procedure.

## Do not use this as a release lane

Do not:

- run `npx cap sync ios`, `npm run ios:sync`, `npx cap open ios` or
  `xcodebuild` for a release;
- bump `MARKETING_VERSION` or `CURRENT_PROJECT_VERSION`;
- open/sign/archive the project in Xcode;
- create an IPA, configure Apple signing credentials, or upload to TestFlight
  or App Store Connect;
- block source, packed preview, HF OTA, Android native or HF Space on any native
  Apple step.

Retained files under `ios/` are historical reference only. Their presence does
not make native iOS current, required or supported as a release artifact.

## Current Apple route

On an iPhone or iPad, open the official HTTPS game URL in Safari, choose
**Share → Add to Home Screen**, and launch it from the Home Screen icon. The
supported contract includes WebKit/WebGL2, standalone PWA launch, AAC audio and
gesture unlock, safe areas, rotation/`visualViewport`, browser storage, offline
behavior, OTA update and rollback.

## Historical facts retained for context

Before retirement, the native route used a Capacitor 8 Xcode project and Swift
Package Manager rather than CocoaPods. The scaffold included:

- opaque iPhone/iPad AppIcon assets and a 2732×2732 splash asset;
- `Info.plist` settings for arm64/Metal, fullscreen/status/home-indicator
  behavior, orientations and `ITSAppUsesNonExemptEncryption = false`;
- a packaged web payload under `ios/App/App/public`;
- WebKit-specific touch, selection, viewport, safe-area and audio handling.

A genuine native build required macOS, Xcode, the Apple SDK and code signing.
A free Apple ID historically produced short-lived device signing (commonly
seven days); a paid Apple Developer membership enabled longer-lived
distribution, TestFlight and App Store submission. Those constraints explain
the old instructions but are no longer work to perform.

The reusable engineering lessons remain active on the PWA: preserve AAC for
Safari, user-gesture audio unlock, interruption recovery, `viewport-fit=cover`,
safe-area insets, orientation relayout, pixel-ratio limits and visual testing on
real Apple hardware.
