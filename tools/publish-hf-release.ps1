[CmdletBinding()]
# NOTE (encoding): Get-Content -Raw defaults to the ANSI code page (cp1252) in
# Windows PowerShell 5.1, which silently corrupts UTF-8 emoji/glyphs on read and
# then re-saves them double-encoded. Every text read here is pinned to -Encoding
# utf8, and manifests are written UTF-8 without BOM. Do not remove these.
param(
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$Notes,
  # Structured release notes. The launcher has always had a three-tab notes UI
  # (renderNotes reads release[features|fixes|upcoming] as arrays, updater.js
  # sanitises them through updSafeList), but nothing could ever fill it: this
  # script only emitted the single `notes` string, so every release since the
  # feature shipped has shown "No additional items were published in this
  # section" on all three tabs, and the one long summary got rendered twice.
  [string[]]$Features=@(),
  [string[]]$Fixes=@(),
  [string[]]$Upcoming=@(),
  [switch]$DryRun,
  # Build and verify every local release artifact, but stop before any remote
  # mutation. This permits an immutable-first upload/verification pass before
  # the live update manifest is activated.
  [switch]$PrepareOnly,
  # Upload and independently verify immutable artifacts, then emit a pinned
  # candidate. Activation is a separate verified mirror/HF operation.
  [switch]$UploadOnly,
  # A failed, never-activated candidate may use a fresh immutable namespace
  # without consuming a player release version or replacing its uploaded bytes.
  [ValidatePattern('^(r[1-9][0-9]{0,5})?$')][string]$ArtifactRevision='',
  # A local manifest is written before uploads begin. If a build/upload process
  # is interrupted, explicit Resume rebuilds the exact version and activates
  # only after every immutable class is independently proven or uploaded.
  [switch]$Resume,
  # Collaborator source archives are a separate, potentially multi-gigabyte
  # channel. Player releases default to runtime/APK artifacts only; explicitly
  # opt in when a source handoff archive is actually requested.
  [switch]$IncludeSourceArchive,
  # Legacy parameter retained so old commands fail with a precise message.
  # Untyped attachments cannot enter executable files[]; use the typed optional
  # pack publisher instead.
  [string[]]$Extra=@(),
  # Player-facing release category. This is deliberately separate from the
  # patch/full transport kind below. -Kind remains an alias for older callers.
  [Alias('Kind')]
  [ValidateSet('system','hotfix','content','overhaul')][string]$Category='',
  # Publish a DELTA against an already-published version instead of a full
  # payload. Only artifacts whose sha256 differs from that release are
  # uploaded and listed in files[]; the complete build is still named in
  # full[] so a device on any other version can recover in one step.
  # Delivery shape is orthogonal to the player-facing category above.
  [ValidatePattern('^([0-9]+[.][0-9]+[.][0-9]+)?$')][string]$PatchFrom=''
)

$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Net.Http
$Version=$Version.Trim()
$Notes=$Notes.Trim()
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Repo='CREATORJD/massfront-releases'
$ExpectedAndroidSignerSha256='D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0'
$HfCandidates=@()
if($env:HF_CLI){$HfCandidates+=$env:HF_CLI}
$HfCandidates+='hf'
if($env:APPDATA){
  $HfCandidates+=@(Get-ChildItem (Join-Path $env:APPDATA 'Python\Python*\Scripts\hf.exe') -File -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object FullName)
}
$HfCommand=$null
foreach($candidate in $HfCandidates){
  $resolved=Get-Command $candidate -ErrorAction SilentlyContinue
  if($resolved){$HfCommand=$resolved;break}
}
$Hf=if($HfCommand){$HfCommand.Source}else{'hf'}
Set-Location $Root

