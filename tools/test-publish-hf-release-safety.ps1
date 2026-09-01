$ErrorActionPreference='Stop'

$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$publisher=Join-Path $root 'tools/publish-hf-release.ps1'
$tokens=$null
$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($publisher,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){
  throw ('Publisher parse failed: ' + (($parseErrors | ForEach-Object Message) -join '; '))
}

function Need($condition,$message){ if(-not $condition){ throw $message } }
foreach($name in @('Get-StringSha256','Copy-ReleaseChunks','New-ManifestFileEntry',
                   'Get-ReleasePayloadFingerprint','Get-ReleaseRuntimeFingerprint',
                   'Test-ReleasePayloadMatch','New-DeltaPayloadPlan',
                   'Get-RemoteDatasetPathInfoMap','Get-ImmutableArtifactDisposition')){
  $definition=$ast.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
  },$true)
  Need ($null -ne $definition) "Publisher is missing $name"
  Invoke-Expression $definition.Extent.Text
}

# Regression for the PowerShell 5.1/7 Invoke-RestMethod array shape that made a
# valid five-path Hub response look like one space-joined, missing path during
# the first v1.33.58 activation attempt.
$Repo='example/release-test'
$script:mockPathInfo=@()
function Invoke-RestMethod { return $script:mockPathInfo }
$script:mockPathInfo=@(
  [pscustomobject]@{path='v2/a.js';size=10;oid=('a' * 40)},
  [pscustomobject]@{path='v2/b.js';size=20;oid=('b' * 40)}
)
$pathMap=Get-RemoteDatasetPathInfoMap @('v2/a.js','v2/b.js') 'immutable-sha'
Need ($pathMap.Count -eq 2 -and $pathMap.ContainsKey('v2/a.js') -and $pathMap.ContainsKey('v2/b.js')) 'Multi-entry paths-info response was nested or mis-keyed'
$script:mockPathInfo=[pscustomobject]@{path='v2/a.js';size=10;oid=('a' * 40)}
$singlePathMap=Get-RemoteDatasetPathInfoMap @('v2/a.js') 'immutable-sha'
Need ($singlePathMap.Count -eq 1 -and $singlePathMap.ContainsKey('v2/a.js')) 'Single-entry paths-info response was not mapped exactly'
$script:mockPathInfo=[pscustomobject]@{path='v2/unrequested.js';size=1;oid=('c' * 40)}
$unexpectedFailedClosed=$false
try { $null=Get-RemoteDatasetPathInfoMap @('v2/a.js') 'immutable-sha' } catch { $unexpectedFailedClosed=$true }
Need $unexpectedFailedClosed 'Unexpected paths-info response did not fail closed'

$hashA=('a' * 64) -join ''
$hashB=('b' * 64) -join ''
$hashC=('c' * 64) -join ''
$candidate=[pscustomobject]@{ files=@(
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA },
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB }
) }
$sameDifferentOrder=[pscustomobject]@{ files=@(
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB },
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA }
) }
$differentHash=[pscustomobject]@{ files=@(
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashC },
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB }
) }
$missingPath=[pscustomobject]@{ files=@(
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA }
) }
$chunkedCandidate=[pscustomobject]@{ files=@(
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA; chunks=@(
    [pscustomobject]@{ offset=0; size=10; sha256=$hashA }
  ) },
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB }
) }

Need (-not (Test-ReleasePayloadMatch $candidate $sameDifferentOrder)) 'Executable payload order drift must be refused'
Need (-not (Test-ReleasePayloadMatch $candidate $differentHash)) 'A differing same-version hash must be refused'
Need (-not (Test-ReleasePayloadMatch $candidate $missingPath)) 'A missing same-version path must be refused'
Need (-not (Test-ReleasePayloadMatch $candidate $chunkedCandidate)) 'Same-version chunk contract drift must be refused'
Need ((Get-ReleaseRuntimeFingerprint @($candidate.files)) -cne
      (Get-ReleaseRuntimeFingerprint @($sameDifferentOrder.files))) 'Runtime root input must bind executable order'
