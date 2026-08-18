[CmdletBinding()]
# NOTE (encoding): Get-Content -Raw defaults to the ANSI code page (cp1252) in
# Windows PowerShell 5.1, which silently corrupts UTF-8 emoji/glyphs on read and
# then re-saves them double-encoded. Every text read here is pinned to -Encoding
# utf8, and manifests are written UTF-8 without BOM. Do not remove these.
param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$Notes,
  [switch]$DryRun,
  # A local manifest is written before uploads begin. If a build/upload process
  # is interrupted, explicit Resume rebuilds the exact version and activates
  # only after every artifact is uploaded again.
  [switch]$Resume,
  # Additional artifacts published ALONGSIDE the OTA payload and listed in the
  # same manifest, each with its own size and sha256. The client already walks
  # manifest.files and verifies every entry independently -- that half has been
  # multi-file correct for a long time; only the publisher ever emitted one
  # object. This is what lets a wasm blob ship as its own cached file instead of
  # being base64-inlined into every payload at +33% on an already ~54 MB update.
  # Paths are relative to the repo root, e.g. -Extra 'releases/massfront-physics.wasm'
  [string[]]$Extra=@(),
  # Patch taxonomy surfaced in the updater UI. Omit to let the client infer it
  # from payload size (<=2MB hotfix / <=20MB content / larger overhaul).
  [ValidateSet('hotfix','content','overhaul')][string]$Kind=''
)

$ErrorActionPreference='Stop'
$Version=$Version.Trim()
$Notes=$Notes.Trim()
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Repo='CREATORJD/massfront-releases'
$Hf='C:\Users\Jason\AppData\Roaming\Python\Python313\Scripts\hf.exe'
Set-Location $Root