function Need($condition,$message){ if(-not $condition){ throw $message } }
function Run([string]$label,[scriptblock]$action){ Write-Host "`n== $label ==" -ForegroundColor Cyan; & $action; if($LASTEXITCODE -and $LASTEXITCODE -ne 0){ throw "$label failed with exit code $LASTEXITCODE" } }
function Get-ReleaseArtifactNamespace([string]$version,[string]$revision){
  Need ($version -match '^\d+\.\d+\.\d+$') 'Artifact namespace needs a semantic release version'
  Need ($revision -match '^(r[1-9][0-9]{0,5})?$') 'Artifact revision must be r followed by a positive integer'
  $suffix=if($revision){"-candidate-$revision"}else{''}
  return [pscustomobject]@{ prefix="v$version$suffix"; stem="MASSFRONT-v$version$suffix" }
}
function Assert-UnpublishedManifestVersion([object]$manifest,[string]$version,[string]$label){
  Need ($null -ne $manifest -and [string]$manifest.version -match '^\d+\.\d+\.\d+$') "Cannot prove unpublished candidate: $label is unavailable or malformed"
  Need ([version]([string]$manifest.version) -lt [version]$version) "artifact-revision-refused: $label already advertises v$($manifest.version); candidate namespaces cannot replace an activated release"
}
function Assert-UnpublishedArtifactRevision([string]$version,[string]$revision){
  if(-not $revision){return}
  # Read Hub aliases through one authoritative commit, rather than cached main
  # resolve responses. A missing service is not evidence that a version is free.
  $head=Invoke-RestMethod -Uri "https://huggingface.co/api/datasets/$Repo" -TimeoutSec 60 -Headers @{'Cache-Control'='no-cache'}
  Need ([string]$head.sha -match '^[0-9a-f]{40}$') 'Cannot prove unpublished candidate: Hub head unavailable'
  foreach($name in @('update.json','MASSFRONT-update.json')){
    $url="https://huggingface.co/datasets/$Repo/resolve/$($head.sha)/${name}?download=true"
    $live=Read-RemoteJsonIfPresent $url $name
    Assert-UnpublishedManifestVersion $live $version "HF $name"
  }
  $worker=Read-RemoteJsonIfPresent 'https://massfront-update.jasondixon1994.workers.dev/update.json' 'Worker update.json'
  Assert-UnpublishedManifestVersion $worker $version 'Worker update.json'
  Write-Host "Unpublished candidate namespace approved by live-state checks: v$version-candidate-$revision" -ForegroundColor Green
}
function Assert-AndroidReleaseApk([string]$path,[string]$buildTools){
  Need (Test-Path -LiteralPath $path) "APK verification target does not exist: $path"
  $zipalign=Join-Path $buildTools 'zipalign.exe'
  $signer=Join-Path $buildTools 'apksigner.bat'
  Need (Test-Path -LiteralPath $zipalign) "zipalign is missing: $zipalign"
  Need (Test-Path -LiteralPath $signer) "apksigner is missing: $signer"

  & $zipalign -c -P 16 4 $path
  Need ($LASTEXITCODE -eq 0) 'Release APK failed 16 KiB page-alignment verification'

  $verifyOutput=@(& $signer verify --verbose --print-certs $path 2>&1)
  $verifyExit=$LASTEXITCODE
  $verifyOutput | ForEach-Object { Write-Host $_ }
  Need ($verifyExit -eq 0) 'Release APK signature verification failed'
  $signerMatches=[regex]::Matches(($verifyOutput -join "`n"),
    '(?im)^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f:]+)\s*$')
  Need ($signerMatches.Count -eq 1) "Release APK must have exactly one signing certificate; found $($signerMatches.Count)"
  $actualSignerSha256=$signerMatches[0].Groups[1].Value.Replace(':','').ToUpperInvariant()
  Need ($actualSignerSha256 -eq $ExpectedAndroidSignerSha256) "Release APK signer SHA-256 changed: $actualSignerSha256 (expected $ExpectedAndroidSignerSha256)"
}
function Run-CapacitorSyncFailClosed([string]$platform){
  $label="Sync $platform wrapper"
  $platformId=$platform.ToLowerInvariant()
  foreach($attempt in 1..2){
    Write-Host "`n== $label (attempt $attempt) ==" -ForegroundColor Cyan
    $captured=@(& 'C:\Program Files\nodejs\npx.cmd' cap sync $platformId 2>&1)
    $exitCode=$LASTEXITCODE
    $captured | ForEach-Object { Write-Host $_ }
    $reportedFatal=@($captured | Where-Object { [string]$_ -match '\[fatal\]' }).Count -gt 0
    if($exitCode -eq 0 -and -not $reportedFatal){ return }
    if($attempt -eq 1){
      Write-Host "$label reported a fatal error or nonzero exit; retrying once after the transient file handle clears." -ForegroundColor Yellow
      Start-Sleep -Seconds 1
    }
  }
  throw "$label failed closed after two attempts; Capacitor reported a fatal error or nonzero exit."
}
function WriteReleaseManifest([string]$path,[hashtable]$body){ [IO.File]::WriteAllText((Join-Path $Root $path), ($body | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false))) }
function Get-StringSha256([string]$value){
  $bytes=[Text.Encoding]::UTF8.GetBytes($value)
  $sha=[Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
function Copy-ReleaseChunks([object]$entry){
  if($null -eq $entry -or $null -eq $entry.PSObject.Properties['chunks']){ return @() }
  return @($entry.chunks | ForEach-Object {
    [ordered]@{ offset=[long]$_.offset; size=[long]$_.size; sha256=([string]$_.sha256).ToLowerInvariant() }
  })
}
function New-ManifestFileEntry([object]$entry){
  $body=[ordered]@{ path=[string]$entry.path; url=[string]$entry.url;
    size=[long]$entry.size; sha256=([string]$entry.sha256).ToLowerInvariant() }
  $chunks=@(Copy-ReleaseChunks $entry)
  if($chunks.Count -gt 0){ $body.chunks=$chunks }
  return [pscustomobject]$body
}
function Assert-ReleaseChunks([string]$file,[object]$entry){
  $chunks=@(Copy-ReleaseChunks $entry)
  Need ($chunks.Count -gt 0) "Artifact $($entry.path) has no resumable chunk table"
  $stream=[IO.File]::OpenRead($file)
  try{
    $at=0L
    foreach($chunk in $chunks){
      Need ([long]$chunk.offset -eq $at) "Artifact $($entry.path) has a gapped chunk table at $at"
      Need ([long]$chunk.size -le [int]::MaxValue) "Artifact $($entry.path) has an oversized chunk"
      $buffer=New-Object byte[] ([int]$chunk.size)
      $read=0
      while($read -lt $buffer.Length){
        $n=$stream.Read($buffer,$read,$buffer.Length-$read)
        Need ($n -gt 0) "Artifact $($entry.path) ended inside chunk $at"
        $read+=$n
      }
      $sha=[Security.Cryptography.SHA256]::Create()
      try { $actual=([BitConverter]::ToString($sha.ComputeHash($buffer))).Replace('-','').ToLowerInvariant() }
      finally { $sha.Dispose() }
      Need ($actual -eq [string]$chunk.sha256) "Artifact $($entry.path) chunk SHA-256 mismatch at $at"
      $at+=[long]$chunk.size
    }
    Need ($at -eq $stream.Length) "Artifact $($entry.path) chunk table does not cover its exact size"
  } finally { $stream.Dispose() }
}
function Get-ReleasePayloadFingerprint([object]$releaseManifest){
  # files[] is the payload this version publishes. Fall back to full[] only for
  # older manifests which predate files[]. URLs are deliberately excluded:
  # upload pinning changes them without changing the immutable payload bytes.
  $entries=@($releaseManifest.files)
  if($entries.Count -eq 0){ $entries=@($releaseManifest.full) }
  if($entries.Count -eq 0){ return '' }
  $seen=@{}
  $rows=@()
  foreach($entry in $entries){
    $path=[string]$entry.path
    $hash=([string]$entry.sha256).ToLower()
    $size=[long]$entry.size
    if(-not $path -or $hash -notmatch '^[0-9a-f]{64}$' -or $size -lt 0){ return '' }
    $chunkValue='-'
    if($null -ne $entry.PSObject.Properties['chunks']){
      $at=0L; $chunkRows=@()
      foreach($chunk in @($entry.chunks)){
        $offset=[long]$chunk.offset; $chunkSize=[long]$chunk.size
        $chunkHash=([string]$chunk.sha256).ToLowerInvariant()
        if($offset -ne $at -or $chunkSize -le 0 -or $chunkHash -notmatch '^[0-9a-f]{64}$'){ return '' }
        $chunkRows += "$offset|$chunkSize|$chunkHash"
        $at += $chunkSize
      }
      if($chunkRows.Count -eq 0 -or $at -ne $size){ return '' }
      $chunkValue=$chunkRows -join ','
    }
    $value="$size|$hash|$chunkValue"
    # Order is executable semantics: boot.js evaluates classic scripts in this
    # exact sequence. A reorder with identical bytes must therefore produce a
    # different root and fail same-version resume arbitration.
    if($seen.ContainsKey($path)){ return '' }
    $seen[$path]=$true
    $rows += "$path|$value"
  }
  return ($rows -join "`n")
}
function Get-ReleaseRuntimeFingerprint([object[]]$entries){
  $seen=@{}; $rows=@()
  foreach($entry in @($entries)){
    $path=[string]$entry.path
    $hash=([string]$entry.sha256).ToLowerInvariant()
    $size=[long]$entry.size
    if(-not $path -or $seen.ContainsKey($path) -or
       $hash -notmatch '^[0-9a-f]{64}$' -or $size -le 0){ return '' }
    $seen[$path]=$true
    $rows += "$path|$size|$hash"
  }
  return ($rows -join "`n")
}
function Test-ReleasePayloadMatch([object]$candidate,[object]$remote){
  $candidateFingerprint=Get-ReleasePayloadFingerprint $candidate
  $remoteFingerprint=Get-ReleasePayloadFingerprint $remote
  if($candidateFingerprint.Length -eq 0 -or $candidateFingerprint -cne $remoteFingerprint){ return $false }
  # Delta files[] may match while a damaged or stale full[] would strand every
  # off-base client. When either representation has a complete recovery view,
  # require both complete views to match as well.
  $candidateHasFull=($null -ne $candidate.PSObject.Properties['full']) -and ($null -ne $candidate.full) -and (@($candidate.full).Count -gt 0)
  $remoteHasFull=($null -ne $remote.PSObject.Properties['full']) -and ($null -ne $remote.full) -and (@($remote.full).Count -gt 0)
  if(-not $candidateHasFull -and -not $remoteHasFull){ return $true }
  if(-not $candidateHasFull -or -not $remoteHasFull){ return $false }
  [object[]]$candidateFull=@($candidate.full)
  [object[]]$remoteFull=@($remote.full)
  $candidateFullFingerprint=Get-ReleasePayloadFingerprint ([pscustomobject]@{ files=$candidateFull })
  $remoteFullFingerprint=Get-ReleasePayloadFingerprint ([pscustomobject]@{ files=$remoteFull })
  return ($candidateFullFingerprint.Length -gt 0) -and ($candidateFullFingerprint -ceq $remoteFullFingerprint)
}
function New-DeltaPayloadPlan([object[]]$currentEntries,[object]$priorManifest){
  # A delta's files[] contains only new bytes, but full[] is the recovery path
  # for every client that is not on patchFrom. Build that complete view by
  # retaining immutable prior URLs for unchanged paths and switching only the
  # changed paths to this version's immutable folder.
  [object[]]$priorEntries=@($priorManifest.full)
  if($priorEntries.Count -eq 0){ [object[]]$priorEntries=@($priorManifest.files) }
  Need ($priorEntries.Count -gt 0) 'The patch base manifest has no complete payload inventory'
  $priorBy=@{}
  foreach($entry in $priorEntries){
    $path=[string]$entry.path
    $hash=([string]$entry.sha256).ToLowerInvariant()
    $size=[long]$entry.size
    $url=[string]$entry.url
    Need ($path.Length -gt 0) 'The patch base manifest contains an entry without a path'
    Need (-not $priorBy.ContainsKey($path)) "The patch base manifest contains duplicate path $path"
    Need ($hash -match '^[0-9a-f]{64}$') "The patch base manifest contains an invalid sha256 for $path"
    Need ($size -ge 0) "The patch base manifest contains an invalid size for $path"
    Need ($url -match '^https://') "The patch base manifest contains no immutable recovery URL for $path"
    $priorBy[$path]=$entry
  }
  $currentBy=@{}
  foreach($entry in $currentEntries){
    $path=[string]$entry.path
    Need ($path.Length -gt 0) 'The current OTA inventory contains an entry without a path'
    Need (-not $currentBy.ContainsKey($path)) "The current OTA inventory contains duplicate path $path"
    $currentBy[$path]=$entry
    Need ($priorBy.ContainsKey($path)) "Artifact $path does not exist in the patch base; publish a full release instead"
  }
  foreach($path in $priorBy.Keys){
    Need ($currentBy.ContainsKey($path)) "Artifact $path was removed since the patch base; publish a full release instead"
  }
  $priorOrder=@($priorEntries | ForEach-Object { [string]$_.path })
  $currentOrder=@($currentEntries | ForEach-Object { [string]$_.path })
  Need (($priorOrder -join "`n") -ceq ($currentOrder -join "`n")) 'Executable artifact order changed since the patch base; publish a full release instead'
  $changed=@()
  $complete=@()
  foreach($entry in $currentEntries){
    $path=[string]$entry.path
    $prior=$priorBy[$path]
    $same=(([string]$prior.sha256).ToLowerInvariant() -eq ([string]$entry.sha256).ToLowerInvariant()) -and
      ([long]$prior.size -eq [long]$entry.size)
    if($same){
      $retained=[ordered]@{
        path=$path
        size=[long]$prior.size
        sha256=([string]$prior.sha256).ToLowerInvariant()
        url=[string]$prior.url
        local=$null
      }
      # v1.33.57 and older manifests may have no chunk tables. The current
      # locally verified artifact describes the exact same bytes, so attach its
      # deterministic schema-3 table while retaining only the prior immutable
      # URL. This makes the first schema-3 fallback resumable and lets -Resume
      # compare its artifacts.json representation to its own candidate.
      $currentChunks=@(Copy-ReleaseChunks $entry)
      if($currentChunks.Count -gt 0){ $retained.chunks=$currentChunks }
      $complete += [pscustomobject]$retained
    } else {
      $changed += $entry
      $complete += $entry
    }
  }
  return [pscustomobject]@{ files=@($changed); full=@($complete) }
}
function Read-RemoteJsonIfPresent([string]$url,[string]$label){
  try {
    $response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers @{'Cache-Control'='no-cache'}
    return ($response.Content | ConvertFrom-Json)
  }
  catch {
    $status=$null
    if($_.Exception.Response){ try { $status=[int]$_.Exception.Response.StatusCode } catch {} }
    if($status -eq 404){ return $null }
    throw "Remote live manifest check failed for $label. No upload was attempted. $($_.Exception.Message)"
  }
}
function Test-RemoteReleaseDirectoryExists([string]$relativePath){
  $encodedPath=(@($relativePath.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
  $url="https://huggingface.co/api/datasets/$Repo/tree/main/$($encodedPath)?recursive=false&expand=false"
  try {
    $null=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers @{'Cache-Control'='no-cache'}
    return $true
  }
  catch {
    $status=$null
    if($_.Exception.Response){ try { $status=[int]$_.Exception.Response.StatusCode } catch {} }
    if($status -eq 404){ return $false }
    throw "Authoritative Hub tree check failed for $relativePath. No upload was attempted. $($_.Exception.Message)"
  }
}
function Get-RemoteDatasetPathInfoMap([string[]]$relativePaths,[string]$revision='main'){
  # The Hub paths-info API is the authoritative object inventory. CDN resolve
  # URLs can remain readable briefly after a delete, so they must never decide
  # whether an immutable same-version path is safe to create or resume.
  $result=@{}
  $paths=@($relativePaths | Where-Object { $_ } | Select-Object -Unique)
  # expand=true is capped at 50 results by the Hub API.
  for($at=0;$at -lt $paths.Count;$at+=50){
    $last=[Math]::Min($at+49,$paths.Count-1)
    $batch=@($paths[$at..$last])
    $encodedRevision=[uri]::EscapeDataString($revision)
    $url="https://huggingface.co/api/datasets/$Repo/paths-info/$encodedRevision"
    $body=(@($batch | ForEach-Object { 'paths='+[uri]::EscapeDataString([string]$_) }) + 'expand=true') -join '&'
    try {
      # Do not wrap Invoke-RestMethod itself in @(...). In both Windows
      # PowerShell 5.1 and PowerShell 7 that can create one nested Object[];
      # member enumeration then turns every returned path into one bogus,
      # space-joined map key. Assign first and enumerate the result explicitly.
      $response=Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/x-www-form-urlencoded' -Body $body -TimeoutSec 60 -Headers @{'Cache-Control'='no-cache'}
    } catch {
      throw "Authoritative Hub paths-info check failed. No upload was attempted. $($_.Exception.Message)"
    }
    $requested=@{}
    foreach($requestedPath in $batch){ $requested[[string]$requestedPath]=$true }
    foreach($entry in $response){
      $path=[string]$entry.path
      Need ($path.Length -gt 0) 'Authoritative Hub paths-info returned a blank path'
      Need ($requested.ContainsKey($path)) "Authoritative Hub paths-info returned unexpected path '$path'"
      Need (-not $result.ContainsKey($path)) "Authoritative Hub paths-info returned duplicate path '$path'"
      $result[$path]=$entry
    }
  }
  return $result
}
function Get-ImmutableArtifactDisposition([object]$remote,[long]$localSize,[string]$localSha256,[string]$localGitOid,[string]$label){
  if($null -eq $remote){ return 'missing' }
  $remoteSize=[long]$remote.size
  if($null -ne $remote.PSObject.Properties['lfs'] -and $null -ne $remote.lfs -and
     $null -ne $remote.lfs.PSObject.Properties['size']){
    $remoteSize=[long]$remote.lfs.size
  }
  if($remoteSize -ne $localSize){
    throw "require-new-version: remote $label already exists with size $remoteSize instead of $localSize. Refusing to overwrite immutable same-version bytes."
  }
  $remoteSha=''
  if($null -ne $remote.PSObject.Properties['lfs'] -and $null -ne $remote.lfs -and
     $null -ne $remote.lfs.PSObject.Properties['oid']){
    $remoteSha=([string]$remote.lfs.oid).ToLowerInvariant() -replace '^sha256:',''
  }
  if(-not $remoteSha -and $null -ne $remote.PSObject.Properties['sha256']){
    $remoteSha=([string]$remote.sha256).ToLowerInvariant() -replace '^sha256:',''
  }
  if($remoteSha -match '^[0-9a-f]{64}$'){
    if($remoteSha -cne $localSha256.ToLowerInvariant()){
      throw "require-new-version: remote $label already exists with different SHA-256 bytes. Refusing to overwrite immutable same-version bytes."
    }
    return 'identical'
  }
  # Non-LFS Hub objects expose their canonical Git blob oid rather than a
  # SHA-256. It still binds the complete byte sequence (including its length),
  # and is independently computed from the local file below.
  $remoteOid=if($null -ne $remote.PSObject.Properties['oid']){([string]$remote.oid).ToLowerInvariant()}else{''}
  if($remoteOid -match '^[0-9a-f]{40}$' -and $localGitOid -match '^[0-9a-f]{40}$'){
    if($remoteOid -cne $localGitOid.ToLowerInvariant()){
      throw "require-new-version: remote $label already exists with different Git object bytes. Refusing to overwrite immutable same-version bytes."
    }
    return 'identical'
  }
  throw "require-new-version: remote $label exists but the Hub returned no complete content identity. Refusing an unproven same-version overwrite."
}
function Get-GitBlobOid([string]$file){
  $length=(Get-Item -LiteralPath $file).Length
  $prefix=[Text.Encoding]::ASCII.GetBytes("blob $length`0")
  $sha=[Security.Cryptography.SHA1]::Create()
  $stream=[IO.File]::OpenRead($file)
  try {
    $null=$sha.TransformBlock($prefix,0,$prefix.Length,$prefix,0)
    $buffer=New-Object byte[] 1048576
    while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){
      $null=$sha.TransformBlock($buffer,0,$read,$buffer,0)
    }
    $null=$sha.TransformFinalBlock((New-Object byte[] 0),0,0)
    return ([BitConverter]::ToString($sha.Hash)).Replace('-','').ToLowerInvariant()
  } finally {
    $stream.Dispose(); $sha.Dispose()
  }
}
function Get-FileImmutableDisposition([object]$remote,[string]$file,[string]$sha256,[string]$label){
  $info=Get-Item -LiteralPath $file
  $gitOid=''
  if($null -ne $remote){
    $hasLfsSha=$false
    if($null -ne $remote.PSObject.Properties['lfs'] -and $null -ne $remote.lfs -and
       $null -ne $remote.lfs.PSObject.Properties['oid']){
      $hasLfsSha=((([string]$remote.lfs.oid).ToLowerInvariant() -replace '^sha256:','') -match '^[0-9a-f]{64}$')
    }
    if(-not $hasLfsSha){ $gitOid=Get-GitBlobOid $file }
  }
  return Get-ImmutableArtifactDisposition $remote ([long]$info.Length) $sha256 $gitOid $label
}
function Get-ResponseHeaderValue([object]$response,[string]$name){
  try { return (@($response.Headers.GetValues($name)) -join ',') } catch {}
  try { return (@($response.Content.Headers.GetValues($name)) -join ',') } catch {}
  return ''
}
function Assert-PinnedChunkRange([Net.Http.HttpClient]$client,[object]$entry,[object]$chunk){
  $start=[long]$chunk.offset
  $length=[long]$chunk.size
  Need ($length -gt 0) "Advertised range for $($entry.path) is empty"
  $end=$start+$length-1
  $request=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Get,[string]$entry.url)
  $request.Headers.Range=New-Object Net.Http.Headers.RangeHeaderValue($start,$end)
  $request.Headers.TryAddWithoutValidation('Accept-Encoding','identity') | Out-Null
  # Probe the same cross-origin contract as the installed Android webview. HF's
  # non-LFS cache echoes a supplied Origin rather than returning `*`; omitting
  # Origin would reject a response that browser JavaScript can read safely.
  $probeOrigin='https://localhost'
  $request.Headers.TryAddWithoutValidation('Origin',$probeOrigin) | Out-Null
  $response=$null; $stream=$null; $sha=$null
  try {
    $response=$client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    Need ([int]$response.StatusCode -eq 206) "Pinned range probe for $($entry.path) returned HTTP $([int]$response.StatusCode), expected 206"
    $contentRange=[string]$response.Content.Headers.ContentRange
    $expected="bytes $start-$end/$([long]$entry.size)"
    Need ($contentRange -ceq $expected) "Pinned range probe for $($entry.path) returned Content-Range '$contentRange', expected '$expected'"
    if($null -ne $response.Content.Headers.ContentLength){
      Need ([long]$response.Content.Headers.ContentLength -eq $length) "Pinned range probe for $($entry.path) returned the wrong Content-Length"
    }
    $encoding=Get-ResponseHeaderValue $response 'Content-Encoding'
    Need (-not $encoding -or $encoding -eq 'identity') "Pinned range probe for $($entry.path) transformed the advertised bytes with Content-Encoding '$encoding'"
    $allowOrigin=Get-ResponseHeaderValue $response 'Access-Control-Allow-Origin'
    $exposed=Get-ResponseHeaderValue $response 'Access-Control-Expose-Headers'
    Need ($allowOrigin -eq '*' -or $allowOrigin -ceq $probeOrigin) "Pinned range probe for $($entry.path) is not cross-origin readable for $probeOrigin (Access-Control-Allow-Origin '$allowOrigin')"
    Need (($exposed -split '\s*,\s*') -contains '*' -or ($exposed -split '\s*,\s*') -contains 'Content-Range') "Pinned range probe for $($entry.path) does not expose Content-Range to the browser updater"
    $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $sha=[Security.Cryptography.SHA256]::Create()
    $remaining=$length
    $buffer=New-Object byte[] 1048576
    while($remaining -gt 0){
      $wanted=[int][Math]::Min([long]$buffer.Length,$remaining)
      $read=$stream.Read($buffer,0,$wanted)
      Need ($read -gt 0) "Pinned range probe for $($entry.path) ended before $length bytes"
      $null=$sha.TransformBlock($buffer,0,$read,$buffer,0)
      $remaining-=$read
    }
    Need ($stream.ReadByte() -eq -1) "Pinned range probe for $($entry.path) returned more than $length bytes"
    $null=$sha.TransformFinalBlock((New-Object byte[] 0),0,0)
    $actual=([BitConverter]::ToString($sha.Hash)).Replace('-','').ToLowerInvariant()
    Need ($actual -ceq ([string]$chunk.sha256).ToLowerInvariant()) "Pinned range probe for $($entry.path) failed chunk SHA-256 at $start"
  } finally {
    if($sha){$sha.Dispose()}; if($stream){$stream.Dispose()}; if($response){$response.Dispose()}; $request.Dispose()
  }
}
function Assert-PinnedAdvertisedRanges([object]$releaseManifest){
  $handler=New-Object Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect=$true
  $handler.AutomaticDecompression=[Net.DecompressionMethods]::None
  $client=New-Object Net.Http.HttpClient($handler)
  $client.Timeout=[TimeSpan]::FromMinutes(5)
  try {
    $seen=@{}
    foreach($entry in @(@($releaseManifest.files)+@($releaseManifest.full))){
      $key="$($entry.url)|$($entry.size)|$($entry.sha256)"
      if($seen.ContainsKey($key)){ continue }; $seen[$key]=$true
      $chunks=@(Copy-ReleaseChunks $entry)
      Need ($chunks.Count -gt 0) "Advertised artifact $($entry.path) has no range table"
      Assert-PinnedChunkRange $client $entry $chunks[0]
      if($chunks.Count -gt 1){ Assert-PinnedChunkRange $client $entry $chunks[$chunks.Count-1] }
    }
  } finally { $client.Dispose(); $handler.Dispose() }
}

Need ($null -ne $HfCommand) 'Hugging Face CLI was not found. Install it or set HF_CLI, then run: hf auth login'
Need ($Version -match '^\d+\.\d+\.\d+$') "Version '$Version' must use major.minor.patch numbers, for example 1.32.86."
$artifactNames=Get-ReleaseArtifactNamespace $Version $ArtifactRevision
$otaRemotePrefix=$artifactNames.prefix
$artifactStem=$artifactNames.stem
$current=(Get-Content package.json -Raw -Encoding utf8 | ConvertFrom-Json).version
$releaseManifestPath=Join-Path $Root 'update.json'
$previousManifest=Get-Content $releaseManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$publishedLocal=[string]$previousManifest.version
$advancesSource=[version]$Version -gt [version]$current
$resumesFailedRelease=([version]$Version -eq [version]$current) -and
  (([version]$Version -gt [version]$publishedLocal) -or $Resume)
$preparingCurrentCandidate=([version]$Version -eq [version]$current) -and $PrepareOnly
Need ($advancesSource -or $resumesFailedRelease -or $preparingCurrentCandidate) "Version $Version must be higher than source $current, or use -Resume for an interrupted publish of the current source version."
$code=([int]($Version.Split('.')[0])*10000)+([int]($Version.Split('.')[1])*100)+[int]$Version.Split('.')[2]
$verb=if($resumesFailedRelease){'continuing an unpublished local candidate after'}else{'replacing'}
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
Need ($extraEntries.Count -eq 0) '-Extra cannot be placed in executable files[] safely; publish it through a typed optional-pack manifest instead.'

if($DryRun){
  Write-Host 'Dry run only: no source, release artifact, or Hugging Face file was changed.' -ForegroundColor Yellow
  exit 0
}

Need (-not ($PrepareOnly -and $UploadOnly)) 'Choose -PrepareOnly or -UploadOnly, not both.'
Need ($PrepareOnly -or $UploadOnly) 'Use -PrepareOnly to build locally or -UploadOnly to stage immutable artifacts. Live activation uses the verified mirror and repointer phases.'
Run 'Check artifact revision remains unpublished before build' { Assert-UnpublishedArtifactRevision $Version $ArtifactRevision }
Run 'Check canonical workspace writer gate' { node tools/evidence-foundation/workspace-guard.mjs check-write }

# Keep the bump list explicit. A partial version bump is worse than a failed release:
# the client can endlessly offer its own update if the payload and manifest disagree.
$plain=@('boot.js','sw.js','src/updater.js','package.json','index.html','assets/app.webmanifest')
foreach($rel in $plain){
  $file=Join-Path $Root $rel
  $text=Get-Content $file -Raw -Encoding utf8
  $originalText=$text
  if(-not $text.Contains($Version)){
    Need ($text.Contains($current)) "Neither target version $Version nor current source version $current was found in $rel. Stop and update this publisher's bump list."
    $text=$text.Replace($current,$Version)
  }
  # Resume is deliberately idempotent. Do not rewrite identical files: a local
  # preview may have an executable mapped while the already-versioned source is
  # being resumed, and no-op writes create both lock failures and false diffs.
  if($text -cne $originalText){
    [IO.File]::WriteAllText($file,$text,(New-Object Text.UTF8Encoding($false)))
  }
}
# package-lock.json had remained on 1.32.2 because it was never in the explicit
# bump list. It is collaborator metadata, not runtime state, but leaving its two
# root package versions stale makes every source archive internally ambiguous.
$lockPath=Join-Path $Root 'package-lock.json'
$originalLock=Get-Content $lockPath -Raw -Encoding utf8
$lock=$originalLock
$lock=[regex]::Replace($lock,'("name"\s*:\s*"massfront"\s*,\s*"version"\s*:\s*")[^"]+',{
  param($match) $match.Groups[1].Value+$Version
})
if($lock -cne $originalLock){
  [IO.File]::WriteAllText($lockPath,$lock,(New-Object Text.UTF8Encoding($false)))
}
$gradle=Join-Path $Root 'android/app/build.gradle'
$g=Get-Content $gradle -Raw -Encoding utf8
$originalGradle=$g
$g=[regex]::Replace($g,'versionCode\s+\d+','versionCode '+$code)
$g=[regex]::Replace($g,'versionName\s+"[^"]+"','versionName "'+$Version+'"')
if($g -cne $originalGradle){
  [IO.File]::WriteAllText($gradle,$g,(New-Object Text.UTF8Encoding($false)))
}

Run 'Verify updater range retry contract' { node tools/test-updater-range-retry.mjs }
Run 'Bundle syntax gate' { node tools/bundle.mjs }
# A publishable player is the complete player. Diagnostic slim mode is useful
# for bounded local probes, but must never leak into a browser/PWA or Android
# release through an inherited shell variable.
Need ($env:MASSFRONT_DIAGNOSTIC_SLIM -ne '1') 'MASSFRONT_DIAGNOSTIC_SLIM=1 is diagnostic-only and cannot publish a player release.'
Remove-Item Env:MASSFRONT_INCLUDE_EXPLORATION -ErrorAction SilentlyContinue
Run 'Stage web build' { node tools/pack-www.mjs }
Need (Test-Path -LiteralPath (Join-Path $Root 'www\modules\space_exploration\index.html')) 'Base www is missing the signed Galactic Exploration runtime.'
if($PatchFrom){
  Write-Host "Delta: complete www is staged, but Android wrapper sync is skipped; installed native shells remain unchanged." -ForegroundColor Yellow
} else {
  Run-CapacitorSyncFailClosed 'Android'
}

if($PatchFrom){
  Write-Host 'Delta: skipping Android toolchain setup and APK build. The installed native shell remains unchanged.' -ForegroundColor Yellow
} else {
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
}

$apk="releases/${artifactStem}-mobile-install.apk"
if($PatchFrom){
  Write-Host "Delta: no APK is built or required. Devices keep the installer they already have." -ForegroundColor Yellow
} else {
  $androidBuildTools=(Resolve-Path '.toolchains/android-sdk/build-tools/*' | Sort-Object Path -Descending | Select-Object -First 1).Path
  $env:ANDROID_BUILD_TOOLS=$androidBuildTools
  Run 'Optimize and sign APK' {
    & (Join-Path $Root 'tools/shrink-apk.ps1') -Source 'android/app/build/outputs/apk/debug/app-debug.apk' `
      -Output $apk -BuildTools $androidBuildTools -JavaHome $jdk
  }
  Run 'Verify Android APK release contract' {
    Assert-AndroidReleaseApk (Join-Path $Root $apk) $androidBuildTools
  }
}
Run 'Build OTA patch' { node tools/bundle-update.mjs $Version }
Run 'Verify OTA binary art' { node tools/test-update-binary-art.mjs $Version }
Run 'Verify package and OTA matchmaking identity' {
  node tools/test-runtime-compatibility-build.mjs "releases/staging-v$Version"
}

# The OTA is a per-file payload now: a staging folder plus an index carrying
# size and sha256 for every artifact. bundle-update.mjs writes both.
$otaStage="releases/staging-v$Version"
$otaIndexPath=Join-Path $otaStage "artifacts.json"
if(-not $PatchFrom){ Need (Test-Path $apk) "APK was not created: $apk" }
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
  Assert-ReleaseChunks $full $a
}
# The sources in the payload must be exactly the manifest order, in order.
# An add, a removal or a reorder changes what boot.js concatenates, and the
# client keeps a prior order wholesale when merging a patch - so a delta can
# never express such a change and must be published as a full release.
[object[]]$declaredOrder = (Get-Content -LiteralPath (Join-Path $Root "assets/data/manifest.json") -Raw -Encoding utf8 | ConvertFrom-Json).order
$stagedSources=@($otaIndex | Where-Object { $_.path -notlike "ota/*" } | ForEach-Object { $_.path })
Need (($stagedSources -join "|") -eq ($declaredOrder -join "|")) "Staged sources do not match assets/data/manifest.json order"
# Preserve the channel/pack delivery contract and emit schema 3's immutable
# roots plus optional verified range tables. Older clients ignore the added
# fields and still consume the same files/full transport arrays.
# Where each artifact lives. A full release publishes everything under
# v<version>/; a delta publishes only what changed there. Its full[] overlays
# those new entries onto the prior complete payload so off-base clients still
# receive the complete target version rather than silently reinstalling old bytes.
$otaBase="https://huggingface.co/datasets/$Repo/resolve/main"
$fullFiles=@($otaIndex | ForEach-Object {
  $entry=[ordered]@{ path=$_.path; size=[long]$_.size; sha256=([string]$_.sha256).ToLowerInvariant()
                     url="$otaBase/$otaRemotePrefix/$($_.path)?download=true"; local=(Join-Path $otaStage $_.path) }
  $chunks=@(Copy-ReleaseChunks $_)
  if($chunks.Count -gt 0){ $entry.chunks=$chunks }
  [pscustomobject]$entry
})
if($PatchFrom){
  $priorPath=Join-Path $Root "releases/update-v$PatchFrom.json"
  Need (Test-Path -LiteralPath $priorPath) "Cannot cut a delta against $PatchFrom - releases/update-v$PatchFrom.json is missing"
  $prior=Get-Content -LiteralPath $priorPath -Raw -Encoding utf8 | ConvertFrom-Json
  $deltaPlan=New-DeltaPayloadPlan $fullFiles $prior
  $publishFiles=@($deltaPlan.files)
  $fullFiles=@($deltaPlan.full)
  Need ($publishFiles.Count -gt 0) "Nothing changed since $PatchFrom - there is no patch to publish"
  Write-Host ("Delta against $PatchFrom : " + $publishFiles.Count + " of " + $otaIndex.Count + " artifacts changed") -ForegroundColor Cyan
} else {
  $publishFiles=$fullFiles
}
Need ($publishFiles.Count -gt 0) "Refusing to publish an empty file list"

$basePackIds=@('voice','music','exploration','galactic-exploration')
$optionalPacks=@()
if($previousManifest.optionalPacks){
  # These IDs were optional in earlier slim packages. Carrying that stale
  # advertisement into a complete player would make the launcher offer a
  # duplicate download for bytes now guaranteed by www/APK packaging.
  $optionalPacks=@($previousManifest.optionalPacks | Where-Object { $basePackIds -notcontains [string]$_.id })
}

$manifest=[ordered]@{
  schema=3
  channel=if($previousManifest.channel){[string]$previousManifest.channel}else{'stable'}
  severity=if($previousManifest.severity){[string]$previousManifest.severity}else{'recommended'}
  minBaseVersion=if($previousManifest.minBaseVersion){[string]$previousManifest.minBaseVersion}else{'1.22.0'}
  packsIndex=if($previousManifest.packsIndex){[string]$previousManifest.packsIndex}else{'packs.json'}
  optionalPacks=@($optionalPacks)
  notes=$Notes
  features=@($Features | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
  fixes=@($Fixes | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
  upcoming=@($Upcoming | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
  version=$Version
  base=''
  # PER-FILE DELIVERY. Every entry carries an ABSOLUTE url rather than
  # relying on the manifest-wide `base` prefix, because `base` is read once
  # by the client before it decides whether it is applying a patch - so on a
  # patch manifest it points at the delta folder, which is the one place a
  # complete payload is guaranteed NOT to be. Absolute urls also let each
  # entry be re-pinned to an immutable commit sha independently.
  files=@(@($publishFiles | ForEach-Object { New-ManifestFileEntry $_ }) +
          @($extraEntries | ForEach-Object { New-ManifestFileEntry $_ }))
}
# The OTA payload must stay files[0]: updApply reads the manifest order to
# decide what to evaluate as the new source. Extras follow it as cached data.
# boot.js validBundle() refuses any bundle whose manifestCategory is not one of
# system/hotfix/content/overhaul, and it applies that check AFTER the download
# has completed and verified. A manifest published without a category therefore
# passes every gate here, downloads clean on the device, and then fails at
# restart with "the downloaded update was incomplete" - which reads as a corrupt
# payload rather than a missing field. v1.33.84 shipped exactly that and had to
# be superseded, because activation refuses a downgrade. Fail here instead.
if(-not $Category){
  throw 'A release category is required: pass -Category system|hotfix|content|overhaul. boot.js will refuse to install a manifest without one.'
}
$manifest.category=$Category
$manifest.kind='full'
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
$manifest.full=@($fullFiles | ForEach-Object { New-ManifestFileEntry $_ })
# The transfer identity is byte-derived, never Date.now()-derived. payloadRoot
# names the adjacent/delta transfer, fullRoot names off-base recovery, and the
# manifest root binds both choices to the release/channel/category contract.
# The client includes the selected mode in its journal key.
$manifest.payloadRoot=Get-StringSha256 (Get-ReleasePayloadFingerprint ([pscustomobject]@{ files=@($manifest.files) }))
$manifest.fullRoot=Get-StringSha256 (Get-ReleasePayloadFingerprint ([pscustomobject]@{ files=@($manifest.full) }))
$manifest.runtimeRoot=Get-StringSha256 (Get-ReleaseRuntimeFingerprint @($manifest.full))
$manifest.manifestRoot=Get-StringSha256 ((@(
  "schema=$($manifest.schema)","channel=$($manifest.channel)","version=$Version",
  "kind=$($manifest.kind)","category=$Category","patchFrom=$PatchFrom",
  "payload=$($manifest.payloadRoot)","full=$($manifest.fullRoot)",
  "runtime=$($manifest.runtimeRoot)"
) -join "`n"))
if($PrepareOnly -or $UploadOnly){
  # A candidate proves the proposed bytes without mutating the checked-in/live
  # activation manifest. Its URLs intentionally remain unpinned until the
  # immutable HF commit has been uploaded and verified.
  $candidate="releases/candidates/update-v$Version.candidate.json"
  $candidateDir=Split-Path -Parent (Join-Path $Root $candidate)
  New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
  WriteReleaseManifest $candidate $manifest
  Write-Host "Prepared candidate manifest: $candidate" -ForegroundColor Yellow
}

# Archive only canonical project material. Build caches and old releases are
# intentionally excluded, so collaborators get the real source/assets quickly.
# Keep staging below the authority checkout: an interrupted publish must not
# create another persistent MASSFRONT tree in the system temp directory.
$source="releases/${artifactStem}-source.zip"
if($PatchFrom){
  Write-Host "Delta: source staging and archive generation are skipped; the prior immutable source archive remains authoritative." -ForegroundColor Yellow
} elseif(-not $IncludeSourceArchive){
  Write-Host 'Source archive: skipped (player releases do not build massive collaborator archives unless -IncludeSourceArchive is explicit).' -ForegroundColor Yellow
} else {
$stage=Join-Path $Root ".tmp\publish-hf-release\source-$Version"
if(Test-Path $stage){ Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
$keep=@(
  'AGENTS.md','README.md','package.json','package-lock.json','index.html','boot.js','sw.js',
  'capacitor.config.json','capacitor.config.ts','PUBLISH_HF_RELEASE.bat','update.json',
  '.github','assets','src','tools','android','cloudflare','docs','design',
  # audit/ is local verification evidence only. Including it bloated 1.33.49 to
  # 5.68 GiB and broke the HF LFS upload; evidence stays in the checkout, not
  # the collaborator handoff archive (same class as tmp/ and .tmp/).
  # These are development/source handoff material, not runtime payload. The
  # signed Galactic runtime rides in www/APK; a full-source archive must also
  # preserve its larger authoring tree and provenance references.
  'modules','source-media'
)
foreach($name in $keep){
  $from=Join-Path $Root $name
  if(Test-Path $from){
    $to=Join-Path $stage $name
    if((Get-Item $from).PSIsContainer){
      # Keep authored module/source assets, but never archive regenerable build
      # products, captured evidence, remote attachment mirrors, or downloaded
      # toolchains. /XD applies recursively, so this also protects nested
      # space-module worktrees without deleting any of those local materials.
      & robocopy $from $to /E /XD build .gradle .gradle-mobile .kotlin node_modules tmp .tmp .cache .toolchains .codex-remote-attachments .migration-evidence .wrangler logs audit /XF '*.apk' '*.idsig' /NFL /NDL /NJH /NJS | Out-Null
      if($LASTEXITCODE -gt 7){ throw "Source archive copy failed for $name (robocopy $LASTEXITCODE)" }
    } else { Copy-Item -LiteralPath $from -Destination $to -Force }
  }
}
# Capacitor copies the complete web build into the Android wrapper. That folder
# is generated from the canonical root assets/src during `cap sync`; retaining
# both copies bloats the collaborator archive without preserving source or art.
foreach($rel in @('android/app/src/main/assets/public')){
  $copy=Join-Path $stage $rel
  if(Test-Path -LiteralPath $copy){ Remove-Item -LiteralPath $copy -Recurse -Force }
}
# D1 migration evidence may contain production database/session exports. It is
# never collaborator source material. /XD prevents the copy; this second gate
# fails closed if a future copy path bypasses that recursive exclusion.
$unsafeStateLeak=@(Get-ChildItem -LiteralPath $stage -Recurse -Force -Directory | Where-Object { $_.Name -in @('.migration-evidence','.wrangler') })
Need ($unsafeStateLeak.Count -eq 0) 'Source archive staging contains production migration evidence or generated Wrangler state; refusing to package database/session/trace data.'
if(Test-Path $source){ Remove-Item -LiteralPath $source -Force }
$archiveItems=@(Get-ChildItem -LiteralPath $stage -Force)
Need ($archiveItems.Count -gt 0) "Source archive staging is empty; refusing to publish an unusable handoff."
Need (Test-Path -LiteralPath (Join-Path $stage 'sw.js')) "Source archive staging omitted sw.js; refusing to publish a handoff that cannot reproduce the PWA."
Compress-Archive -Path $archiveItems.FullName -DestinationPath $source -CompressionLevel Optimal
Need ((Get-Item -LiteralPath $source).Length -gt 1048576) "Source archive is implausibly small; refusing to publish an unusable handoff."
Remove-Item -LiteralPath $stage -Recurse -Force
}

if($PrepareOnly){
  Write-Host "`nPrepared v$Version locally; no Hugging Face file was changed." -ForegroundColor Green
  Write-Host "OTA: $otaStage"
  if($PatchFrom){
    Write-Host "APK: unchanged from v$PatchFrom (not built or required)"
    Write-Host "Source: unchanged from v$PatchFrom (not staged or built)"
  } else {
    Write-Host "APK: $apk"
    if($IncludeSourceArchive){ Write-Host "Source candidate: $source" }
    else { Write-Host 'Source candidate: skipped (opt-in channel)' }
  }
  Write-Host "NOTE: the local manifest is intentionally unpinned and is evidence only; pinning occurs after immutable artifacts are uploaded and verified."
  exit 0
}

# Every immutable class arbitrates its own remote paths. A matching OTA index
# cannot authorize skipping (or overwriting) an APK/source object, and a live
# manifest can never stand in for authoritative byte identity. This guard runs
# for fresh and -Resume publishes alike: an interrupted upload is resumed by
# uploading only missing bytes; any occupied path with different bytes requires
# a new version.
$guardNonce=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$remotePaths=@($publishFiles | ForEach-Object { "$otaRemotePrefix/$($_.path)" })
$remotePaths += "$otaRemotePrefix/artifacts.json"
if(-not $PatchFrom){
  $remotePaths += "${artifactStem}-mobile-install.apk"
  if($IncludeSourceArchive){ $remotePaths += "${artifactStem}-source.zip" }
}
$remotePaths += @("update-v$Version.json",'MASSFRONT-update.json','update.json')
$remotePathInfo=Get-RemoteDatasetPathInfoMap @($remotePaths) 'main'

$otaFilesToUpload=@()
foreach($pf in $publishFiles){
  $remotePath="$otaRemotePrefix/$($pf.path)"
  $remote=if($remotePathInfo.ContainsKey($remotePath)){$remotePathInfo[$remotePath]}else{$null}
  $disposition=Get-FileImmutableDisposition $remote ([string]$pf.local) ([string]$pf.sha256) $remotePath
  if($disposition -eq 'missing'){
    $otaFilesToUpload += $pf
  } else {
    Write-Host "Immutable resume: OTA artifact already verified: $remotePath" -ForegroundColor Green
  }
}
$inventoryRemotePath="$otaRemotePrefix/artifacts.json"
$inventoryRemote=if($remotePathInfo.ContainsKey($inventoryRemotePath)){$remotePathInfo[$inventoryRemotePath]}else{$null}
$inventorySha=(Get-FileHash -LiteralPath $otaIndexPath -Algorithm SHA256).Hash.ToLowerInvariant()
$inventoryDisposition=Get-FileImmutableDisposition $inventoryRemote $otaIndexPath $inventorySha $inventoryRemotePath
$otaInventoryUploadNeeded=($inventoryDisposition -eq 'missing')
if(-not $otaInventoryUploadNeeded){
  $remoteOtaIndex=Read-RemoteJsonIfPresent "$otaBase/$otaRemotePrefix/artifacts.json?download=true&publish_guard=$guardNonce" $inventoryRemotePath
  Need (@($remoteOtaIndex).Count -gt 0) "Authoritative Hub inventory says $inventoryRemotePath exists, but its JSON is unreadable; refusing to risk an immutable overwrite."
  Need (Test-ReleasePayloadMatch ([pscustomobject]@{ files=@($manifest.full) }) ([pscustomobject]@{ files=@($remoteOtaIndex) })) "require-new-version: remote $inventoryRemotePath describes different same-version payload bytes."
  Write-Host "Immutable resume: OTA inventory already verified: $inventoryRemotePath" -ForegroundColor Green
}

$apkUploadNeeded=$false
$sourceUploadNeeded=$false
if(-not $PatchFrom){
  $apkRemotePath="${artifactStem}-mobile-install.apk"
  $apkRemote=if($remotePathInfo.ContainsKey($apkRemotePath)){$remotePathInfo[$apkRemotePath]}else{$null}
  $apkSha=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
  $apkUploadNeeded=((Get-FileImmutableDisposition $apkRemote $apk $apkSha $apkRemotePath) -eq 'missing')
  if(-not $apkUploadNeeded){ Write-Host "Immutable resume: Android installer already verified independently." -ForegroundColor Green }

  if($IncludeSourceArchive){
    $sourceRemotePath="${artifactStem}-source.zip"
    $sourceRemote=if($remotePathInfo.ContainsKey($sourceRemotePath)){$remotePathInfo[$sourceRemotePath]}else{$null}
    $sourceSha=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceUploadNeeded=((Get-FileImmutableDisposition $sourceRemote $source $sourceSha $sourceRemotePath) -eq 'missing')
    if(-not $sourceUploadNeeded){ Write-Host "Immutable resume: source archive already verified independently." -ForegroundColor Green }
  }
}

# Existing manifests are contract witnesses only. They can reject same-version
# equivocation, but cannot authorize skipping any immutable artifact class.
$remoteRepresentations=@()
foreach($manifestProbe in @(
  [pscustomobject]@{ path="update-v$Version.json"; label="update-v$Version.json" },
  [pscustomobject]@{ path='MASSFRONT-update.json'; label='MASSFRONT-update.json' },
  [pscustomobject]@{ path='update.json'; label='update.json' }
)){
  if(-not $remotePathInfo.ContainsKey([string]$manifestProbe.path)){ continue }
  $remoteManifest=Read-RemoteJsonIfPresent "$otaBase/$($manifestProbe.path)?download=true&publish_guard=$guardNonce" ([string]$manifestProbe.label)
  if($remoteManifest -and [string]$remoteManifest.version -eq $Version){
    $remoteRepresentations += [pscustomobject]@{ label=$manifestProbe.label; candidate=$manifest; remote=$remoteManifest }
  }
}
foreach($representation in $remoteRepresentations){
  if(-not (Test-ReleasePayloadMatch $representation.candidate $representation.remote)){
    throw "require-new-version: remote $($representation.label) already owns v$Version with different payload hashes. Refusing to overwrite immutable same-version release paths; publish a higher version."
  }
}

# Force the classic LFS upload path. With hf-xet installed the client defaults
# to Xet, and on this machine that handshake hangs on the ~960 MB source
# archive: three runs sat at zero CPU with zero bytes read, never opening the
# file, while the 55 MB OTA and 67 MB APK went up fine in the same session.
# v1.33.41 shipped with NO source archive because of it, and v1.33.43 stalled
# here until this was set. Classic path uploaded 960 MB cleanly twice.
# Upgrading huggingface_hub 1.24.0 -> 1.27.0 did NOT verifiably fix it (hf-xet
# stayed put, and the retest deduped instead of transferring), so this stays
# until someone proves the Xet path works with genuinely new bytes.
Run 'Recheck artifact revision remains unpublished before upload' { Assert-UnpublishedArtifactRevision $Version $ArtifactRevision }
$env:HF_HUB_DISABLE_XET='1'
# Upload only missing OTA bytes. Existing paths were independently proven from
# the authoritative Hub inventory above; no other class can suppress this one.
if($otaFilesToUpload.Count -eq 0){
  Write-Host "Immutable resume: all v$Version OTA artifacts already exist with identical bytes." -ForegroundColor Yellow
} elseif($PatchFrom){
  foreach($pf in $otaFilesToUpload){
    $rel=$pf.path; $loc=$pf.local
    Run "Publish artifact ($rel)" { & $Hf upload $Repo $loc "$otaRemotePrefix/$rel" --type dataset --commit-message "Publish MASSFRONT v$Version artifact $rel" }
  }
} else {
  # A full folder upload is one Hub commit. Re-sending locally identical files
  # is safe and lets the CLI efficiently deduplicate/resume a large source
  # update without 100+ serial commits.
  Run 'Publish OTA payload' { & $Hf upload $Repo $otaStage $otaRemotePrefix --type dataset --commit-message "Publish MASSFRONT v$Version OTA payload ($otaRemotePrefix)" }
  $otaInventoryUploadNeeded=$false
}
# Commit the complete target inventory only after every independently uploaded
# delta artifact exists. A crash before this step is safely resumable because
# existing bytes are compared path-by-path on the next run.
if($otaInventoryUploadNeeded){
  Run 'Publish delta artifact inventory' { & $Hf upload $Repo $otaIndexPath "$otaRemotePrefix/artifacts.json" --type dataset --commit-message "Publish MASSFRONT v$Version artifact inventory" }
}
if($PatchFrom){
  Write-Host "Delta: skipping this upload - the APK is unchanged." -ForegroundColor Yellow
} elseif(-not $apkUploadNeeded){
  Write-Host "Immutable resume: skipping independently verified v$Version Android installer." -ForegroundColor Yellow
} else {
  Run 'Publish Android installer' { & $Hf upload $Repo $apk "${artifactStem}-mobile-install.apk" --type dataset --commit-message "Publish MASSFRONT v$Version Android installer ($otaRemotePrefix)" }
}
# Optional content is published only by the typed pack pipeline. This player
# release never writes the old mutable `exploration-pack` namespace.
Write-Host 'Optional packs: unchanged and independently versioned; no content-pack upload in this player release.' -ForegroundColor Yellow
foreach($x in $extraEntries){
  $xPath=$x.path; $xLocal=$x.local
  Run "Publish extra artifact ($xPath)" { & $Hf upload $Repo $xLocal $xPath --type dataset --commit-message "Publish MASSFRONT v$Version artifact $xPath" }
}
if($PatchFrom){
  Write-Host "Delta: skipping this upload - the source archive is unchanged." -ForegroundColor Yellow
} elseif(-not $IncludeSourceArchive){
  Write-Host 'Source archive upload: skipped (opt-in channel).' -ForegroundColor Yellow
} elseif(-not $sourceUploadNeeded){
  Write-Host "Immutable resume: skipping independently verified v$Version source archive." -ForegroundColor Yellow
} else {
  Run 'Publish source archive' { & $Hf upload $Repo $source "${artifactStem}-source.zip" --type dataset --commit-message "Publish MASSFRONT v$Version source archive" }
}

# Pin every release URL to the exact Hub commit that now contains all immutable
# artifacts. Versioned resolve/main paths can retain deleted pre-activation
# bytes at a CDN edge; a commit URL cannot change underneath the signed hashes.
try {
  $pinState=Invoke-RestMethod -Uri "https://huggingface.co/api/datasets/$Repo" -TimeoutSec 60 -Headers @{'Cache-Control'='no-cache'}
} catch {
  throw "Could not resolve the immutable Hub commit after artifact upload. No manifest was activated. $($_.Exception.Message)"
}
$pinSha=([string]$pinState.sha).ToLowerInvariant()
Need ($pinSha -match '^[0-9a-f]{40,64}$') 'Hugging Face returned no valid immutable commit sha after artifact upload'
$pinnedArtifactPaths=@($publishFiles | ForEach-Object { "$otaRemotePrefix/$($_.path)" }) + "$otaRemotePrefix/artifacts.json"
if(-not $PatchFrom){
  $pinnedArtifactPaths += "${artifactStem}-mobile-install.apk"
  if($IncludeSourceArchive){ $pinnedArtifactPaths += "${artifactStem}-source.zip" }
}
# A newly created Hub commit can resolve immediately while paths-info is still
# serving the prior tree for that exact revision. That is eventual consistency,
# not permission to skip verification: retry only the immutable commit SHA, for
# a bounded interval, and keep failing closed if any advertised path remains
# absent. This caught the first v1.33.58 attempt before activation while the
# tree API converged a few seconds later.
$pinnedPathInfo=@{}
$missingPinnedPaths=@($pinnedArtifactPaths)
foreach($attempt in 1..6){
  $pinnedError=$null
  try {
    $pinnedPathInfo=Get-RemoteDatasetPathInfoMap @($pinnedArtifactPaths) $pinSha
    $missingPinnedPaths=@($pinnedArtifactPaths | Where-Object { -not $pinnedPathInfo.ContainsKey([string]$_) })
  } catch {
    $pinnedPathInfo=@{}
    $missingPinnedPaths=@($pinnedArtifactPaths)
    $pinnedError=[string]$_
  }
  if($missingPinnedPaths.Count -eq 0){ break }
  if($attempt -lt 6){
    $delay=[Math]::Pow(2,$attempt-1)
    Write-Host ("Pinned Hub tree is still converging (attempt $attempt/6; missing " +
      $missingPinnedPaths.Count + "). Retrying exact commit $pinSha in ${delay}s.") -ForegroundColor Yellow
    Start-Sleep -Seconds $delay
  }
}
Need ($missingPinnedPaths.Count -eq 0) ("Pinned Hub commit inventory did not converge; missing: " +
  ($missingPinnedPaths -join ', ') + $(if($pinnedError){"; last error: $pinnedError"}else{''}))
foreach($pf in $publishFiles){
  $path="$otaRemotePrefix/$($pf.path)"
  $remote=if($pinnedPathInfo.ContainsKey($path)){$pinnedPathInfo[$path]}else{$null}
  Need ((Get-FileImmutableDisposition $remote ([string]$pf.local) ([string]$pf.sha256) "pinned $path") -eq 'identical') "Pinned Hub commit is missing $path after upload"
}
$pinnedInventory=if($pinnedPathInfo.ContainsKey($inventoryRemotePath)){$pinnedPathInfo[$inventoryRemotePath]}else{$null}
Need ((Get-FileImmutableDisposition $pinnedInventory $otaIndexPath $inventorySha "pinned $inventoryRemotePath") -eq 'identical') 'Pinned Hub commit is missing or changed the OTA artifact inventory'
if(-not $PatchFrom){
  $pinnedApk=if($pinnedPathInfo.ContainsKey($apkRemotePath)){$pinnedPathInfo[$apkRemotePath]}else{$null}
  Need ((Get-FileImmutableDisposition $pinnedApk $apk $apkSha "pinned $apkRemotePath") -eq 'identical') 'Pinned Hub commit is missing or changed the Android installer'
  if($IncludeSourceArchive){
    $pinnedSource=if($pinnedPathInfo.ContainsKey($sourceRemotePath)){$pinnedPathInfo[$sourceRemotePath]}else{$null}
    Need ((Get-FileImmutableDisposition $pinnedSource $source $sourceSha "pinned $sourceRemotePath") -eq 'identical') 'Pinned Hub commit is missing or changed the source archive'
  }
}
$pinnedBase="https://huggingface.co/datasets/$Repo/resolve/$pinSha"
foreach($listName in @('files','full')){
  foreach($entry in @($manifest[$listName])){
    $url=[string]$entry.url
    if($url.StartsWith($otaBase+'/',[StringComparison]::OrdinalIgnoreCase)){
      $entry.url=$pinnedBase+$url.Substring($otaBase.Length)
    }
  }
}

# Verify the newly uploaded bytes through those exact pinned URLs before any
# historical, mirror or live manifest can name them. Prior full[] entries were
# already release-gated when their version was activated; files[] is this run's
# complete mutation boundary.
$verifyDir=Join-Path $Root ".tmp\publish-hf-release\verify-$Version"
if(Test-Path -LiteralPath $verifyDir){ Remove-Item -LiteralPath $verifyDir -Recurse -Force }
New-Item -ItemType Directory -Path $verifyDir -Force | Out-Null
try {
  $verifyIndex=0
  foreach($entry in @($manifest.files)){
    $verifyIndex++
    $remoteCopy=Join-Path $verifyDir (('{0:d3}.bin' -f $verifyIndex))
    Invoke-WebRequest -Uri ([string]$entry.url) -UseBasicParsing -TimeoutSec 300 -Headers @{'Cache-Control'='no-cache'} -OutFile $remoteCopy
    $remoteInfo=Get-Item -LiteralPath $remoteCopy
    Need ($remoteInfo.Length -eq [long]$entry.size) "Pinned remote size mismatch for $($entry.path): $($remoteInfo.Length) vs $($entry.size)"
    $remoteHash=(Get-FileHash -LiteralPath $remoteCopy -Algorithm SHA256).Hash.ToLowerInvariant()
    Need ($remoteHash -eq ([string]$entry.sha256).ToLowerInvariant()) "Pinned remote sha256 mismatch for $($entry.path)"
  }
} finally {
  if(Test-Path -LiteralPath $verifyDir){ Remove-Item -LiteralPath $verifyDir -Recurse -Force }
}
Write-Host ("Pinned and verified " + @($manifest.files).Count + " artifact(s) at Hub commit $pinSha") -ForegroundColor Green

# Exercise the exact resumable-delivery contract before activation. Probe the
# first and last advertised chunk of every adjacent and full-recovery artifact;
# this catches CDN/proxy configurations which return 200, hide Content-Range
# from browser JavaScript, transform bytes, or truncate the tail.
Assert-PinnedAdvertisedRanges $manifest
Write-Host 'Pinned Range delivery verified for every advertised payload.' -ForegroundColor Green

# HF redirects are acceptable as a checked immutable source for the mirror, not
# as the client activation transport. No live or historical manifest is changed
# by this publisher. Complete mirrored bytes/CORS/ranges gate activation later.
Run 'Recheck canonical workspace writer gate' { node tools/evidence-foundation/workspace-guard.mjs check-write }
$pinnedCandidate="releases/candidates/update-v$Version.pinned.json"
WriteReleaseManifest $pinnedCandidate $manifest
Write-Host "`nImmutable artifacts uploaded and verified for v$Version. NO MANIFEST ACTIVATED." -ForegroundColor Green
Write-Host "Pinned candidate: $pinnedCandidate"
Write-Host "Artifact namespace: $otaRemotePrefix"
if(-not $PatchFrom){ Write-Host "Installer: $pinnedBase/${artifactStem}-mobile-install.apk?download=true" }
Write-Host "Next: node tools/mirror-release-to-cloudflare.mjs --version $Version --manifest $pinnedCandidate --prepare-only --apply"
exit 0
