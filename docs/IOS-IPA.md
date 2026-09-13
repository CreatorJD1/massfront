# IPA delivery — permanently retired

MASSFRONT no longer produces or distributes an `.ipa`. Do not run an IPA CI
workflow, configure Apple certificate/provisioning secrets, re-sign an unsigned
artifact, sideload it, upload it to TestFlight, or submit it to the App Store.
An IPA is not part of release acceptance.

Apple users remain fully supported through the Safari-installed PWA. Follow
[`BUILD_IOS.md`](BUILD_IOS.md): open the official HTTPS game in Safari, choose
**Share → Add to Home Screen**, and launch it from the Home Screen icon.

## Why this page remains

The old documentation correctly recorded several historical platform facts:

- a real IPA is an ARM64 iOS application archive built with Apple's SDK and
  `xcodebuild`, which require macOS/Xcode;
- a stock device will not run an unsigned IPA;
- native device installation required Apple signing/provisioning, and free
  personal signing historically expired after about seven days;
- paid Apple Developer membership unlocked longer-lived distribution,
  TestFlight and App Store submission;
- the retired project once carried a shared Xcode scheme, a complete opaque
  AppIcon set, orientation metadata and a web payload copied into the native
  wrapper.

These facts explain the retired files and old release history. They are not
instructions, open tasks or gates. No Apple credentials should be added for
this project.

## Current acceptance instead

Verify the exact browser release on a real iPhone/iPad through Safari and the
Home Screen install: standalone launch, WebKit/WebGL2 rendering, safe areas and
rotation, AAC gesture unlock/resume, touch behavior, save/storage behavior,
offline relaunch, and HF OTA activation/rollback. Record that evidence with the
packed-preview/HF Space release; do not wait for a native artifact.

Browser limitations remain explicit: there is no App Store presence or
StoreKit, native-only background/push/haptic capabilities are out of scope, and
Safari may evict local site storage under pressure or after extended disuse.
