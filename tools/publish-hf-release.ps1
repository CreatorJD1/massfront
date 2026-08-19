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
  [ValidateSet('hotfix','content','overhaul')][string]$Kind='',
  # Publish a DELTA against an already-published version instead of a full
  # payload. Only artifacts whose sha256 differs from that release are
  # uploaded and listed in files[]; the complete build is still named in
  # full[] so a device on any other version can recover in one step.
  # Deliberately NOT a $Kind value: kind describes how big a change feels to
  # a player, this describes how the bytes are delivered. Orthogonal.
  [ValidatePattern('^([0-9]+[.][0-9]+[.][0-9]+)?$')][string]$PatchFrom=''
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
if($PatchFrom){
  Write-Host "Hotfix: skipping Android wrapper sync (a delta cannot change the APK)." -ForegroundColor Yellow
} else {
  Run 'Sync Android wrapper' { & 'C:\Program Files\nodejs\npx.cmd' cap sync android }
}

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
if($PatchFrom){
  Write-Host "Hotfix: skipping APK build. Devices keep the 1.33.x installer they already have." -ForegroundColor Yellow
} else {
  Run 'Optimize and sign APK' { & 'C:\Program Files\Git\bin\bash.exe' -lc "export PATH=/usr/bin:/bin:`$PATH; bash tools/shrink-apk.sh android/app/build/outputs/apk/debug/app-debug.apk '$apk'" }
}
Run 'Build OTA patch' { node tools/bundle-update.mjs $Version }

# The OTA is a per-file payload now: a staging folder plus an index carrying
# size and sha256 for every artifact. bundle-update.mjs writes both.
$otaStage="releases/staging-v$Version"
$otaIndexPath=Join-Path $otaStage "artifacts.json"
Need (Test-Path $apk) "APK was not created: $apk"
  Need (Test-Path $otaStage) "OTA staging folder was not created: $otaStage"
  Need (Test-Path $otaIndexPath) "OTA artifact index was not created: $otaIndexPath"
