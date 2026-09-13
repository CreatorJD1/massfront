param(
  [switch]$ConfirmProduction,
  [string]$BaseUrl = 'https://massfront-auth.jasondixon1994.workers.dev',
  [string]$Database = 'massfront-accounts'
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmProduction) {
  throw 'Production test refused. Re-run with -ConfirmProduction.'
}

$mfLiveNpx = 'C:\Program Files\nodejs\npx.cmd'
$mfLiveAuthDir = Join-Path $PSScriptRoot '..\cloudflare\massfront-auth'
$mfLiveStamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$mfLiveSuffix = $mfLiveStamp.Substring([Math]::Max(0, $mfLiveStamp.Length - 10))
$mfLiveEmailA = "mfqa.$mfLiveSuffix.a@example.invalid"
$mfLiveEmailB = "mfqa.$mfLiveSuffix.b@example.invalid"
$mfLiveUserA = "qaA_$mfLiveSuffix"
$mfLiveUserB = "qaB_$mfLiveSuffix"
$mfLivePassword = ([guid]::NewGuid().ToString('N') + '!Mf9')
$mfLiveTokenA = $null
$mfLiveTokenB = $null
$mfLiveIdA = 0
$mfLiveIdB = 0
$mfLivePass = 0
$mfLiveFail = 0

function Write-MfCheck([string]$Name, [bool]$Ok, [string]$Detail = '') {
  if ($Ok) { $script:mfLivePass++; Write-Host "PASS $Name  $Detail" }
  else { $script:mfLiveFail++; Write-Host "FAIL $Name  $Detail" -ForegroundColor Red }
}

function Invoke-MfApi(
  [string]$Method,
  [string]$Path,
  [string]$Token = '',
  $Body = $null
) {
  $mfLiveHeaders = @{}
  if ($Token) { $mfLiveHeaders.Authorization = "Bearer $Token" }
  $mfLiveArgs = @{
    Uri = ($BaseUrl.TrimEnd('/') + $Path)
    Method = $Method
    Headers = $mfLiveHeaders
    TimeoutSec = 20
    SkipHttpErrorCheck = $true
  }
  if ($null -ne $Body) {
    $mfLiveArgs.ContentType = 'application/json'
    $mfLiveArgs.Body = ($Body | ConvertTo-Json -Compress -Depth 8)
  }
  $mfLiveResponse = Invoke-WebRequest @mfLiveArgs
  $mfLiveJson = $null
  if ($mfLiveResponse.Content) {
    try { $mfLiveJson = $mfLiveResponse.Content | ConvertFrom-Json }
    catch { $mfLiveJson = $mfLiveResponse.Content }
  }
  [pscustomobject]@{
    Status = [int]$mfLiveResponse.StatusCode
    Json = $mfLiveJson
    Duration = $mfLiveResponse.Headers.'server-timing'
  }
}

function Invoke-MfD1([string]$Sql) {
  Push-Location $mfLiveAuthDir
  try {
    $mfLiveOut = & $mfLiveNpx --yes wrangler d1 execute $Database --remote --command $Sql --json
    if ($LASTEXITCODE -ne 0) { throw "wrangler D1 command failed ($LASTEXITCODE)" }
    return ($mfLiveOut | Out-String | ConvertFrom-Json)
  } finally {
    Pop-Location
  }
}

function Get-MfD1Rows($Result) {
  $mfLiveRows = @()
  foreach ($mfLiveStatement in @($Result)) {
    if ($mfLiveStatement.success -and $mfLiveStatement.results) {
      $mfLiveRows += @($mfLiveStatement.results)
    }
  }
  return $mfLiveRows
}