$deltaCandidateMatch=[pscustomobject]@{ files=@($candidate.files[1]); full=@($candidate.files) }
$deltaRemoteMatch=[pscustomobject]@{ files=@($candidate.files[1]); full=@($candidate.files) }
$deltaRemoteStaleFull=[pscustomobject]@{ files=@($candidate.files[1]); full=@($differentHash.files) }
Need (Test-ReleasePayloadMatch $deltaCandidateMatch $deltaRemoteMatch) 'Identical delta files[] and full[] must match'
Need (-not (Test-ReleasePayloadMatch $deltaCandidateMatch $deltaRemoteStaleFull)) 'A stale same-version delta full[] must be refused even when files[] matches'

$remoteLfsSame=[pscustomobject]@{ size=10; lfs=[pscustomobject]@{ size=10; oid="sha256:$hashA" } }
$remoteGitSame=[pscustomobject]@{ size=10; oid=('d' * 40) }
Need ((Get-ImmutableArtifactDisposition $null 10 $hashA ('d' * 40) 'missing.bin') -eq 'missing') 'An absent immutable path must remain uploadable'
Need ((Get-ImmutableArtifactDisposition $remoteLfsSame 10 $hashA '' 'same-lfs.bin') -eq 'identical') 'A matching LFS SHA-256 path was not independently resumable'
Need ((Get-ImmutableArtifactDisposition $remoteGitSame 10 $hashA ('d' * 40) 'same-git.bin') -eq 'identical') 'A matching Git object path was not independently resumable'
foreach($case in @(
  [pscustomobject]@{ remote=[pscustomobject]@{ size=11; lfs=[pscustomobject]@{ size=11; oid="sha256:$hashA" } }; sha=$hashA; git=''; why='size' },
  [pscustomobject]@{ remote=[pscustomobject]@{ size=10; lfs=[pscustomobject]@{ size=10; oid="sha256:$hashB" } }; sha=$hashA; git=''; why='sha256' },
  [pscustomobject]@{ remote=[pscustomobject]@{ size=10; oid=('e' * 40) }; sha=$hashA; git=('d' * 40); why='git oid' },
  [pscustomobject]@{ remote=[pscustomobject]@{ size=10; oid='unknown' }; sha=$hashA; git=''; why='unproven identity' }
)){
  $failedClosed=$false
  try { $null=Get-ImmutableArtifactDisposition $case.remote 10 $case.sha $case.git "$($case.why).bin" }
  catch { $failedClosed=([string]$_ -match 'require-new-version') }
  Need $failedClosed "A same-version $($case.why) mismatch did not require a new version"
}

$priorFull=[pscustomobject]@{ full=@(
  # Schema-2 base: neither unchanged artifact carries a range table.
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA; url='https://immutable.example/v1/src/a.js' },
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB; url='https://immutable.example/v1/src/b.js' }
); files=@(
  # A prior delta may expose only changed bytes in files[]. full[] remains the
  # authoritative complete installed target and must win for the next overlay.
  [pscustomobject]@{ path='src/b.js'; size=20; sha256=$hashB; url='https://immutable.example/v1/src/b.js' }
) }
$currentFull=@(
  [pscustomobject]@{ path='src/a.js'; size=10; sha256=$hashA; url='https://immutable.example/v2/src/a.js'; local='stage/src/a.js'; chunks=@(
    [pscustomobject]@{ offset=0; size=10; sha256=$hashA }
  ) },
  [pscustomobject]@{ path='src/b.js'; size=21; sha256=$hashC; url='https://immutable.example/v2/src/b.js'; local='stage/src/b.js'; chunks=@(
    [pscustomobject]@{ offset=0; size=21; sha256=$hashC }
  ) }
)
$delta=New-DeltaPayloadPlan $currentFull $priorFull
Need (@($delta.files).Count -eq 1) 'Delta files[] must contain changed bytes only'
Need ([string]$delta.files[0].path -eq 'src/b.js') 'Delta files[] selected the wrong changed path'
Need (@($delta.full).Count -eq 2) 'Delta full[] must remain a complete target inventory'
$deltaBy=@{}; foreach($entry in @($delta.full)){ $deltaBy[[string]$entry.path]=$entry }
Need ([string]$deltaBy['src/a.js'].url -eq 'https://immutable.example/v1/src/a.js') 'Unchanged full[] paths must retain the prior immutable URL'
Need (@($deltaBy['src/a.js'].chunks).Count -eq 1) 'Schema-2 unchanged full[] path did not inherit the current verified chunk table'
Need ([string]$deltaBy['src/b.js'].url -eq 'https://immutable.example/v2/src/b.js') 'Changed full[] paths must use the new immutable URL'
Need ([string]$deltaBy['src/b.js'].sha256 -eq $hashC) 'Changed full[] paths must describe the new bytes'
$removedFailedClosed=$false
try { $null=New-DeltaPayloadPlan @($currentFull[0]) $priorFull } catch { $removedFailedClosed=$true }
Need $removedFailedClosed 'A delta that removes a payload path must fail closed'
$reorderedFailedClosed=$false
try { $null=New-DeltaPayloadPlan @($currentFull[1],$currentFull[0]) $priorFull } catch { $reorderedFailedClosed=$true }
Need $reorderedFailedClosed 'A delta that changes executable order must fail closed'

