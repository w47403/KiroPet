# Run with Windows PowerShell -STA. Render without opening a visible desktop window.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $project 'scripts/WhalePet.ps1') -Raw -Encoding UTF8
$stop = $source.IndexOf('$script:monitor.Start()')
if ($stop -lt 0) { throw 'Could not isolate WPF setup' }
$source = $source.Substring(0, $stop)
$verification = @'

$destination = Join-Path (Split-Path -Parent (Split-Path -Parent $AssetPath)) 'output/wpf-validation'
[void][System.IO.Directory]::CreateDirectory($destination)
if ($script:frameCache.Count -ne $script:manifest.clips.PSObject.Properties.Name.Count) { throw 'All clips must be decoded before playback' }
foreach ($name in $script:manifest.clips.PSObject.Properties.Name) {
  Switch-Art $name $true
  if ($script:frameCache[$name].Count -ne $script:manifest.clips.$name.frames.Count) { throw "Frame count mismatch: $name" }
  foreach ($index in @(0,($script:frameCache[$name].Count-1))) {
    $script:picture.Source = $script:frameCache[$name][$index]
    if (-not $script:picture.Source.IsFrozen) { throw 'Decoded bitmap must be frozen' }
    $script:root.Measure([System.Windows.Size]::new($script:window.Width, $script:window.Height))
    $script:root.Arrange([System.Windows.Rect]::new(0,0,$script:window.Width,$script:window.Height))
    $script:root.UpdateLayout()
    $render = [System.Windows.Media.Imaging.RenderTargetBitmap]::new([int]$script:window.Width,[int]$script:window.Height,96,96,[System.Windows.Media.PixelFormats]::Pbgra32)
    $render.Render($script:root)
    $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($render))
    $stream = [System.IO.File]::Create((Join-Path $destination "$name-$index.png"))
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
  }
}
Write-Output 'WPF decoded every animation frame and rendered start/end poses without a visible window.'
function Get-WorkRect { return [System.Windows.Rect]::new(-1920,0,1920,1080) }
$script:window.Left=-1910; $script:window.Top=12
# A fully transparent, non-activating HWND lets WPF's compositor advance clocks.
$script:window.Opacity=0
$script:window.ShowActivated=$false
$script:window.Show()
Snap-Dock
if (-not $script:dockSide -or $script:dockX -ne -1920 -or $script:dockY -ne 0) { throw 'Corner snapping failed' }
Move-Smooth $script:dockX $script:dockY $true
Fold-Dock
if (-not $script:folded -or $script:dockTab.Visibility -ne 'Visible') { throw 'Dock tab failed' }
if ($script:dockTab.Width -ne 56 -or $script:dockTab.Height -ne 74) { throw 'Peek face strip size is wrong' }
if (-not $script:peekPicture.Source.IsFrozen -or $script:peekPicture.Source.PixelWidth -ne 216) { throw 'Peeking face was not cropped from approved art' }
$script:mood='idle'; Update-Peek
if ($script:peekBadge.Text -ne [string][char]0x2661) { throw 'Peeking idle heart failed' }
$script:foldedAt=[DateTime]::UtcNow.AddMilliseconds(-5100); Update-Peek
if (-not [object]::ReferenceEquals($script:peekPicture.Source,$script:peekFaces['blink'])) { throw 'Peeking blink never triggered' }
$script:mood='working'; Update-Peek
if ($script:peekBadge.Text -ne ([string][char]0x2022+[string][char]0x2022)) { throw 'Folded AI working badge failed' }
$script:mood='done'; Update-Peek
if ($script:peekBadge.Text -ne [string][char]0x2726) { throw 'Folded completion badge failed' }
$script:mood='idle'

