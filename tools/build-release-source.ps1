[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference='Stop'
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ReleaseRoot=[IO.Path]::GetFullPath((Join-Path $Root 'releases'))
$ManifestPath=Join-Path $Root 'update.json'
$Archive=Join-Path $ReleaseRoot "MASSFRONT-v$Version-source.zip"
$PartialArchive=Join-Path $ReleaseRoot "MASSFRONT-v$Version-source.partial-$PID.zip"
$TempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$Stage=[IO.Path]::GetFullPath((Join-Path $TempRoot "massfront-release-source-$Version-$PID"))

function Need($Condition,[string]$Message){ if(-not $Condition){ throw $Message } }
function Assert-ChildPath([string]$Path,[string]$Parent,[string]$Label){
  $parentFull=[IO.Path]::GetFullPath($Parent).TrimEnd('\')+'\'
  $pathFull=[IO.Path]::GetFullPath($Path)
  Need ($pathFull.StartsWith($parentFull,[StringComparison]::OrdinalIgnoreCase)) "$Label escaped its intended root: $pathFull"
}
function Get-RelativePath([string]$Base,[string]$Path){
  # Windows PowerShell 5.1 has no IO.Path.GetRelativePath. URI conversion is
  # reliable for spaces and Unicode when the base is explicitly a directory.
  $baseFull=[IO.Path]::GetFullPath($Base).TrimEnd('\')+'\'
  $pathFull=[IO.Path]::GetFullPath($Path)
  $baseUri=New-Object Uri($baseFull)
  $pathUri=New-Object Uri($pathFull)
  [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('/','\')
}
function Read-Utf8([string]$Path){ Get-Content -LiteralPath $Path -Raw -Encoding utf8 }
function Remove-EncodedPayloads([AllowEmptyString()][string]$Text){
  if([string]::IsNullOrEmpty($Text)){ return $Text }
  # Generated art is stored in source as data URIs. Random base64 can contain
  # strings that resemble provider-token prefixes, so scan the surrounding
  # program text while treating the encoded bytes as opaque binary content.
  $scrubbed=[regex]::Replace(
    $Text,
    '(?is)data:[a-z0-9.+/-]+(?:;[a-z0-9.+_-]+(?:=[^,;\s]+)?)*;base64,[a-z0-9+/_=\r\n-]{128,}',
    '<encoded-data-uri>'
  )
  # Some generated sheets store raw encoded chunks without a data: prefix.
  # Only replace very long, entirely encoding-shaped quoted values; ordinary
  # source strings remain visible to the token scan.
  $scrubbed=[regex]::Replace($scrubbed,'(?s)"[A-Za-z0-9+/_=-]{512,}"','"<encoded-literal>"')
  $scrubbed=[regex]::Replace($scrubbed,"(?s)'[A-Za-z0-9+/_=-]{512,}'","'<encoded-literal>'")
  $scrubbed=[regex]::Replace($scrubbed,'(?s)`[A-Za-z0-9+/_=-]{512,}`','`<encoded-literal>`')
  return $scrubbed
}
function Require-OneVersion([string]$Label,[string[]]$Values){
  Need ($Values.Count -gt 0) "$Label version was not found"
  $unique=@($Values | ForEach-Object { $_.Trim() } | Sort-Object -Unique)
  Need ($unique.Count -eq 1) "$Label contains conflicting versions: $($unique -join ', ')"
  Need ($unique[0] -eq $Version) "$Label version $($unique[0]) does not match $Version"
}

Assert-ChildPath $Archive $ReleaseRoot 'Source archive path'
Assert-ChildPath $PartialArchive $ReleaseRoot 'Partial archive path'
Assert-ChildPath $Stage $TempRoot 'Staging path'
Need (Test-Path -LiteralPath $ManifestPath -PathType Leaf) 'update.json is missing'

# A release source handoff is only valid after the payload upload has produced
# one immutable Hub commit and update.json has been rewritten to that commit.
# Building before then captured mutable resolve/main URLs in prior handoffs.
$manifestRaw=Read-Utf8 $ManifestPath
$manifest=$manifestRaw | ConvertFrom-Json
Need ([string]$manifest.version -eq $Version) "update.json version $($manifest.version) does not match $Version"
Need ($manifestRaw -notmatch '(?i)/resolve/main(?:/|\?|\"|$)') 'update.json still contains resolve/main; pin the release before building its source archive'
$manifestEntries=@(@($manifest.files)+@($manifest.full))
Need (@($manifest.files).Count -gt 0) 'update.json files[] is empty'
Need (@($manifest.full).Count -gt 0) 'update.json full[] is empty'
$commits=@()
foreach($entry in $manifestEntries){
  Need ($null -ne $entry) 'update.json contains a null files/full entry'
  $url=[string]$entry.url
  Need (-not [string]::IsNullOrWhiteSpace($url)) "update.json entry '$($entry.path)' has no URL"
  $match=[regex]::Match($url,'(?i)/resolve/([0-9a-f]{40})/')
  Need ($match.Success) "update.json URL for '$($entry.path)' is not pinned to a 40-character commit"
  $commits+=$match.Groups[1].Value.ToLowerInvariant()
}
$commits=@($commits | Sort-Object -Unique)
Need ($commits.Count -eq 1) "update.json files/full URLs must use one immutable commit; found $($commits.Count)"
$PinnedCommit=$commits[0]

# Check the independently consumed version authorities. Matching only
# package.json is insufficient: Web OTA, Android and iOS can otherwise ship
# different builds under the same release label.
$packageVersion=[string]((Read-Utf8 (Join-Path $Root 'package.json') | ConvertFrom-Json).version)
Require-OneVersion 'package.json' @($packageVersion)

$bootText=Read-Utf8 (Join-Path $Root 'boot.js')
$bootMatches=[regex]::Matches($bootText,'PACKAGED_REV\s*=\s*[''"](\d+\.\d+\.\d+)[''"]')
Require-OneVersion 'boot.js PACKAGED_REV' @($bootMatches | ForEach-Object { $_.Groups[1].Value })

$updaterText=Read-Utf8 (Join-Path $Root 'src/updater.js')
$updaterMatches=[regex]::Matches($updaterText,'APP_VERSION\s*=\s*[''"](\d+\.\d+\.\d+)[''"]')
Require-OneVersion 'src/updater.js APP_VERSION' @($updaterMatches | ForEach-Object { $_.Groups[1].Value })

$indexText=Read-Utf8 (Join-Path $Root 'index.html')
$escapedVersion=[regex]::Escape($Version)
$indexPattern='boot\.js\?v='+$escapedVersion+'(?:[-&''"]|$)'
Need ($indexText -match $indexPattern) "index.html does not load boot.js with v$Version"

$parts=@($Version.Split('.') | ForEach-Object { [int]$_ })
$expectedCode=($parts[0]*10000)+($parts[1]*100)+$parts[2]
$gradleText=Read-Utf8 (Join-Path $Root 'android/app/build.gradle')
$androidNames=[regex]::Matches($gradleText,'(?m)^\s*versionName\s+[\"'']([^\"'']+)[\"'']')
Require-OneVersion 'Android versionName' @($androidNames | ForEach-Object { $_.Groups[1].Value })
$androidCodes=[regex]::Matches($gradleText,'(?m)^\s*versionCode\s+(\d+)')
Need ($androidCodes.Count -eq 1) "Android must declare exactly one versionCode; found $($androidCodes.Count)"
Need ([int]$androidCodes[0].Groups[1].Value -eq $expectedCode) "Android versionCode $($androidCodes[0].Groups[1].Value) does not match expected $expectedCode"

$pbxText=Read-Utf8 (Join-Path $Root 'ios/App/App.xcodeproj/project.pbxproj')
$iosNames=[regex]::Matches($pbxText,'MARKETING_VERSION\s*=\s*([^;\s]+)\s*;')
Require-OneVersion 'iOS MARKETING_VERSION' @($iosNames | ForEach-Object { $_.Groups[1].Value.Trim('"') })
$iosCodes=[regex]::Matches($pbxText,'CURRENT_PROJECT_VERSION\s*=\s*([^;\s]+)\s*;')
Need ($iosCodes.Count -gt 0) 'iOS CURRENT_PROJECT_VERSION was not found'
$iosCodeValues=@($iosCodes | ForEach-Object { $_.Groups[1].Value.Trim('"') } | Sort-Object -Unique)
Need ($iosCodeValues.Count -eq 1) "iOS contains conflicting build numbers: $($iosCodeValues -join ', ')"
Need ([int]$iosCodeValues[0] -eq $expectedCode) "iOS build number $($iosCodeValues[0]) does not match expected $expectedCode"

$keep=@(
  'AGENTS.md','README.md','package.json','package-lock.json','index.html','boot.js',
  'capacitor.config.json','capacitor.config.ts','PUBLISH_HF_RELEASE.bat','update.json',
  '.github','assets','src','tools','android','ios','cloudflare','docs','design','audit'
)
$excludedSegments=@(
  '.git','node_modules','build','.gradle','.cache','cache','caches','.npm-cache',
  '.tmp','tmp','__pycache__','.pytest_cache','.kotlin','.cxx','DerivedData','Pods','coverage'
)
$secretExtensions=@('.keystore','.jks','.p12','.pfx','.pem','.key','.mobileprovision')

function Is-Excluded([string]$Relative,[IO.FileInfo]$File){
  $normalized=$Relative.Replace('/','\')
  if($normalized -match '(?i)^android\\app\\src\\main\\assets\\public(?:\\|$)'){ return $true }
  if($normalized -match '(?i)^ios\\App\\App\\public(?:\\|$)'){ return $true }
  foreach($segment in $normalized.Split('\')){
    if($excludedSegments -contains $segment){ return $true }
  }
  if($File.Extension -ieq '.apk'){ return $true }
  if($secretExtensions -contains $File.Extension.ToLowerInvariant()){ return $true }
  if($File.Name -match '(?i)^\.env(?:\.|$)|^\.dev\.vars$|secret|credentials'){ return $true }
  if(($File.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){ return $true }
  return $false
}
function Copy-CanonicalFile([IO.FileInfo]$File){
  $relative=Get-RelativePath $Root $File.FullName
  if(Is-Excluded $relative $File){ return }
  $destination=Join-Path $Stage $relative
  Assert-ChildPath $destination $Stage 'Staged file'
  $parent=Split-Path -Parent $destination
  if(-not (Test-Path -LiteralPath $parent)){ New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [IO.File]::Copy($File.FullName,$destination,$true)
}

try {
  if(Test-Path -LiteralPath $Stage){ Remove-Item -LiteralPath $Stage -Recurse -Force }
  if(Test-Path -LiteralPath $PartialArchive){ Remove-Item -LiteralPath $PartialArchive -Force }
  New-Item -ItemType Directory -Path $Stage -Force | Out-Null
  New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null

  foreach($name in $keep){
    $source=Join-Path $Root $name
    if(-not (Test-Path -LiteralPath $source)){ continue }
    $item=Get-Item -LiteralPath $source -Force
    if($item.PSIsContainer){
      Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object { Copy-CanonicalFile $_ }
    } else {
      Copy-CanonicalFile $item
    }
  }

  # Test evidence is useful in a collaborator handoff, but absence is not a
  # reason to block an otherwise valid source archive.
  $evidenceRelative="releases\MASSFRONT-v$Version-test-evidence.json"
  $evidenceSource=Join-Path $Root $evidenceRelative
  if(Test-Path -LiteralPath $evidenceSource -PathType Leaf){
    $evidenceDestination=Join-Path $Stage $evidenceRelative
    New-Item -ItemType Directory -Path (Split-Path -Parent $evidenceDestination) -Force | Out-Null
    [IO.File]::Copy($evidenceSource,$evidenceDestination,$true)
  }

  $stagedManifest=Join-Path $Stage 'update.json'
  Need (Test-Path -LiteralPath $stagedManifest -PathType Leaf) 'Pinned update.json was not staged'
  Need ((Get-FileHash -LiteralPath $stagedManifest -Algorithm SHA256).Hash -eq (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash) 'Staged update.json changed while the archive was being prepared'

  $textExtensions=@(
    '.js','.mjs','.cjs','.ts','.tsx','.json','.md','.html','.css','.xml','.gradle',
    '.toml','.yml','.yaml','.txt','.ps1','.psm1','.py','.java','.kt','.kts','.plist',
    '.properties','.config','.sh','.bat','.cmd'
  )
  $directSecretPatterns=@(
    [pscustomobject]@{ Label='private-key-header'; Regex='-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----' },
    [pscustomobject]@{
      Label='release-token-assignment'
      Regex='(?im)^\s*(?:(?:export\s+)?(?:HF_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|OPENAI_API_KEY)|\$env:(?:HF_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|OPENAI_API_KEY))\s*[:=]\s*.{20,}$'
    }
  )
  $secretPatterns=@(
    'hf_[A-Za-z0-9]{20,}',
    'sk-(?:live-)?[A-Za-z0-9_-]{20,}',
    'github_pat_[A-Za-z0-9_]{40,}',
    'gh[pousr]_[A-Za-z0-9]{30,}',
    'AIza[0-9A-Za-z_-]{30,}',
    'AKIA[0-9A-Z]{16}',
    'xox[baprs]-[A-Za-z0-9-]{20,}',
    '(?i)Bearer\s+[A-Za-z0-9._~+/=-]{20,}',
    '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    '(?i)(?:HF_TOKEN|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|OPENAI_API_KEY)\s*[:=]\s*[\"''][^\"'']{20,}[\"'']'
  )
  $secretLabels=@(
    'hugging-face-token','openai-or-stripe-token','github-fine-grained-token',
    'github-classic-token','google-api-key','aws-access-key','slack-token',
    'bearer-token','private-key-header','release-token-assignment'
  )
  Need ($secretLabels.Count -eq $secretPatterns.Count) 'Secret scan labels/patterns are out of sync'
  $secretHits=New-Object Collections.Generic.List[string]
  Get-ChildItem -LiteralPath $Stage -Recurse -File -Force | ForEach-Object {
    if($textExtensions -contains $_.Extension.ToLowerInvariant()){
      $content=Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
      $relative=Get-RelativePath $Stage $_.FullName
      $hit=$false
      # Key headers and release-token assignments are checked on the original
      # text so payload scrubbing can never conceal them.
      foreach($pattern in $directSecretPatterns){
        if($content -match $pattern.Regex){
          $secretHits.Add("$relative [$($pattern.Label)]")
          $hit=$true
          break
        }
      }
      if(-not $hit){
        $sourceText=Remove-EncodedPayloads $content
        for($patternIndex=0;$patternIndex -lt $secretPatterns.Count;$patternIndex++){
          if($sourceText -match $secretPatterns[$patternIndex]){
            # State which rule fired without ever echoing the matched value.
            $secretHits.Add("$relative [$($secretLabels[$patternIndex])]")
            break
          }
        }
      }
    }
  }
  Need ($secretHits.Count -eq 0) "Possible secrets found in source staging:`n$($secretHits -join "`n")"

  $archiveItems=@(Get-ChildItem -LiteralPath $Stage -Force)
  Need ($archiveItems.Count -gt 0) 'Source archive staging is empty'
  Compress-Archive -Path $archiveItems.FullName -DestinationPath $PartialArchive -CompressionLevel Optimal
  Need (Test-Path -LiteralPath $PartialArchive -PathType Leaf) 'Source archive was not created'
  Need ((Get-Item -LiteralPath $PartialArchive).Length -gt 1MB) 'Source archive is implausibly small (must exceed 1 MiB)'

  # Keep an existing release archive intact until the replacement has fully
  # passed validation. Move-Item makes the final replacement a single step.
  Move-Item -LiteralPath $PartialArchive -Destination $Archive -Force
  $archiveItem=Get-Item -LiteralPath $Archive
  $sha=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{
    Version=$Version
    PinnedCommit=$PinnedCommit
    Archive=$Archive
    Bytes=$archiveItem.Length
    Sha256=$sha
    Files=(Get-ChildItem -LiteralPath $Stage -Recurse -File -Force | Measure-Object).Count
  } | Format-List
}
finally {
  if(Test-Path -LiteralPath $PartialArchive){ Remove-Item -LiteralPath $PartialArchive -Force }
  if(Test-Path -LiteralPath $Stage){
    Assert-ChildPath $Stage $TempRoot 'Staging cleanup path'
    Remove-Item -LiteralPath $Stage -Recurse -Force
  }
}