$text=Get-Content -LiteralPath $publisher -Raw -Encoding utf8
function Find-PatchGateContaining([string]$needle){
  return $ast.Find({
    param($node)
    if($node -isnot [Management.Automation.Language.IfStatementAst] -or $node.Clauses.Count -eq 0){ return $false }
    $condition=$node.Clauses[0].Item1.Extent.Text.Replace('(','').Replace(')','').Trim()
    return $condition -eq '$PatchFrom' -and $node.Extent.Text.Contains($needle)
  },$true)
}
$plainAssignment=$ast.Find({
  param($node)
  $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -eq '$plain'
},$true)
Need ($plainAssignment.Right.Extent.Text.Contains("'sw.js'")) 'sw.js is missing from the explicit version bump list'
Need (-not ($text -match '(?i)\bios\b')) 'Retired iOS release logic remains in the publisher'
Need ($text.Contains("Run-CapacitorSyncFailClosed 'Android'")) 'Full-release Android wrapper sync is missing'
Need ($text.Contains("-match '\[fatal\]'")) 'Capacitor wrapper sync does not fail closed on fatal output with a zero exit code'
Need ($text.Contains('failed closed after two attempts')) 'Capacitor wrapper sync retry/failure gate is missing'
Need ($text.Contains('require-new-version: remote')) 'Same-version mismatch does not emit the required explicit failure'
Need ($text.Contains('api/datasets/$Repo/paths-info/$encodedRevision')) 'Authoritative per-path Hub identity endpoint is missing'
Need ($text.Contains('$remotePathInfo=Get-RemoteDatasetPathInfoMap')) 'Immutable artifact classes are not inventoried independently before upload'
Need ($text.Contains('$otaFilesToUpload')) 'OTA resume state is not tracked independently'
Need ($text.Contains('$apkUploadNeeded')) 'APK resume state is not tracked independently'
Need ($text.Contains('$sourceUploadNeeded')) 'Source resume state is not tracked independently'
Need (-not $text.Contains('$skipImmutableReuploads')) 'Unsafe manifest-wide immutable upload skip remains in the publisher'
Need ($text.Contains('.codex-remote-attachments .migration-evidence .wrangler logs audit')) '.migration-evidence/.wrangler are missing from recursive source-copy exclusions'
Need ($text.Contains("`$_.Name -in @('.migration-evidence','.wrangler')")) 'Post-stage sensitive-state assertion is missing'
Need ($text.Contains('refusing to package database/session/trace data')) 'Post-stage sensitive-state failure is missing'
Need ($text.Contains("'index.html','boot.js','sw.js'")) 'sw.js is missing from the source-archive allowlist'
Need ($text.Contains("Source archive staging omitted sw.js")) 'Source-archive sw.js fail-closed assertion is missing'

$syncGate=Find-PatchGateContaining "Run-CapacitorSyncFailClosed 'Android'"
Need ($null -ne $syncGate) 'PatchFrom does not gate Android wrapper sync'
Need (-not $syncGate.Clauses[0].Item2.Extent.Text.Contains('Run-CapacitorSyncFailClosed')) 'PatchFrom still performs Android wrapper sync'
$androidBuildGate=Find-PatchGateContaining "Build Android APK (offline)"
Need ($null -ne $androidBuildGate) 'PatchFrom does not gate the Android toolchain/APK build'
Need (-not $androidBuildGate.Clauses[0].Item2.Extent.Text.Contains('Build Android APK')) 'PatchFrom still builds an Android APK'
Need ($androidBuildGate.ElseClause.Extent.Text.Contains('Build Android APK (offline)')) 'Full releases lost the Android APK build'
Need ($text.Contains('if(-not $PatchFrom){ Need (Test-Path $apk)')) 'PatchFrom still requires a version-matched APK on disk'

