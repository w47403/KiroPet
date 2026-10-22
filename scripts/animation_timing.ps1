function Get-FrameSample($Clip, [double]$Elapsed, [bool]$Loop) {
  $total=($Clip.durations | Measure-Object -Sum).Sum
  $remaining=[Math]::Max(0,$Elapsed)
  if ($Loop) { $remaining=$remaining % $total }
  elseif ($remaining -ge $total) { return @{index=$Clip.frames.Count-1; delay=250} }
  for ($i=0; $i -lt $Clip.durations.Count; $i++) {
    if ($remaining -lt $Clip.durations[$i]) { return @{index=$i; delay=[Math]::Max(16,[Math]::Min(250,$Clip.durations[$i]-$remaining))} }
    $remaining-=$Clip.durations[$i]
  }
  return @{index=$Clip.frames.Count-1; delay=250}
}
function Get-PeekDelay([double]$Elapsed, [string]$State) {
  if ($Elapsed -lt 340) { return [Math]::Max(16,340-$Elapsed) }
  if ($State -eq 'sleep') { return 60000 }
  $phase=$Elapsed % 7200
  if ($phase -lt 5000) { return [Math]::Max(16,5000-$phase) }
  if ($phase -lt 5230) { return [Math]::Max(16,5230-$phase) }
  return [Math]::Max(16,12200-$phase)
}