try {
  $mfLiveHealth = Invoke-MfApi GET '/health'
  Write-MfCheck 'production health' ($mfLiveHealth.Status -eq 200 -and $mfLiveHealth.Json.status -eq 'ok') "HTTP $($mfLiveHealth.Status)"

  $mfLiveRegA = Invoke-MfApi POST '/register' '' @{
    email = $mfLiveEmailA; password = $mfLivePassword; username = $mfLiveUserA; ageOk = $true
  }
  $mfLiveRegB = Invoke-MfApi POST '/register' '' @{
    email = $mfLiveEmailB; password = $mfLivePassword; username = $mfLiveUserB; ageOk = $true
  }
  $mfLiveTokenA = [string]$mfLiveRegA.Json.token
  $mfLiveTokenB = [string]$mfLiveRegB.Json.token
  Write-MfCheck 'isolated account A registered' ($mfLiveRegA.Status -eq 201 -and $mfLiveTokenA.Length -ge 64) "HTTP $($mfLiveRegA.Status)"
  Write-MfCheck 'isolated account B registered' ($mfLiveRegB.Status -eq 201 -and $mfLiveTokenB.Length -ge 64) "HTTP $($mfLiveRegB.Status)"
  if (-not $mfLiveTokenA -or -not $mfLiveTokenB) { throw 'Registration did not return both QA tokens.' }

  # Production intentionally never echoes a verification code. Directly mark
  # only these generated QA accounts verified so public social routes can be
  # exercised without weakening the verification gate for any real account.
  $mfLiveNow = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $mfLiveVerifySql = "UPDATE users SET verified_at=$mfLiveNow WHERE email IN ('$mfLiveEmailA','$mfLiveEmailB'); SELECT id,email,verified_at FROM users WHERE email IN ('$mfLiveEmailA','$mfLiveEmailB') ORDER BY email"
  $mfLiveVerified = Get-MfD1Rows (Invoke-MfD1 $mfLiveVerifySql)
  foreach ($mfLiveRow in $mfLiveVerified) {
    if ($mfLiveRow.email -eq $mfLiveEmailA) { $mfLiveIdA = [int]$mfLiveRow.id }
    if ($mfLiveRow.email -eq $mfLiveEmailB) { $mfLiveIdB = [int]$mfLiveRow.id }
  }
  Write-MfCheck 'only QA accounts marked verified' ($mfLiveIdA -gt 0 -and $mfLiveIdB -gt 0 -and $mfLiveVerified.Count -eq 2) "ids $mfLiveIdA,$mfLiveIdB"

  $mfLiveMeA = Invoke-MfApi GET '/me' $mfLiveTokenA
  $mfLiveMeB = Invoke-MfApi GET '/me' $mfLiveTokenB
  Write-MfCheck 'authenticated identity A' ($mfLiveMeA.Status -eq 200 -and $mfLiveMeA.Json.user.username -eq $mfLiveUserA)
  Write-MfCheck 'authenticated identity B' ($mfLiveMeB.Status -eq 200 -and $mfLiveMeB.Json.user.username -eq $mfLiveUserB)

  $mfLivePayload = "mf-live-qa-$mfLiveSuffix"
  $mfLiveSavePut = Invoke-MfApi PUT '/save' $mfLiveTokenA @{ payload = $mfLivePayload }
  $mfLiveSaveGet = Invoke-MfApi GET '/save' $mfLiveTokenA
  Write-MfCheck 'cloud save round trip' ($mfLiveSavePut.Status -eq 200 -and $mfLiveSaveGet.Status -eq 200 -and $mfLiveSaveGet.Json.payload -eq $mfLivePayload)

  $mfLiveRequest = Invoke-MfApi POST '/social/friend/request' $mfLiveTokenA @{ username = $mfLiveUserB }
  $mfLiveInbox = Invoke-MfApi GET '/social/requests' $mfLiveTokenB
  $mfLiveRequestId = [int]$mfLiveRequest.Json.id
  $mfLiveInboxMatch = @($mfLiveInbox.Json.requests | Where-Object { [int]$_.id -eq $mfLiveRequestId -and $_.username -eq $mfLiveUserA })
  Write-MfCheck 'friend request reaches recipient' ($mfLiveRequest.Status -eq 201 -and $mfLiveInbox.Status -eq 200 -and $mfLiveInboxMatch.Count -eq 1) "id $mfLiveRequestId"

  $mfLiveAccept = Invoke-MfApi POST '/social/friend/respond' $mfLiveTokenB @{ id = $mfLiveRequestId; accept = $true }
  $mfLiveFriendsA = Invoke-MfApi GET '/social/friends' $mfLiveTokenA
  $mfLiveFriendsB = Invoke-MfApi GET '/social/friends' $mfLiveTokenB
  $mfLiveAHasB = @($mfLiveFriendsA.Json.friends | Where-Object { $_.username -eq $mfLiveUserB }).Count -eq 1
  $mfLiveBHasA = @($mfLiveFriendsB.Json.friends | Where-Object { $_.username -eq $mfLiveUserA }).Count -eq 1
  Write-MfCheck 'friend acceptance is symmetric' ($mfLiveAccept.Status -eq 200 -and $mfLiveAHasB -and $mfLiveBHasA)

  $mfLiveBlock = Invoke-MfApi POST '/social/block' $mfLiveTokenB @{ username = $mfLiveUserA }
  $mfLiveBlockedRequest = Invoke-MfApi POST '/social/friend/request' $mfLiveTokenA @{ username = $mfLiveUserB }
  $mfLiveBlockedFriends = Invoke-MfApi GET '/social/friends' $mfLiveTokenB
  Write-MfCheck 'block severs friendship and suppresses contact' (
    $mfLiveBlock.Status -eq 200 -and $mfLiveBlockedRequest.Status -eq 403 -and
    $mfLiveBlockedRequest.Json.error -eq 'blocked' -and @($mfLiveBlockedFriends.Json.friends).Count -eq 0
  ) "request HTTP $($mfLiveBlockedRequest.Status)"

  $mfLiveUnblock = Invoke-MfApi POST '/social/unblock' $mfLiveTokenB @{ username = $mfLiveUserA }
  $mfLiveRequest2 = Invoke-MfApi POST '/social/friend/request' $mfLiveTokenA @{ username = $mfLiveUserB }
  Write-MfCheck 'unblock restores request ability' ($mfLiveUnblock.Status -eq 200 -and $mfLiveRequest2.Status -eq 201)

  $mfLiveReport = Invoke-MfApi POST '/social/report' $mfLiveTokenA @{
    username = $mfLiveUserB
    reason = 'Automated isolated production QA report; both QA accounts are deleted in this run.'
    context = "run=$mfLiveSuffix"
  }
  Write-MfCheck 'abuse report accepted' ($mfLiveReport.Status -eq 201 -and $mfLiveReport.Json.reported -eq $true) "HTTP $($mfLiveReport.Status)"
}
finally {
  if ($mfLiveTokenA) {
    try {
      $mfLiveDeleteA = Invoke-MfApi POST '/account/delete' $mfLiveTokenA @{}
      Write-MfCheck 'QA account A deleted' ($mfLiveDeleteA.Status -eq 200 -and $mfLiveDeleteA.Json.deleted -eq $true)
    } catch { Write-MfCheck 'QA account A deleted' $false $_.Exception.Message }
  }
  if ($mfLiveTokenB) {
    try {
      $mfLiveDeleteB = Invoke-MfApi POST '/account/delete' $mfLiveTokenB @{}
      Write-MfCheck 'QA account B deleted' ($mfLiveDeleteB.Status -eq 200 -and $mfLiveDeleteB.Json.deleted -eq $true)
    } catch { Write-MfCheck 'QA account B deleted' $false $_.Exception.Message }
  }
  if ($mfLiveIdA -gt 0 -and $mfLiveIdB -gt 0) {
    $mfLiveResidualSql = "SELECT (SELECT COUNT(*) FROM users WHERE id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM sessions WHERE user_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM saves WHERE user_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM email_verifications WHERE user_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM friendships WHERE lo_id IN ($mfLiveIdA,$mfLiveIdB) OR hi_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM friend_requests WHERE from_id IN ($mfLiveIdA,$mfLiveIdB) OR to_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM blocks WHERE blocker_id IN ($mfLiveIdA,$mfLiveIdB) OR blocked_id IN ($mfLiveIdA,$mfLiveIdB))+(SELECT COUNT(*) FROM reports WHERE reporter_id IN ($mfLiveIdA,$mfLiveIdB) OR subject_user IN ($mfLiveIdA,$mfLiveIdB)) AS residual"
    try {
      $mfLiveResidualRows = Get-MfD1Rows (Invoke-MfD1 $mfLiveResidualSql)
      $mfLiveResidual = if ($mfLiveResidualRows.Count) { [int]$mfLiveResidualRows[0].residual } else { -1 }
      Write-MfCheck 'all QA account/social/save rows purged' ($mfLiveResidual -eq 0) "residual=$mfLiveResidual"
    } catch { Write-MfCheck 'all QA account/social/save rows purged' $false $_.Exception.Message }
  }
}

Write-Host "`n$mfLivePass passed, $mfLiveFail failed"
if ($mfLiveFail -ne 0) { exit 1 }
