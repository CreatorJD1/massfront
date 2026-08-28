param(
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Output,
  [Parameter(Mandatory=$true)][string]$BuildTools,
  [Parameter(Mandatory=$true)][string]$JavaHome
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$src = (Resolve-Path $Source).Path
$out = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Output))
$bt = (Resolve-Path $BuildTools).Path
$java = (Resolve-Path $JavaHome).Path
$env:JAVA_HOME = $java

if(-not $src.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase)){
  throw "Source must stay inside the MASSFRONT workspace: $src"
}
if(-not $out.StartsWith($root,[System.StringComparison]::OrdinalIgnoreCase)){
  throw "Output must stay inside the MASSFRONT workspace: $out"
}

$temp = Join-Path $root ('.tmp\apk-shrink-' + $PID)
$expanded = Join-Path $temp 'expanded'
$repacked = Join-Path $temp 'repacked.zip'
$aligned = Join-Path $temp 'aligned.apk'
$jar = Join-Path $java 'bin\jar.exe'
$zipalign = Join-Path $bt 'zipalign.exe'
$signer = Join-Path $bt 'apksigner.bat'
$key = Join-Path $env:USERPROFILE '.android\debug.keystore'

foreach($required in @($jar,$zipalign,$signer,$key)){
  if(-not (Test-Path -LiteralPath $required)){ throw "Required APK tool missing: $required" }
}

New-Item -ItemType Directory -Force (Split-Path -Parent $out) | Out-Null
New-Item -ItemType Directory -Force $expanded | Out-Null
try{
  [System.IO.Compression.ZipFile]::ExtractToDirectory($src,$expanded)
  $meta = Join-Path $expanded 'META-INF'
  if(Test-Path -LiteralPath $meta){ Remove-Item -LiteralPath $meta -Recurse -Force }

  & $jar --create --file $repacked --no-manifest -C $expanded .
  if($LASTEXITCODE -ne 0){ throw "jar repack failed ($LASTEXITCODE)" }
  $arsc = Join-Path $expanded 'resources.arsc'
  if(Test-Path -LiteralPath $arsc){
    & $jar --update --file $repacked --no-compress -C $expanded resources.arsc
    if($LASTEXITCODE -ne 0){ throw "resources.arsc store pass failed ($LASTEXITCODE)" }
  }

  # Android 15+ devices may use 16 KiB memory pages. Align every uncompressed
  # native library to that boundary while retaining the normal 4-byte ZIP
  # entry alignment for all other payloads.
  & $zipalign -f -P 16 4 $repacked $aligned
  if($LASTEXITCODE -ne 0){ throw "zipalign failed ($LASTEXITCODE)" }
  & $signer sign --ks $key --ks-pass pass:android --key-pass pass:android `
    --ks-key-alias androiddebugkey --out $out $aligned
  if($LASTEXITCODE -ne 0){ throw "APK signing failed ($LASTEXITCODE)" }
  & $signer verify --verbose $out
  if($LASTEXITCODE -ne 0){ throw "APK signature verification failed ($LASTEXITCODE)" }
  & $zipalign -c -P 16 4 $out
  if($LASTEXITCODE -ne 0){ throw "APK alignment verification failed ($LASTEXITCODE)" }
  Get-Item -LiteralPath $out | Select-Object FullName,Length,LastWriteTime
} finally {
  if(Test-Path -LiteralPath $temp){ Remove-Item -LiteralPath $temp -Recurse -Force }
}
