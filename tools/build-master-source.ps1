[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [string]$OutputDirectory = 'releases',
  [string]$TestEvidencePath = '',
  [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outRoot = [IO.Path]::GetFullPath((Join-Path $repo $OutputDirectory))
$tmpRoot = [IO.Path]::GetFullPath((Join-Path $repo '.tmp'))
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$folderName = "MASSFRONT-master-source-v$Version-$stamp"
$stage = [IO.Path]::GetFullPath((Join-Path $tmpRoot $folderName))
$archive = [IO.Path]::GetFullPath((Join-Path $outRoot "$folderName.zip"))
$evidenceSource = if($TestEvidencePath){
  [IO.Path]::GetFullPath((Join-Path $repo $TestEvidencePath))
} else {
  [IO.Path]::GetFullPath((Join-Path $repo "releases/MASSFRONT-v$Version-test-evidence.json"))
}

function Assert-ChildPath([string]$Path,[string]$Parent,[string]$Label){
  $prefix = $Parent.TrimEnd('\') + '\'
  if(-not $Path.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){
    throw "$Label escaped its intended root: $Path"
  }
}
function Get-RelativePath([string]$Base,[string]$Path){
  # Windows PowerShell 5.1 lacks IO.Path.GetRelativePath. Uri handles spaces
  # and Unicode safely as long as the base is explicitly treated as a folder.
  $baseFull = [IO.Path]::GetFullPath($Base).TrimEnd('\') + '\'
  $pathFull = [IO.Path]::GetFullPath($Path)
  $baseUri = New-Object Uri($baseFull)
  $pathUri = New-Object Uri($pathFull)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('/','\')
}
Assert-ChildPath $stage $tmpRoot 'Staging path'
Assert-ChildPath $archive $outRoot 'Archive path'

# Refuse to build a handoff that mixes release versions or merely claims tests
# were run. The manifest may be local before the remote channel switch, but its
# payload must already be pinned to an immutable, verified commit.
$manifestPath = Join-Path $repo 'update.json'
$stagePath = Join-Path $repo "releases/staging-v$Version"
if(-not (Test-Path -LiteralPath $manifestPath)){ throw 'update.json is missing' }
if(-not (Test-Path -LiteralPath $stagePath)){ throw "Missing v$Version OTA staging folder" }
$publishedManifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if($publishedManifest.version -ne $Version){ throw "Manifest version $($publishedManifest.version) does not match $Version" }
# The payload is per-file now, so "exactly one atomic entry" is the wrong
# invariant. What still has to hold is stronger, and holds for EVERY entry:
# each is pinned to an immutable commit, and each matches the bytes staged
# locally. A handoff that claims a release it cannot reproduce is the thing
# these assertions exist to prevent.
if($publishedManifest.files.Count -lt 1){ throw 'Release manifest contains no files' }
$immutableCommit = $null
foreach($manifestFile in @($publishedManifest.files)){
  $localPath = Join-Path $stagePath $manifestFile.path
  if(-not (Test-Path -LiteralPath $localPath)){ throw "Manifest names an artifact that is not staged locally: $($manifestFile.path)" }
  if($manifestFile.url -notmatch '/resolve/([0-9a-f]{40})/' -or $manifestFile.url -match '/resolve/main/'){
    throw "Manifest url for $($manifestFile.path) is not pinned to an immutable 40-character commit"
  }
  # One release, one commit. Mixed commits mean the manifest describes a
  # build that never existed as a single upload.
  if($null -eq $immutableCommit){ $immutableCommit = $Matches[1] }
  elseif($Matches[1] -ne $immutableCommit){ throw "Manifest mixes commits: $($manifestFile.path) is pinned to a different upload" }
  $item = Get-Item -LiteralPath $localPath
  $hash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if([int64]$manifestFile.size -ne $item.Length -or $manifestFile.sha256.ToLowerInvariant() -ne $hash){
    throw "Manifest size/hash does not match the staged artifact for $($manifestFile.path)"
  }
}
if($null -eq $immutableCommit){ throw 'Could not determine the immutable commit for this release' }

$updaterText = Get-Content -Raw -LiteralPath (Join-Path $repo 'src/updater.js')
$bootText = Get-Content -Raw -LiteralPath (Join-Path $repo 'boot.js')
$packageVersion = (Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json).version
$gradleText = Get-Content -Raw -LiteralPath (Join-Path $repo 'android/app/build.gradle')
if(-not $updaterText.Contains("const APP_VERSION = '$Version';")){ throw 'src/updater.js version mismatch' }
if(-not $bootText.Contains("var PACKAGED_REV='$Version';")){ throw 'boot.js version mismatch' }
if($packageVersion -ne $Version){ throw 'package.json version mismatch' }
if(-not $gradleText.Contains("versionName `"$Version`"")){ throw 'Android base versionName mismatch' }
$parts = $Version.Split('.') | ForEach-Object { [int]$_ }
$expectedVersionCode = ($parts[0] * 10000) + ($parts[1] * 100) + $parts[2]
if($gradleText -notmatch 'versionCode\s+(\d+)'){ throw 'Android versionCode not found' }
$versionCode = [int]$Matches[1]
if($versionCode -ne $expectedVersionCode){ throw "Android versionCode $versionCode does not match expected $expectedVersionCode" }

if(-not (Test-Path -LiteralPath $evidenceSource)){ throw "Required test evidence is missing: $evidenceSource" }
$testEvidence = Get-Content -Raw -LiteralPath $evidenceSource | ConvertFrom-Json
if($testEvidence.version -ne $Version){ throw 'Test evidence version mismatch' }
if(-not $testEvidence.tests.Count){ throw 'Test evidence contains no tests' }
$failedEvidence = @($testEvidence.tests | Where-Object { -not $_.passed })
if($failedEvidence.Count){ throw "Test evidence contains failed gates: $($failedEvidence.name -join ', ')" }

if(Test-Path -LiteralPath $stage){ Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path $outRoot -Force | Out-Null

$sourceRoot = Join-Path $stage 'source'
$deliverRoot = Join-Path $stage 'deliverables'
New-Item -ItemType Directory -Path $sourceRoot,$deliverRoot -Force | Out-Null

$rootFiles = @(
  'AGENTS.md','README.md','.gitignore','index.html','boot.js',
  'capacitor.config.json','package.json','package-lock.json','update.json'
)
$rootDirs = @(
  '.github','src','assets','source-media','tools','docs','design',
  'audit','cloudflare','android','ios'
)

function Is-Excluded([string]$Relative,[IO.FileInfo]$File){
  $p = $Relative.Replace('/','\')
  $segments = $p.Split('\')
  foreach($s in $segments){
    if($s -in @('node_modules','.npm-cache','.toolchains','.tmp','__pycache__','.pytest_cache',
                '.gradle','.gradle-mobile','.kotlin','.cxx','DerivedData')){ return $true }
  }
  if($p -match '(^|\\)android\\(build|app\\build)(\\|$)'){ return $true }
  if($p -match '(^|\\)cloudflare\\.*\\\.wrangler\\(cache|state|tmp)(\\|$)'){ return $true }
  if($File.Extension -in @('.log','.tmp','.keystore','.jks','.p12','.pfx','.pem','.key')){ return $true }
  if($File.Name -match '^\.env($|\.)|^\.dev\.vars$'){ return $true }
  if($File.Name -match '(?i)(secret|credentials)'){ return $true }
  if($File.Name -eq 'MASSFRONT-source.zip'){ return $true }
  if($File.Name -match '^MASSFRONT-master-source-.*\.(zip|7z)$'){ return $true }
  if($File.Name -match '^MASSFRONT-v\d+\.\d+\.\d+-web-portable\.zip$'){ return $true }
  return $false
}

function Copy-Tree([string]$RelativeDir){
  $src = Join-Path $repo $RelativeDir
  if(-not (Test-Path -LiteralPath $src)){ return }
  Get-ChildItem -LiteralPath $src -Recurse -File -Force | ForEach-Object {
    $rel = Get-RelativePath $repo $_.FullName
    if(-not (Is-Excluded $rel $_)){
      $dst = Join-Path $sourceRoot $rel
      $parent = Split-Path -Parent $dst
      if(-not (Test-Path -LiteralPath $parent)){ New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      [IO.File]::Copy($_.FullName,$dst,$true)
    }
  }
}

foreach($f in $rootFiles){
  $src = Join-Path $repo $f
  if(Test-Path -LiteralPath $src){
    $dst = Join-Path $sourceRoot $f
    $parent = Split-Path -Parent $dst
    if(-not (Test-Path -LiteralPath $parent)){ New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::Copy($src,$dst,$true)
  }
}
foreach($d in $rootDirs){ Copy-Tree $d }

function Copy-Required([string]$From,[string]$To){
  $src = Join-Path $repo $From
  if(-not (Test-Path -LiteralPath $src)){ throw "Required release input is missing: $From" }
  $dst = Join-Path $stage $To
  $parent = Split-Path -Parent $dst
  if(-not (Test-Path -LiteralPath $parent)){ New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [IO.File]::Copy($src,$dst,$true)
}

Copy-Required "releases/MASSFRONT-v$Version-mobile.apk" "deliverables/android/MASSFRONT-v$Version-mobile.apk"
Copy-Required "releases/MASSFRONT-v$Version-playable.html" 'deliverables/web/massfront.html'
Copy-Required "releases/MASSFRONT-v$Version-web.zip" "deliverables/web/MASSFRONT-v$Version-web.zip"
# The OTA is a folder of artifacts now, not one file. Copy every staged
# artifact so the handoff can reproduce the exact release it describes.
Get-ChildItem -LiteralPath $stagePath -Recurse -File -Force | ForEach-Object {
  $rel = Get-RelativePath $stagePath $_.FullName
  Copy-Required (Get-RelativePath $repo $_.FullName) "deliverables/ota/payload/$rel"
}
Copy-Required 'update.json' 'deliverables/ota/update.json'
Copy-Required (Get-RelativePath $repo $evidenceSource) "release-evidence/MASSFRONT-v$Version-test-evidence.json"

$wwwSource = Join-Path $repo 'www'
$wwwDest = Join-Path $deliverRoot 'web/www'
Get-ChildItem -LiteralPath $wwwSource -Recurse -File -Force | ForEach-Object {
  $rel = Get-RelativePath $wwwSource $_.FullName
  $dst = Join-Path $wwwDest $rel
  $parent = Split-Path -Parent $dst
  if(-not (Test-Path -LiteralPath $parent)){ New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [IO.File]::Copy($_.FullName,$dst,$true)
}

$apkRel = "deliverables/android/MASSFRONT-v$Version-mobile.apk"
$htmlRel = 'deliverables/web/massfront.html'
$webZipRel = "deliverables/web/MASSFRONT-v$Version-web.zip"
# No single payload file to hash any more. The manifest already carries a
# per-artifact sha256 and build-master asserts every one of them above, so
# the honest summary here is the artifact COUNT plus the pinned commit.
$otaArtifactCount = @($publishedManifest.files).Count
function Hash-At([string]$Relative){ (Get-FileHash -LiteralPath (Join-Path $stage $Relative) -Algorithm SHA256).Hash.ToLowerInvariant() }
$releaseBase = 'https://huggingface.co/datasets/CREATORJD/massfront-releases/resolve/main'
$apkPublic = "$releaseBase/MASSFRONT-v$Version-mobile.apk?download=true"
$webZipPublic = "$releaseBase/MASSFRONT-v$Version-web.zip?download=true"
$htmlPublic = "$releaseBase/MASSFRONT-v$Version-playable.html?download=true"
$liveWeb = 'https://creatorjd-massfront-playtest.static.hf.space/'
$buildRecord = [ordered]@{
  version = $Version
  createdUtc = (Get-Date).ToUniversalTime().ToString('o')
  sourceBundleSha256 = $null
  sourceBundleSha256Note = 'The ZIP digest is recorded beside the archive to avoid a self-referential hash.'
  web = [ordered]@{
    singleFile=$htmlRel; sha256=(Hash-At $htmlRel); singleFilePublicUrl=$htmlPublic
    archive=$webZipRel; archiveSha256=(Hash-At $webZipRel); archivePublicUrl=$webZipPublic
    multiFile='deliverables/web/www/'; liveUrl=$liveWeb
  }
  android = [ordered]@{
    apk=$apkRel; publicUrl=$apkPublic; package='com.creatorjd.massfront.mobile'; versionCode=$versionCode
    versionName="$Version-mobile"; sha256=(Hash-At $apkRel)
    signerSha256='D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0'
  }
  ota = [ordered]@{ payload="deliverables/ota/payload"; payloadSha256=($null); immutableCommit=$immutableCommit }
  ios = [ordered]@{ wrapperIncluded=$true; signedIpaIncluded=$false }
  tests = @($testEvidence.tests)
  knownIssues = @(
    'No signed IPA is included; Apple signing still requires an authenticated macOS/cloud build.',
    'Nova, Legion and Syndicate still retain shared base chassis in part of the unit roster; see design/faction-production-matrix.md.'
  )
}
$buildRecord | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stage 'BUILD-RECORD.json') -Encoding utf8

$readme = @"
# MASSFRONT v$Version master handoff

Created $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC.

Start with `source/docs/V1.32_RELEASE_HANDOFF.md`, then consult
`source/docs/HANDOFF_CLAUDE_CODE.md` or `source/docs/HANDOFF_CODEX_SPARK.md`.
The current Android tester is
`$apkRel`; the portable browser build is `$htmlRel`, and the complete web
folder is `deliverables/web/www/`.

Public downloads:

- Android APK: $apkPublic
- Complete web ZIP: $webZipPublic
- Single-file HTML: $htmlPublic
- Live iPhone/browser playtest: $liveWeb

Canonical factions: Terran Frontline Command = Nova; Crimson Dominion =
Legion/Ascendancy; Emerald Triad = Syndicate Coalition/Machine Ascendancy;
Void Swarm = Brood/Infestation Swarm. Brood technology is biological, while
Syndicate identity is advanced precision energy technology.

The Android APK uses `com.creatorjd.massfront.mobile` and the established test
certificate. iOS wrapper source is included, but there is no signed IPA because
Apple requires an authenticated macOS/cloud signing workflow.

Rebuild from `source/` with locked npm dependencies, Node, Java 21, the Android
SDK, and Capacitor. Toolchains and caches are intentionally excluded. See
`source/docs/RELEASE_PREFLIGHT.md` and `source/AGENTS.md` before changing or
packaging the game.

Remote-chat attachment caches and historical release binaries are excluded for
privacy and to avoid duplicating generated files. All canonical game assets,
source media, design art, native wrappers, and current deliverables are included.
"@
$readme | Set-Content -LiteralPath (Join-Path $stage 'README-FIRST.md') -Encoding utf8

$textExt = @('.js','.mjs','.json','.md','.html','.css','.xml','.gradle','.toml','.yml','.yaml','.txt','.ps1','.py')
$secretPatterns = @(
  'hf_[A-Za-z0-9]{20,}',
  'sk-[A-Za-z0-9_-]{20,}',
  'Bearer\s+[A-Za-z0-9._-]{20,}',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)
$secretHits = New-Object Collections.Generic.List[string]
Get-ChildItem -LiteralPath $stage -Recurse -File -Force | ForEach-Object {
  if($_.Length -le 5MB -and $_.Extension.ToLowerInvariant() -in $textExt){
    $content = Get-Content -Raw -LiteralPath $_.FullName -ErrorAction SilentlyContinue
    foreach($pattern in $secretPatterns){
      if($content -match $pattern){ $secretHits.Add((Get-RelativePath $stage $_.FullName)); break }
    }
  }
}
if($secretHits.Count){ throw "Possible secrets found in staging:`n$($secretHits -join "`n")" }

$checksumPath = Join-Path $stage 'CHECKSUMS-SHA256.txt'
$checksums = Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
  Where-Object { $_.FullName -ne $checksumPath } |
  ForEach-Object {
    $rel = (Get-RelativePath $stage $_.FullName).Replace('\','/')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $rel"
  } | Sort-Object
$checksums | Set-Content -LiteralPath $checksumPath -Encoding ascii

if(Test-Path -LiteralPath $archive){ Remove-Item -LiteralPath $archive -Force }
Push-Location $tmpRoot
try { & tar.exe -a -cf $archive $folderName } finally { Pop-Location }
if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archive)){ throw 'Archive creation failed' }

$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$sidecar = "$archiveHash  $([IO.Path]::GetFileName($archive))"
$sidecarPath = "$archive.sha256"
$sidecar | Set-Content -LiteralPath $sidecarPath -Encoding ascii
$fileCount = (Get-ChildItem -LiteralPath $stage -Recurse -File -Force | Measure-Object).Count
$bytes = (Get-Item -LiteralPath $archive).Length

if(-not $KeepStaging){ Remove-Item -LiteralPath $stage -Recurse -Force }
[pscustomobject]@{
  Archive=$archive; Bytes=$bytes; Sha256=$archiveHash; Files=$fileCount; Sidecar=$sidecarPath
} | ConvertTo-Json
