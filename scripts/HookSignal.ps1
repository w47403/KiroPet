param(
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][ValidateSet('working','tool','editing','done','idle')][string]$State,
  [string]$Project = '',
  [ValidateSet('start','continue','finish','')][string]$Phase = ''
)
$ErrorActionPreference = 'Stop'
try {
  $dir = [System.IO.Path]::GetDirectoryName($StatePath)
  [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  $context = $null
  if ([Console]::IsInputRedirected) {
    try { $context = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { }
  }
  $tool = [string]$context.tool_name
  if (-not $tool) { $tool = [string]$context.toolName }
  $tool = ($tool -replace '[\x00-\x1f\x7f]', ' ')
  if ($tool.Length -gt 80) { $tool = $tool.Substring(0,80) }
  $inputData = $context.tool_input
  if (-not $inputData) { $inputData = $context.toolInput }
  $file = [string]$context.file_path
  if (-not $file) { $file = [string]$inputData.file_path }
  if (-not $file) { $file = [string]$inputData.path }
  $file = (($file -replace '\\','/').TrimEnd('/') -split '/')[-1] -replace '[\x00-\x1f\x7f]', ' '
  if ($file.Length -gt 80) { $file = $file.Substring(0,80) }
  $detail = @{working='正在处理你的请求';tool='正在调用工具';editing='正在更新文件';done='任务完成';idle='待机中'}[$State]
  if ($State -eq 'tool' -and $tool) {
    $detail = switch -Regex ($tool) {
      'read|view|open' { '正在读取文件'; break }
      'search|grep|find' { '正在搜索'; break }
      'write|edit|patch|replace' { '正在更新文件'; break }
      'shell|exec|bash|terminal' { '正在运行命令'; break }
      default { '正在调用工具' }
    }
    $detail += ' · ' + $(if ($file) { $file } else { $tool })
  } elseif ($State -eq 'editing' -and $file) { $detail += ' · ' + $file
  } elseif ($State -eq 'working' -and $context.hook_event_name -ieq 'PostToolUse') {
    $detail = '工具已返回，继续处理' + $(if ($tool) { ' · ' + $tool } else { '' })
  }
  $phase = if ($Phase) { $Phase } elseif ($context.hook_event_name -ieq 'PromptSubmit') { 'start' } elseif ($context.hook_event_name -ieq 'AgentStop') { 'finish' } else { 'continue' }
  $sessionKey = ''
  $session = [string]$context.session_id
  if ($session) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($session))
      $sessionKey = -join @($hash[0..5] | ForEach-Object { $_.ToString('x2') })
    } finally { $sha256.Dispose() }
  }
  $at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $payload = @{state=$State; phase=$phase; project=$Project; detail=$detail; tool=$tool; file=$file
    event=[string]$context.hook_event_name; session=$sessionKey; at=$at}
  $previous = $null
  if (Test-Path -LiteralPath $StatePath) {
    try { $previous = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
  }
  $same = $previous -and $previous.project -eq $Project -and
    (-not $sessionKey -or -not $previous.session -or $previous.session -eq $sessionKey)
  if ($same -and $previous.state -eq 'done' -and $phase -ne 'start' -and $State -ne 'done') {
    exit 0 # Ignore a delayed tool callback after the terminal AgentStop.
  }
  if ($same -and $phase -ne 'start') {
    $payload.startedAt = if ($previous.startedAt) { [long]$previous.startedAt } elseif ($previous.at) { [long]$previous.at } else { $at }
    $payload.eventCount = [int]$previous.eventCount + 1
  } else {
    $payload.startedAt = $at
    $payload.eventCount = 1
  }
  $payload = $payload | ConvertTo-Json -Compress
  $tmp = "$StatePath.$PID.tmp"
  [System.IO.File]::WriteAllText($tmp, $payload, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $StatePath -Force
} catch { # Never break or pollute the agent when desktop pet is unavailable.
}
exit 0