$sourceStageGate=Find-PatchGateContaining '$stage=Join-Path $Root ".tmp\publish-hf-release\source-$Version"'
Need ($null -ne $sourceStageGate) 'PatchFrom does not gate source archive staging'
Need (-not $sourceStageGate.Clauses[0].Item2.Extent.Text.Contains('robocopy')) 'PatchFrom still stages collaborator source'
Need ($sourceStageGate.Clauses.Count -ge 2 -and $sourceStageGate.Clauses[1].Item1.Extent.Text.Contains('IncludeSourceArchive')) 'Full player releases still build a massive source archive without an explicit opt-in'
$sourceUploadGate=Find-PatchGateContaining "Publish source archive"
Need ($null -ne $sourceUploadGate) 'PatchFrom does not gate the source archive upload'
Need (-not $sourceUploadGate.Clauses[0].Item2.Extent.Text.Contains('& $Hf upload')) 'PatchFrom still uploads a source archive'
Need ($sourceUploadGate.Clauses.Count -ge 2 -and $sourceUploadGate.Clauses[1].Item1.Extent.Text.Contains('IncludeSourceArchive')) 'Source upload is not protected by the explicit opt-in channel'
Need (-not $text.Contains("Run 'Publish Galactic exploration pack'")) 'Player publisher still writes the old mutable exploration pack'

$manifestReady=$text.IndexOf('$manifest.full=')
$remoteGuard=$text.IndexOf('$remotePathInfo=Get-RemoteDatasetPathInfoMap')
$uploadBoundary=$text.IndexOf('$env:HF_HUB_DISABLE_XET=''1''')
Need ($manifestReady -ge 0 -and $remoteGuard -gt $manifestReady) 'Remote guard must run after the candidate manifest is complete'
Need ($uploadBoundary -gt $remoteGuard) 'Remote guard must run before the first upload section'
Need ($text.Contains('foreach($pf in $otaFilesToUpload)')) 'Delta resume does not upload only independently missing OTA artifacts'
Need ($text.Contains('elseif(-not $apkUploadNeeded)')) 'APK upload does not honor only its independently verified state'
Need ($text.Contains('elseif(-not $sourceUploadNeeded)')) 'Source upload does not honor only its independently verified state'

$deltaArtifactUpload=$text.IndexOf('Run "Publish artifact ($rel)"')
$deltaInventoryUpload=$text.IndexOf("Run 'Publish delta artifact inventory'")
$pinStep=$text.IndexOf('$pinState=Invoke-RestMethod')
$pinnedClassVerify=$text.IndexOf('$pinnedPathInfo=Get-RemoteDatasetPathInfoMap')
$pinnedVerify=$text.IndexOf('Pinned remote sha256 mismatch')
$rangeVerify=$text.IndexOf('Assert-PinnedAdvertisedRanges $manifest')
$finalManifestWrite=$text.LastIndexOf("WriteReleaseManifest 'update.json'")
$historicalUpload=$text.IndexOf("Run 'Publish historical manifest'")
$mirrorUpload=$text.IndexOf("Run 'Publish release manifest mirror'")
$liveUpload=$text.IndexOf("Run 'Activate live updater last'")
Need ($deltaArtifactUpload -ge 0 -and $deltaInventoryUpload -gt $deltaArtifactUpload) 'Delta inventory is not committed after its changed immutable artifacts'
Need ($pinnedClassVerify -gt $pinStep -and $pinnedClassVerify -lt $pinnedVerify) 'OTA/APK/source classes are not independently proven at the pinned commit'
Need ($pinStep -gt $deltaInventoryUpload -and $pinnedVerify -gt $pinStep) 'Uploaded artifacts are not commit-pinned and hash-verified before activation'
Need ($rangeVerify -gt $pinnedVerify -and $finalManifestWrite -gt $rangeVerify) 'First/last pinned Range verification does not gate final manifest writes'
Need ($finalManifestWrite -gt $pinnedVerify -and $historicalUpload -gt $finalManifestWrite) 'Final manifests are not rewritten after pinned remote verification'
Need ($historicalUpload -gt $deltaInventoryUpload -and $mirrorUpload -gt $historicalUpload -and $liveUpload -gt $mirrorUpload) 'Immutable-first/manifests-last ordering was lost'
Need ($text.LastIndexOf('& $Hf upload') -ge $liveUpload) 'Live activation is not the final Hugging Face upload'

