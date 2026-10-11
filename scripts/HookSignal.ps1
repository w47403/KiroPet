param(
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][ValidateSet('working','tool','editing','done','idle')][string]$State,
  [string]$Project = ''
)
$ErrorActionPreference = 'Stop'
try {
  $dir = [System.IO.Path]::GetDirectoryName($StatePath)
  [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  $payload = @{ state = $State; project = $Project; at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
  $tmp = "$StatePath.$PID.tmp"
  [System.IO.File]::WriteAllText($tmp, $payload, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
} catch { # Never break or pollute the agent when desktop pet is unavailable.
}
exit 0
