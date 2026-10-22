function Read-PetPreferences([string]$Path, [int]$ConfiguredSize = 140) {
  $result = @{size=$ConfiguredSize; configuredSize=$ConfiguredSize; mute=$false; dockEnabled=$true; notifyOnDone=$true}
  try {
    $value = [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if ($value.version -ne 1) { return $result }
    if ($value.configuredSize -eq $ConfiguredSize -and $value.size -is [ValueType] -and $value.size -isnot [bool] -and $value.size -ge 100 -and $value.size -le 320) { $result.size=[int]$value.size }
    foreach ($key in @('mute','dockEnabled','notifyOnDone')) { if ($value.$key -is [bool]) { $result[$key]=$value.$key } }
    foreach ($key in @('left','top')) {
      if ($value.$key -is [ValueType] -and $value.$key -isnot [bool] -and -not [double]::IsNaN($value.$key) -and -not [double]::IsInfinity($value.$key)) { $result[$key]=[double]$value.$key }
    }
  } catch { }
  return $result
}
function Write-PetPreferences([string]$Path, [hashtable]$Value) {
  if (-not $Path) { return }
  $temporary="$Path.$PID.tmp"
  try {
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($Path))
    $Value.version=1
    [System.IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
  } catch { }
  finally { try { if ([System.IO.File]::Exists($temporary)) { [System.IO.File]::Delete($temporary) } } catch { } }
}
function Get-PetPosition([double]$Left, [double]$Top, [double]$Width, [double]$Height, $Areas) {
  $best=$null; $distance=[double]::PositiveInfinity
  foreach ($area in $Areas) {
    $x=[Math]::Max($area.Left,[Math]::Min([Math]::Max($area.Left,$area.Right-$Width),$Left))
    $y=[Math]::Max($area.Top,[Math]::Min([Math]::Max($area.Top,$area.Bottom-$Height),$Top))
    $d=($x-$Left)*($x-$Left)+($y-$Top)*($y-$Top)
    if ($d -lt $distance) { $best=@($x,$y); $distance=$d }
  }
  return $best
}