Need (-not $text.Contains('?pin_guard=')) 'Hub dataset HEAD lookup must not append an unsupported pin_guard query parameter'

Need ($text.Contains("[Alias('Kind')]")) 'Legacy -Kind publisher calls no longer bind to -Category'
Need ($text.Contains("[ValidateSet('system','hotfix','content','overhaul')]")) 'Publisher category set is incomplete'
Need ($text.Contains('if($Category){ $manifest.category=$Category }')) 'Publisher does not emit a separate player-facing category'
Need ($text.Contains('$manifest.payloadRoot=Get-StringSha256')) 'Publisher does not emit a deterministic payload root'
Need ($text.Contains('$manifest.fullRoot=Get-StringSha256')) 'Publisher does not emit a deterministic full-recovery root'
Need ($text.Contains('$manifest.runtimeRoot=Get-StringSha256')) 'Publisher does not emit an ordered runtime root'
Need ($text.Contains('$manifest.manifestRoot=Get-StringSha256')) 'Publisher does not bind release identity to a manifest root'
Need ($text.Contains("`$manifest.kind='full'")) 'Full delivery kind is not explicit'
Need ($text.Contains('$manifest.kind="patch"')) 'Patch transport kind is missing'
Need (-not $text.Contains('$manifest.kind=$Category')) 'Player category still overwrites transport kind'
Need ($text.Contains('-Extra cannot be placed in executable files[] safely')) 'Untyped extras can still enter executable files[]'
Need ($text.Contains("`$env:MASSFRONT_INCLUDE_EXPLORATION='0'")) 'Patch publisher still stages the monolithic Galactic pack locally'
Need (-not $text.Contains("`$env:MASSFRONT_INCLUDE_EXPLORATION='1'")) 'Full publisher still forces the optional Galactic pack into base www/APK'
Need ($text.Contains('Base www unexpectedly contains the optional Galactic pack')) 'Base package does not fail closed when optional exploration leaks into www'
Need ($text.Contains('[switch]$IncludeSourceArchive')) 'Massive source archive channel is not explicitly opt-in'
Need ($text.Contains("elseif(-not `$IncludeSourceArchive)")) 'Default player release does not explicitly skip source staging/upload'
Need ($text.Contains('HTTP $([int]$response.StatusCode), expected 206')) 'Range gate does not require HTTP 206'
Need ($text.Contains('Add-Type -AssemblyName System.Net.Http')) 'PowerShell 5.1 cannot load the streaming Range verifier HTTP types'
Need ($text.Contains("returned Content-Range '")) 'Range gate does not require exact Content-Range'
Need ($text.Contains('does not expose Content-Range to the browser updater')) 'Range gate does not verify browser-readable Content-Range semantics'
Need ($text.Contains('failed chunk SHA-256')) 'Range gate does not verify advertised chunk hashes'
Need ($text.Contains("TryAddWithoutValidation('Origin',`$probeOrigin)")) 'Range gate does not send a representative browser Origin'
Need ($text.Contains("`$allowOrigin -eq '*' -or `$allowOrigin -ceq `$probeOrigin")) 'Range gate does not accept wildcard or exact echoed browser origin'
Need (-not $text.Contains('$response=@(Invoke-RestMethod')) 'paths-info still wraps Invoke-RestMethod in a nested Object[]'

Write-Host '{"status":"PASS","test":"publish-hf-release-safety","network":false,"differingSameVersion":"refused","independentArtifactResume":true,"deltaFullOverlay":true,"transportCategorySeparated":true,"systemCategory":true,"hotfixApkBuild":false,"sourceArchiveOptIn":true,"baseExplorationExcluded":true,"immutableFirst":true,"pinnedRemoteVerified":true,"firstLastRangeGate":true,"manifestsLast":true,"swVersionBump":true,"retiredIosReleaseLogic":false,"androidFullSyncFailClosed":true}' -ForegroundColor Green
