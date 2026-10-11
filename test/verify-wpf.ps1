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
foreach ($name in $script:manifest.clips.PSObject.Properties.Name) {
  Switch-Art $name $true
  if ($script:frameCache[$name].Count -ne 8) { throw "Expected 8 WPF frames: $name" }
  foreach ($index in @(0,7)) {
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
# Seek the exact clocks applied to Window.Left/Top. CI has no reliable render cadence.
foreach ($clock in $script:motionClocks) {
  $clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(100),[System.Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
}
$middle=$script:window.Left
if ($middle -ge -1920 -or $middle -le (-1920-$script:window.Width+26)) { throw "No intermediate animation position: $middle" }
foreach ($clock in $script:motionClocks) {
  $clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(400),[System.Windows.Media.Animation.TimeSeekOrigin]::BeginTime)
}
if ([Math]::Abs($script:window.Left-(-1920-$script:window.Width+26)) -gt 1) { throw 'Hide animation did not settle' }
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
$script:mood='tool'; Switch-Art 'tool'; Update-Animation
if ($script:clipName -ne 'work_start' -or $script:taskStart -ne $beforeTask) { throw 'Tool event restarted setup' }
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
$script:animate.Stop()
$script:monitor.Stop()
$script:window.Close()
'@
& ([scriptblock]::Create($source + $verification)) -AssetPath (Join-Path $project 'assets/whale-girl.png') -StatePath (Join-Path $project 'output/test-activity.json')
