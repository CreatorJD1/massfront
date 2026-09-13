import assert from 'node:assert/strict';
import fs from 'node:fs';

const publisher=fs.readFileSync(new URL('./publish-hf-release.ps1',import.meta.url),'utf8');
const shrinker=fs.readFileSync(new URL('./shrink-apk.ps1',import.meta.url),'utf8');
const expected='D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0';

assert.doesNotMatch(publisher,/shrink-apk\.sh/,
  'publisher still invokes the legacy 4-byte-only Bash shrink path');
assert.match(publisher,/tools\/shrink-apk\.ps1/,
  'publisher does not invoke the 16 KiB-aware PowerShell shrink path');
assert.match(publisher,/Assert-AndroidReleaseApk\s+\(Join-Path \$Root \$apk\)/,
  'publisher does not independently gate the final shrunken APK');
assert.match(publisher,/& \$zipalign -c -P 16 4 \$path/,
  'publisher does not enforce post-shrink 16 KiB alignment');
assert.match(publisher,/& \$signer verify --verbose --print-certs \$path/,
  'publisher does not enforce signature and certificate verification');
assert.ok(publisher.includes(expected),'publisher does not pin the known Android signer');

assert.match(shrinker,/& \$zipalign -f -P 16 4 \$repacked \$aligned/,
  'shrinker does not create a 16 KiB-aligned APK');
assert.match(shrinker,/& \$signer sign[\s\S]*--out \$out \$aligned/,
  'shrinker does not re-sign the repacked APK');
assert.match(shrinker,/& \$signer verify --verbose --print-certs \$out/,
  'shrinker does not verify the re-signed APK and expose its certificate');
assert.match(shrinker,/& \$zipalign -c -P 16 4 \$out/,
  'shrinker does not verify final 16 KiB alignment');
assert.ok(shrinker.includes(expected),'shrinker does not pin the known Android signer');

const shrinkAt=publisher.indexOf("Run 'Optimize and sign APK'");
const verifyAt=publisher.indexOf("Run 'Verify Android APK release contract'");
const otaAt=publisher.indexOf("Run 'Build OTA patch'");
assert.ok(shrinkAt>=0&&verifyAt>shrinkAt&&otaAt>verifyAt,
  'APK contract must fail closed after shrink and before later release packaging');

console.log(JSON.stringify({ok:true,shrinkPath:'tools/shrink-apk.ps1',
  alignment:'zipalign -P 16 4',signerSha256:expected,
  publisherPostShrinkGate:true},null,2));