# Seek the exact clocks applied to Window.Left/Top. CI has no reliable render cadence.
foreach ($clock in $script:motionClocks) {
  $clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(100),[System.Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
}
$middle=$script:window.Left
if ($middle -ge -1920 -or $middle -le (-1920-$script:window.Width+56)) { throw "No intermediate animation position: $middle" }
foreach ($clock in $script:motionClocks) {
  $clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(400),[System.Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
}
if ([Math]::Abs($script:window.Left-(-1920-$script:window.Width+56)) -gt 1) { throw 'Hide animation did not settle' }
Expand-Dock $true
if ($script:folded -or $script:window.Left -ne -1920 -or $script:window.Top -ne 0) { throw 'Dock reveal failed' }
Write-Output 'WPF snap, cubic animation setup, folded tab and reveal passed on negative screen coordinates.'
$script:reactionUntil=$null
$script:taskActive=$false
$script:mood='working'
Switch-Art 'working'
Update-Animation
if ($script:clipName -ne 'work_start') { throw 'Expected task setup' }
$script:taskStart=[DateTime]::UtcNow.AddMilliseconds(-2000)
$beforeTask=$script:taskStart
Update-Animation
$beforeFrame=$script:picture.Source
$beforeIndex=$script:lastFrameIndex
$script:mood='tool'; Switch-Art 'tool'
if (-not [object]::ReferenceEquals($beforeFrame,$script:picture.Source)) { throw 'Tool event flashed an unrelated first frame during setup' }
Update-Animation
if ($script:clipName -ne 'work_start' -or $script:taskStart -ne $beforeTask) { throw 'Tool event restarted setup' }
if ($script:lastFrameIndex -ne $beforeIndex) { throw 'Tool event changed setup progress' }
foreach ($state in @('editing','working','tool','working')) {
  $beforeFrame=$script:picture.Source
  $script:mood=$state; Switch-Art $state
  if (-not [object]::ReferenceEquals($beforeFrame,$script:picture.Source)) { throw 'Rapid work events flashed frame zero' }
  Update-Animation
}
$script:taskStart=[DateTime]::UtcNow.AddMilliseconds(-6000)
$script:mood='working'; Switch-Art 'working'; Update-Animation
if ($script:clipName -ne 'working') { throw 'Setup failed to enter working loop' }
$script:workNext=[DateTime]::UtcNow.AddMilliseconds(-1)
Update-Animation
if ($script:clipName -ne 'work_pause') { throw 'Missing work variation' }
$script:workAccentStart=[DateTime]::UtcNow.AddMilliseconds(-7300)
$script:workNext=[DateTime]::UtcNow.AddSeconds(20)
Update-Animation
if ($script:clipName -ne 'working') { throw 'Variation failed to return to work' }
$script:mood='done'; Switch-Art 'done' $true
$script:clipStart=[DateTime]::UtcNow.AddSeconds(-10)
$script:doneStarted=$script:clipStart
Update-Animation
if ($script:taskActive -or $script:clipName -ne 'done' -or $script:lastFrameIndex -ne 7) { throw 'Completion phase failed' }
Write-Output 'WPF task setup, uninterrupted tool handoff, working loop, variation and completion passed.'
$script:mood='working'; Switch-Art 'working' $true
$script:taskStart=(Get-AnimationTime).AddMilliseconds(-2000)
Update-Animation
$beforeClock=Get-AnimationTime
Begin-PetDrag
$heldClock=Get-AnimationTime
$script:dragStarted=$script:dragStarted.AddMilliseconds(-160)
Update-Animation
if ($script:clipName -ne 'drag' -or $script:lastFrameIndex -ne 1) { throw 'Collar drag did not animate' }
$script:dragStarted=$script:dragStarted.AddMilliseconds(-1280)
Update-Animation
if ($script:lastFrameIndex -ne 1) { throw 'Collar drag did not loop' }
End-PetDrag
Update-Animation
if ($script:dragging -or $script:clipName -ne 'work_start') { throw 'Drag did not resume task setup' }
Begin-PetDrag
$script:mood='done'; Switch-Art 'done' $true
Update-Animation
if ($script:clipName -ne 'drag') { throw 'Work event interrupted held drag' }
End-PetDrag
Update-Animation
if ($script:clipName -ne 'done' -or $script:lastFrameIndex -ne 0) { throw 'New completion did not resume after drag' }
Write-Output 'WPF collar drag loops, pauses task timeline, and resumes newly received work events.'
$replyEvent = @{state='done'; source='session'; phase='finish'; at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); detail='Completed'; reply='Latest visible answer'; replyUntil=[DateTimeOffset]::UtcNow.AddSeconds(8).ToUnixTimeMilliseconds()}
[System.IO.File]::WriteAllText($StatePath,($replyEvent | ConvertTo-Json))
Update-Activity
if ($script:bubbleText.Text -notlike '*Latest visible answer') { throw 'Completion hid the answer excerpt' }
if (($script:bubbleUntil-[DateTime]::UtcNow).TotalSeconds -lt 6) { throw 'Answer reading time is too short' }
$script:bubbleUntil=[DateTime]::UtcNow.AddSeconds(-1)
Update-Animation
if ($script:bubble.Visibility -ne 'Collapsed') { throw 'Completed answer bubble did not close' }
Write-Output 'WPF answer excerpt survives completion and expires without reviving the bubble.'
$script:mood='working'; $script:reactionUntil=$null; Switch-Art 'working' $true
$script:taskStart=(Get-AnimationTime).AddMilliseconds(-4000)
$script:loopStart=$script:taskStart
$script:workNext=(Get-AnimationTime).AddSeconds(30)
Update-Animation
Invoke-PetReaction
if ($script:clipName -ne 'work_pet') { throw 'Work reaction removed the desk' }
$script:reactionUntil=[DateTime]::UtcNow.AddMilliseconds(-1)
Update-Animation
if ($script:clipName -ne 'working') { throw 'Work reaction did not resume work' }
$script:mood='idle'; Switch-Art 'idle' $true
Begin-PetDrag; End-PetDrag; Update-Animation
if ($script:clipName -ne 'land') { throw 'Missing idle landing recovery' }
$script:reactionUntil=$null
foreach ($size in @(100,140,190,260,320)) {
  Apply-Size $size
  $script:root.Measure([System.Windows.Size]::new($script:window.Width,$script:window.Height))
  $script:root.Arrange([System.Windows.Rect]::new(0,0,$script:window.Width,$script:window.Height))
  $script:root.UpdateLayout()
  if ($script:picture.Width -ne $size -or $script:picture.Height -ne $size -or $script:picture.ActualWidth -le 0 -or $script:picture.ActualWidth -gt $size -or $script:picture.ActualHeight -gt $size) { throw "Wrong pet layout at ${size}: $($script:picture.ActualWidth) x $($script:picture.ActualHeight)" }
}
$unique=@($script:manifest.clips.PSObject.Properties | ForEach-Object { $_.Value.frames } | Sort-Object -Unique)
if ($script:bitmapCache.Count -ne $unique.Count) { throw 'Duplicate decoded frame allocations' }
Write-Output "WPF contextual reactions, landing, five sizes and $($unique.Count) shared decoded images passed."
$script:animate.Stop()
$script:monitor.Stop()
$script:window.Close()
'@
& ([scriptblock]::Create($source + $verification)) -AssetPath (Join-Path $project 'assets/whale-girl.png') -StatePath (Join-Path $project 'output/test-activity.json')