function Need($condition,$message){ if(-not $condition){ throw $message } }
function Run([string]$label,[scriptblock]$action){ Write-Host "`n== $label ==" -ForegroundColor Cyan; & $action; if($LASTEXITCODE -and $LASTEXITCODE -ne 0){ throw "$label failed with exit code $LASTEXITCODE" } }
function WriteReleaseManifest([string]$path,[hashtable]$body){ [IO.File]::WriteAllText((Join-Path $Root $path), ($body | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) }

Need (Test-Path $Hf) "Hugging Face CLI not found at $Hf. Run: hf auth login"
Need ($Version -match '^\d+\.\d+\.\d+$') "Version '$Version' must use major.minor.patch numbers, for example 1.32.86."
$current=(Get-Content package.json -Raw -Encoding utf8 | ConvertFrom-Json).version
$releaseManifestPath=Join-Path $Root 'update.json'
$previousManifest=Get-Content $releaseManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$publishedLocal=[string]$previousManifest.version
$advancesSource=[version]$Version -gt [version]$current
$resumesFailedRelease=([version]$Version -eq [version]$current) -and
  (([version]$Version -gt [version]$publishedLocal) -or $Resume)
Need ($advancesSource -or $resumesFailedRelease) "Version $Version must be higher than source $current, or use -Resume for an interrupted publish of the current source version."
$code=([int]($Version.Split('.')[0])*10000)+([int]($Version.Split('.')[1])*100)+[int]$Version.Split('.')[2]
$verb=if($resumesFailedRelease){'resuming failed publish after'}else{'replacing'}
Write-Host "Preparing MASSFRONT v$Version (Android code $code), $verb v$publishedLocal."

# Extra artifacts: verify each exists and is non-empty, then hash it. Done
# BEFORE the manifest is written so a typo in -Extra fails the release early
# rather than after two large uploads have already been committed.
$extraEntries=@()
foreach($rel in $Extra){
  $full=Join-Path $Root $rel
  Need (Test-Path -LiteralPath $full) "Extra artifact not found: $rel"
  $ei=Get-Item -LiteralPath $full
  Need ($ei.Length -gt 0) "Extra artifact is empty: $rel"
  $name=Split-Path $rel -Leaf
  $extraEntries+=[ordered]@{
    path=$name
    url="https://huggingface.co/datasets/$Repo/resolve/main/$name?download=true"
    size=$ei.Length
    sha256=(Get-FileHash $full -Algorithm SHA256).Hash.ToLower()
    local=$rel
  }
}
if($extraEntries.Count){ Write-Host ("Publishing " + $extraEntries.Count + " extra artifact(s) alongside the OTA payload.") -ForegroundColor Cyan }

if($DryRun){
  Write-Host 'Dry run only: no source, release artifact, or Hugging Face file was changed.' -ForegroundColor Yellow
  exit 0
}

# Keep the bump list explicit. A partial version bump is worse than a failed release:
# the client can endlessly offer its own update if the payload and manifest disagree.
$plain=@('boot.js','src/updater.js','package.json','index.html','assets/app.webmanifest')
foreach($rel in $plain){
  $file=Join-Path $Root $rel
  $text=Get-Content $file -Raw -Encoding utf8
  if(-not $text.Contains($Version)){
    Need ($text.Contains($current)) "Neither target version $Version nor current source version $current was found in $rel. Stop and update this publisher's bump list."
    $text=$text.Replace($current,$Version)
  }
  [IO.File]::WriteAllText($file,$text,(New-Object Text.UTF8Encoding($false)))
}
# package-lock.json had remained on 1.32.2 because it was never in the explicit
# bump list. It is collaborator metadata, not runtime state, but leaving its two
# root package versions stale makes every source archive internally ambiguous.
$lockPath=Join-Path $Root 'package-lock.json'
$lock=Get-Content $lockPath -Raw -Encoding utf8
$lock=[regex]::Replace($lock,'("name"\s*:\s*"massfront"\s*,\s*"version"\s*:\s*")[^"]+',{
  param($match) $match.Groups[1].Value+$Version
})
[IO.File]::WriteAllText($lockPath,$lock,(New-Object Text.UTF8Encoding($false)))
$gradle=Join-Path $Root 'android/app/build.gradle'
$g=Get-Content $gradle -Raw -Encoding utf8
$g=[regex]::Replace($g,'versionCode\s+\d+','versionCode '+$code)
$g=[regex]::Replace($g,'versionName\s+"[^"]+"','versionName "'+$Version+'"')
[IO.File]::WriteAllText($gradle,$g,(New-Object Text.UTF8Encoding($false)))

Run 'Bundle syntax gate' { node tools/bundle.mjs }
Run 'Stage web build' { node tools/pack-www.mjs }
Run 'Sync Android wrapper' { & 'C:\Program Files\nodejs\npx.cmd' cap sync android }

$jdk=(Resolve-Path '.toolchains/jdk-21/jdk-21.0.12+8').Path
$sdk=(Resolve-Path '.toolchains/android-sdk').Path
$env:JAVA_HOME=$jdk; $env:ANDROID_HOME=$sdk; $env:ANDROID_SDK_ROOT=$sdk
$env:GRADLE_USER_HOME=(Resolve-Path '.toolchains/gradle-home').Path
$env:Path="$jdk\bin;$sdk\platform-tools;$env:Path"
Push-Location android
try {
  try { Run 'Build Android APK (offline)' { & .\gradlew.bat assembleDebug --offline --no-daemon --console=plain } }
  catch {
    # A newly declared Android dependency may not be in the machine's offline
    # Gradle cache. The publisher already requires network access for HF, so a
    # single normal Gradle retry is safer than leaving a half-bumped release
    # that must be finished by hand.
    Write-Host "Offline Android build could not resolve every dependency; retrying with repositories enabled." -ForegroundColor Yellow
    Run 'Build Android APK (dependency refresh)' { & .\gradlew.bat assembleDebug --no-daemon --console=plain }
  }
}
finally { Pop-Location }

$apk="releases/MASSFRONT-v$Version-mobile-install.apk"
$env:ANDROID_BUILD_TOOLS=(Resolve-Path '.toolchains/android-sdk/build-tools/*' | Sort-Object Path -Descending | Select-Object -First 1).Path
Run 'Optimize and sign APK' { & 'C:\Program Files\Git\bin\bash.exe' -lc "export PATH=/usr/bin:/bin:`$PATH; bash tools/shrink-apk.sh android/app/build/outputs/apk/debug/app-debug.apk '$apk'" }
Run 'Build OTA patch' { node tools/bundle-update.mjs $Version }

$ota="releases/MASSFRONT-v$Version-update.js"
Need (Test-Path $apk) "APK was not created: $apk"
Need (Test-Path $ota) "OTA patch was not created: $ota"
$otaInfo=Get-Item $ota
$otaHash=(Get-FileHash $ota -Algorithm SHA256).Hash.ToLower()
# Preserve the v2 delivery contract. Rebuilding this as the old minimal manifest
# silently removed release channels and optional packs from every published update.
$manifest=[ordered]@{
  schema=if($previousManifest.schema){[int]$previousManifest.schema}else{2}
  channel=if($previousManifest.channel){[string]$previousManifest.channel}else{'stable'}
  severity=if($previousManifest.severity){[string]$previousManifest.severity}else{'recommended'}
  minBaseVersion=if($previousManifest.minBaseVersion){[string]$previousManifest.minBaseVersion}else{'1.22.0'}
  packsIndex=if($previousManifest.packsIndex){[string]$previousManifest.packsIndex}else{'packs.json'}
  optionalPacks=if($previousManifest.optionalPacks){@($previousManifest.optionalPacks)}else{@()}
  notes=$Notes
  version=$Version
  base=''
  files=@(@([ordered]@{
    path="MASSFRONT-v$Version-update.js"
    url="https://huggingface.co/datasets/$Repo/resolve/main/MASSFRONT-v$Version-update.js?download=true"
    size=$otaInfo.Length
    sha256=$otaHash
  }) + @($extraEntries | ForEach-Object { [ordered]@{ path=$_.path; url=$_.url; size=$_.size; sha256=$_.sha256 } }))
}
# The OTA payload must stay files[0]: updApply reads the manifest order to
# decide what to evaluate as the new source. Extras follow it as cached data.
if($Kind){ $manifest.kind=$Kind }
WriteReleaseManifest 'update.json' $manifest
WriteReleaseManifest 'releases/MASSFRONT-update.json' $manifest
WriteReleaseManifest "releases/update-v$Version.json" $manifest

# Archive only canonical project material. Build caches and old releases are
# intentionally excluded, so collaborators get the real source/assets quickly.
$stage=Join-Path $env:TEMP "massfront-source-$Version"
if(Test-Path $stage){ Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
$keep=@(
  'AGENTS.md','README.md','package.json','package-lock.json','index.html','boot.js',
  'capacitor.config.json','capacitor.config.ts','PUBLISH_HF_RELEASE.bat','update.json',
  '.github','assets','src','tools','android','ios','cloudflare','docs','design','audit'
)
foreach($name in $keep){
  $from=Join-Path $Root $name
  if(Test-Path $from){
    $to=Join-Path $stage $name
    if((Get-Item $from).PSIsContainer){
      & robocopy $from $to /E /XD build .gradle node_modules /XF '*.apk' /NFL /NDL /NJH /NJS | Out-Null
      if($LASTEXITCODE -gt 7){ throw "Source archive copy failed for $name (robocopy $LASTEXITCODE)" }
    } else { Copy-Item -LiteralPath $from -Destination $to -Force }
  }
}
# Capacitor copies the complete web build into both wrappers. Those directories
# are generated from the canonical root assets/src during `cap sync`; retaining
# all three copies made the collaborator archive roughly a gigabyte without
# preserving any additional source or art.
foreach($rel in @('android/app/src/main/assets/public','ios/App/App/public')){
  $copy=Join-Path $stage $rel
  if(Test-Path -LiteralPath $copy){ Remove-Item -LiteralPath $copy -Recurse -Force }
}
$source="releases/MASSFRONT-v$Version-source.zip"
if(Test-Path $source){ Remove-Item -LiteralPath $source -Force }
$archiveItems=@(Get-ChildItem -LiteralPath $stage -Force)
Need ($archiveItems.Count -gt 0) "Source archive staging is empty; refusing to publish an unusable handoff."
Compress-Archive -Path $archiveItems.FullName -DestinationPath $source -CompressionLevel Optimal
Need ((Get-Item -LiteralPath $source).Length -gt 1048576) "Source archive is implausibly small; refusing to publish an unusable handoff."
Remove-Item -LiteralPath $stage -Recurse -Force


# Force the classic LFS upload path. With hf-xet installed the client defaults
# to Xet, and on this machine that handshake hangs on the ~960 MB source
# archive: three runs sat at zero CPU with zero bytes read, never opening the
# file, while the 55 MB OTA and 67 MB APK went up fine in the same session.
# v1.33.41 shipped with NO source archive because of it, and v1.33.43 stalled
# here until this was set. Classic path uploaded 960 MB cleanly twice.
# Upgrading huggingface_hub 1.24.0 -> 1.27.0 did NOT verifiably fix it (hf-xet
# stayed put, and the retest deduped instead of transferring), so this stays
# until someone proves the Xet path works with genuinely new bytes.
$env:HF_HUB_DISABLE_XET='1'
Run 'Publish OTA patch' { & $Hf upload $Repo $ota "MASSFRONT-v$Version-update.js" --type dataset --commit-message "Publish MASSFRONT v$Version OTA" }
Run 'Publish Android installer' { & $Hf upload $Repo $apk "MASSFRONT-v$Version-mobile-install.apk" --type dataset --commit-message "Publish MASSFRONT v$Version Android installer" }
foreach($x in $extraEntries){
  $xPath=$x.path; $xLocal=$x.local
  Run "Publish extra artifact ($xPath)" { & $Hf upload $Repo $xLocal $xPath --type dataset --commit-message "Publish MASSFRONT v$Version artifact $xPath" }
}
Run 'Publish source archive' { & $Hf upload $Repo $source "MASSFRONT-v$Version-source.zip" --type dataset --commit-message "Publish MASSFRONT v$Version source archive" }
Run 'Publish historical manifest' { & $Hf upload $Repo "releases/update-v$Version.json" "update-v$Version.json" --type dataset --commit-message "Publish MASSFRONT v$Version manifest" }
Run 'Publish release manifest mirror' { & $Hf upload $Repo 'releases/MASSFRONT-update.json' 'MASSFRONT-update.json' --type dataset --commit-message "Publish MASSFRONT v$Version updater mirror" }
Run 'Activate live updater last' { & $Hf upload $Repo 'update.json' 'update.json' --type dataset --commit-message "Activate MASSFRONT v$Version live updater" }

Write-Host "`nPublished v$Version" -ForegroundColor Green
Write-Host "APK: https://huggingface.co/datasets/$Repo/resolve/main/MASSFRONT-v$Version-mobile-install.apk?download=true"
Write-Host "Source: https://huggingface.co/datasets/$Repo/resolve/main/MASSFRONT-v$Version-source.zip?download=true"