# NOTE (PowerShell 5.1): do NOT write @(... | ConvertFrom-Json). ConvertFrom-Json
# emits a JSON array as a SINGLE object down the pipeline in 5.1, so @() wraps it
# again - .Count reads 1, [0] is the whole array, and $entry.path then member-
# enumerates into an Object[]. That is what aborted the first 1.33.45 publish, at
# Join-Path, AFTER the APK build but BEFORE any upload. Cast explicitly instead.
[object[]]$otaIndex = Get-Content -LiteralPath $otaIndexPath -Raw -Encoding utf8 | ConvertFrom-Json
Need ($otaIndex.Count -gt 0) "OTA artifact index is empty"
# Every artifact must exist on disk with the exact bytes the index claims.
# A manifest that names an artifact which failed to stage is the one failure
# the client cannot recover from: boot.js rejects the whole bundle if any
# entry is missing, and it cannot be patched on devices already at 1.33.44.
foreach($a in $otaIndex){
  $full=Join-Path $otaStage $a.path
  Need (Test-Path -LiteralPath $full) "Staged artifact missing: $($a.path)"
  $fi=Get-Item -LiteralPath $full
  Need ($fi.Length -eq $a.size) "Staged artifact size mismatch for $($a.path): $($fi.Length) vs $($a.size)"
  $h=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLower()
  Need ($h -eq $a.sha256) "Staged artifact sha256 mismatch for $($a.path)"
}
# The sources in the payload must be exactly the manifest order, in order.
# An add, a removal or a reorder changes what boot.js concatenates, and the
# client keeps a prior order wholesale when merging a patch - so a delta can
# never express such a change and must be published as a full release.
[object[]]$declaredOrder = (Get-Content -LiteralPath (Join-Path $Root "assets/data/manifest.json") -Raw -Encoding utf8 | ConvertFrom-Json).order
$stagedSources=@($otaIndex | Where-Object { $_.path -notlike "ota/*" } | ForEach-Object { $_.path })
Need (($stagedSources -join "|") -eq ($declaredOrder -join "|")) "Staged sources do not match assets/data/manifest.json order"
# Preserve the v2 delivery contract. Rebuilding this as the old minimal manifest
# silently removed release channels and optional packs from every published update.
# Where each artifact lives. A full release publishes everything under
# v<version>/; a delta publishes only what changed there, and points full[]
# at the release it was cut from so a device on any other version recovers.
$otaBase="https://huggingface.co/datasets/$Repo/resolve/main"
$fullFiles=@($otaIndex | ForEach-Object {
  [pscustomobject]@{ path=$_.path; size=$_.size; sha256=$_.sha256
                     url="$otaBase/v$Version/$($_.path)?download=true"; local=(Join-Path $otaStage $_.path) }
})
if($PatchFrom){
  $priorPath=Join-Path $Root "releases/update-v$PatchFrom.json"
  Need (Test-Path -LiteralPath $priorPath) "Cannot cut a delta against $PatchFrom - releases/update-v$PatchFrom.json is missing"
  $prior=Get-Content -LiteralPath $priorPath -Raw -Encoding utf8 | ConvertFrom-Json
  $priorBy=@{}; foreach($pf in @($prior.files)){ $priorBy[$pf.path]=$pf.sha256 }
  # A delta may only OVERWRITE. The client keeps the base order wholesale and
  # requires every patched path to already exist, so an added or removed
  # source cannot be expressed as a patch - it must be a full release.
  foreach($a in $otaIndex){ Need ($priorBy.ContainsKey($a.path)) "Artifact $($a.path) does not exist in $PatchFrom; publish a full release instead" }
  foreach($k in $priorBy.Keys){ Need (@($otaIndex | Where-Object { $_.path -eq $k }).Count -eq 1) "Artifact $k was removed since $PatchFrom; publish a full release instead" }
  $publishFiles=@($fullFiles | Where-Object { $priorBy[$_.path] -ne $_.sha256 })
  Need ($publishFiles.Count -gt 0) "Nothing changed since $PatchFrom - there is no patch to publish"
  # full[] must point at the LAST FULL release, not at this delta folder.
  $fullFiles=@($prior.files | ForEach-Object { [pscustomobject]@{ path=$_.path; size=$_.size; sha256=$_.sha256; url=$_.url; local=$null } })
  Write-Host ("Delta against $PatchFrom : " + $publishFiles.Count + " of " + $otaIndex.Count + " artifacts changed") -ForegroundColor Cyan
} else {
  $publishFiles=$fullFiles
}
Need ($publishFiles.Count -gt 0) "Refusing to publish an empty file list"

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
  # PER-FILE DELIVERY. Every entry carries an ABSOLUTE url rather than
  # relying on the manifest-wide `base` prefix, because `base` is read once
  # by the client before it decides whether it is applying a patch - so on a
  # patch manifest it points at the delta folder, which is the one place a
  # complete payload is guaranteed NOT to be. Absolute urls also let each
  # entry be re-pinned to an immutable commit sha independently.
  files=@(@($publishFiles | ForEach-Object {
    [ordered]@{ path=$_.path; url=$_.url; size=$_.size; sha256=$_.sha256 }
  }) + @($extraEntries | ForEach-Object { [ordered]@{ path=$_.path; url=$_.url; size=$_.size; sha256=$_.sha256 } }))
}
# The OTA payload must stay files[0]: updApply reads the manifest order to
# decide what to evaluate as the new source. Extras follow it as cached data.
if($Kind){ $manifest.kind=$Kind }
if($PatchFrom){
  # kind:"patch" is what makes the client MERGE these files over the payload
  # it already has instead of replacing it. patchFrom names the build this
  # was cut against; the client refuses unless its installed record carries
  # that version AND already contains every path listed here.
  $manifest.kind="patch"
  $manifest.patchFrom=$PatchFrom
}
# The complete build, always. There is ONE manifest url for every device, so
# a client whose installed version is not the patch base has nowhere else to
# look - full[] is how it recovers in a single step instead of being stranded.
$manifest.full=@($fullFiles | ForEach-Object {
  [ordered]@{ path=$_.path; url=$_.url; size=$_.size; sha256=$_.sha256 }
})
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
if($PatchFrom){
  Write-Host "Hotfix: skipping the ~1 GB source archive. The previous release archive still stands." -ForegroundColor Yellow
} else {
  Compress-Archive -Path $archiveItems.FullName -DestinationPath $source -CompressionLevel Optimal
}
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
# Upload the artifacts that this release actually publishes. A full release
# sends the whole staging folder in one commit; a delta sends only the
# changed files. Either way every uploaded path sits under v<version>/ so a
# previous release keeps its own bytes and full[] stays resolvable forever.
if($PatchFrom){
  foreach($pf in $publishFiles){
    $rel=$pf.path; $loc=$pf.local
    Run "Publish artifact ($rel)" { & $Hf upload $Repo $loc "v$Version/$rel" --type dataset --commit-message "Publish MASSFRONT v$Version artifact $rel" }
  }
} else {
  Run 'Publish OTA payload' { & $Hf upload $Repo $otaStage "v$Version" --type dataset --commit-message "Publish MASSFRONT v$Version OTA payload" }
}
if($PatchFrom){
  Write-Host "Hotfix: skipping this upload - the APK is unchanged." -ForegroundColor Yellow
} else {
  Run 'Publish Android installer' { & $Hf upload $Repo $apk "MASSFRONT-v$Version-mobile-install.apk" --type dataset --commit-message "Publish MASSFRONT v$Version Android installer" }
}
foreach($x in $extraEntries){
  $xPath=$x.path; $xLocal=$x.local
  Run "Publish extra artifact ($xPath)" { & $Hf upload $Repo $xLocal $xPath --type dataset --commit-message "Publish MASSFRONT v$Version artifact $xPath" }
}
if($PatchFrom){
  Write-Host "Hotfix: skipping this upload - the source archive is unchanged." -ForegroundColor Yellow
} else {
  Run 'Publish source archive' { & $Hf upload $Repo $source "MASSFRONT-v$Version-source.zip" --type dataset --commit-message "Publish MASSFRONT v$Version source archive" }
}
Run 'Publish historical manifest' { & $Hf upload $Repo "releases/update-v$Version.json" "update-v$Version.json" --type dataset --commit-message "Publish MASSFRONT v$Version manifest" }
Run 'Publish release manifest mirror' { & $Hf upload $Repo 'releases/MASSFRONT-update.json' 'MASSFRONT-update.json' --type dataset --commit-message "Publish MASSFRONT v$Version updater mirror" }
Run 'Activate live updater last' { & $Hf upload $Repo 'update.json' 'update.json' --type dataset --commit-message "Activate MASSFRONT v$Version live updater" }

Write-Host "`nPublished v$Version" -ForegroundColor Green
Write-Host "APK: https://huggingface.co/datasets/$Repo/resolve/main/MASSFRONT-v$Version-mobile-install.apk?download=true"
Write-Host "Source: https://huggingface.co/datasets/$Repo/resolve/main/MASSFRONT-v$Version-source.zip?download=true"
