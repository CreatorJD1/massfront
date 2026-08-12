#!/usr/bin/env bash
# Repack a debug APK so it is actually the size of its contents.
#
# The Android Gradle plugin page-aligns uncompressed entries to 16 KB for
# zip-fs mapping. With ~670 entries that padding was 35 MB of nothing: a build
# whose contents compress to 28 MB was landing on disk at 51 MB, over the size
# where it can even be handed to a phone. Re-deflating most entries and aligning
# to 4 bytes gives back all of it. Re-signing is mandatory — changing a single
# byte invalidates the v2 signature over the archive.
set -euo pipefail
BT="${ANDROID_BUILD_TOOLS:-}"
if [[ -z "$BT" ]]; then
  if [[ -d "/c/Users/Jason/AppData/Local/Android/Sdk/build-tools/34.0.0" ]]; then
    BT="/c/Users/Jason/AppData/Local/Android/Sdk/build-tools/34.0.0"
  elif [[ -d "${LOCALAPPDATA:-}/Android/Sdk/build-tools/34.0.0" ]]; then
    BT="${LOCALAPPDATA}/Android/Sdk/build-tools/34.0.0"
  else
    BT="/opt/android-sdk/build-tools/34.0.0"
  fi
fi
ZIPALIGN="$BT/zipalign"
[[ -f "$BT/zipalign.exe" ]] && ZIPALIGN="$BT/zipalign.exe"
SRC="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
OUT="${2:-MASSFRONT.apk}"
if command -v mktemp >/dev/null 2>&1; then
  T=$(mktemp -d)
else
  # Recent minimal Git-for-Windows shells omit mktemp. A process-scoped folder
  # under their private /tmp is equally isolated and keeps the release path out
  # of every intermediate command.
  T="${TMPDIR:-/tmp}/massfront-apk-$$"
  mkdir -p "$T"
fi
SIGNER="$BT/apksigner"
# Android's Windows SDK publishes the signer as a batch file, while macOS and
# Linux use an extensionless executable. Keep the caller and signing arguments
# identical on both layouts.
[[ -f "$BT/apksigner.bat" ]] && SIGNER="$BT/apksigner.bat"
unzip -qq "$SRC" -d "$T/x"
( cd "$T/x" && rm -rf META-INF
  if command -v zip >/dev/null 2>&1; then
    zip -qr9 "$T/repacked.zip" .
    # Modern Android requires resources.arsc to be stored and 4-byte aligned.
    [[ ! -f resources.arsc ]] || zip -q0 "$T/repacked.zip" resources.arsc
  else
    # Git for Windows ships unzip but not zip. `jar` writes the same deflated
    # ZIP container and is already present whenever the Android build can run.
    JAR=jar
    [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/jar" ]] && JAR="$JAVA_HOME/bin/jar"
    [[ -n "${JAVA_HOME:-}" && -f "$JAVA_HOME/bin/jar.exe" ]] && JAR="$JAVA_HOME/bin/jar.exe"
    "$JAR" --create --file "$T/repacked.zip" --no-manifest -C . .
    [[ ! -f resources.arsc ]] || "$JAR" --update --file "$T/repacked.zip" \
      --no-compress -C . resources.arsc
  fi )
"$ZIPALIGN" -f -p 4 "$T/repacked.zip" "$T/aligned.apk"
"$SIGNER" sign --ks ~/.android/debug.keystore --ks-pass pass:android \
  --key-pass pass:android --ks-key-alias androiddebugkey --out "$OUT" "$T/aligned.apk"
"$SIGNER" verify "$OUT" && ls -la "$OUT"
rm -rf "$T"
