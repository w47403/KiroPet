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
if ($script:whaleSize -ne 140) { throw 'Default pet size must be small (140px)' }
if ($script:bitmapCache.Count -gt 240) { throw 'Frame cache exceeded its limit' }
foreach ($name in $script:manifest.clips.PSObject.Properties.Name) {
  Switch-Art $name $true
  foreach ($index in @(0,($script:manifest.clips.$name.frames.Count-1))) {
    $script:picture.Source = Get-PetFrame $name $index
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
for ($i=0; $i -lt $script:manifest.clips.idle.frames.Count; $i++) { $null=Get-PetFrame 'idle' $i }
if ($script:bitmapCache.Count -ne 240) { throw 'Bounded frame eviction failed' }
if (-not (Get-PetFrame 'idle' 0).IsFrozen) { throw 'Evicted frame did not reload' }
Write-Output 'WPF decoded and rendered every clip start/end pose and verified bounded eviction without a visible window.'
function Get-WorkRect { return [System.Windows.Rect]::new(-1920,0,1920,1080) }
$script:window.Left=-1910; $script:window.Top=12
# A fully transparent, non-activating HWND lets WPF's compositor advance clocks.
$script:window.Opacity=0
$script:window.ShowActivated=$false
$script:window.Show()
Snap-Dock
if ($script:dockSide -ne 'left' -or $script:dockX -ne -1920 -or $script:dockY -ne 12) { throw 'Left docking must preserve the dragged height near a corner' }
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
if ($script:folded -or $script:window.Left -ne -1920 -or $script:window.Top -ne 12) { throw 'Dock reveal failed' }
foreach ($y in @(12,(1080-$script:window.Height-12))) {
  Move-Smooth -900 $y $true
  Snap-Dock
  if ($script:dockSide -or $script:window.Top -ne $y -or $script:window.Left -ne -900) { throw 'Top/bottom edges must not attract or fold the pet' }
  Fold-Dock
  if ($script:folded) { throw 'A top/bottom placement must not fold' }
}
Move-Smooth (-$script:window.Width+10) 14 $true
Snap-Dock
if ($script:dockSide -ne 'right' -or $script:dockX -ne -$script:window.Width -or $script:dockY -ne 14) { throw 'Right docking failed to preserve height' }
Move-Smooth $script:dockX $script:dockY $true
Fold-Dock
foreach ($clock in $script:motionClocks) { $clock.Controller.SeekAlignedToLastTick([TimeSpan]::FromMilliseconds(400),[System.Windows.Media.Animation.TimeSeekOrigin]::BeginTime) }
if ([Math]::Abs($script:window.Left-(-56)) -gt 1 -or $script:window.Top -ne 14) { throw 'Right folded exposure or height is wrong' }
Expand-Dock $true
Write-Output 'WPF small default, left/right-only docking, folded exposure and vertical-position preservation passed.'
$script:reactionUntil=$null
$script:taskActive=$false
$script:mood='working'
Switch-Art 'working'
Update-Animation
if ($script:clipName -ne 'work_start') { throw 'Expected task setup' }
Invoke-PetReaction
if ($script:reactionUntil) { throw 'Registered idle entry pose allowed a pat during setup' }
$introLength=($script:manifest.clips.work_start.durations | Measure-Object -Sum).Sum
$setupClock=${function:Get-AnimationTime}
$script:setupNow=Get-AnimationTime
function Get-AnimationTime { return $script:setupNow }
$script:taskStart=$script:setupNow.AddMilliseconds(-0.6*$introLength)
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
${function:Get-AnimationTime}=$setupClock
$script:taskStart=(Get-AnimationTime).AddMilliseconds(-6000)
$script:mood='working'; Switch-Art 'working'; Update-Animation
if ($script:clipName -ne 'working') { throw 'Setup failed to enter working loop' }
$script:workNext=[DateTime]::UtcNow.AddMilliseconds(-1)
Update-Animation
if ($script:clipName -ne 'work_pause') { throw 'Missing work variation' }
$script:workAccentStart=(Get-AnimationTime).AddMilliseconds(-100-($script:manifest.clips.work_pause.durations | Measure-Object -Sum).Sum)
$script:workNext=[DateTime]::UtcNow.AddSeconds(20)
Update-Animation
if ($script:clipName -ne 'working') { throw 'Variation failed to return to work' }
$script:mood='done'; Switch-Art 'done' $true
$script:clipStart=(Get-AnimationTime).AddMilliseconds(-100-($script:manifest.clips.done.durations | Measure-Object -Sum).Sum)
$script:doneStarted=$script:clipStart
Update-Animation
if ($script:taskActive -or $script:clipName -ne 'done' -or $script:lastFrameIndex -ne ($script:manifest.clips.done.frames.Count-1)) { throw 'Completion phase failed' }
Write-Output 'WPF task setup, uninterrupted tool handoff, working loop, variation and completion passed.'
$script:mood='working'; Switch-Art 'working' $true
$script:taskStart=(Get-AnimationTime).AddMilliseconds(-0.6*$introLength)
Update-Animation
$beforeClock=Get-AnimationTime
Begin-PetDrag
$heldClock=Get-AnimationTime
$dragElapsed=$script:manifest.clips.drag.durations[0]+20
$dragIndex=(Get-FrameSample $script:manifest.clips.drag $dragElapsed $true).index
$script:dragStarted=$script:dragStarted.AddMilliseconds(-$dragElapsed)
Update-Animation
# Native decoding advances wall time; exact boundaries are checked by animation-conformance.js.
if ($script:clipName -ne 'drag' -or $script:lastFrameIndex -lt $dragIndex -or $script:lastFrameIndex -gt $dragIndex+12) { throw 'Collar drag did not animate' }
$dragLength=($script:manifest.clips.drag.durations | Measure-Object -Sum).Sum
$script:dragStarted=$script:dragStarted.AddMilliseconds(-$dragLength)
Update-Animation
if ($script:lastFrameIndex -lt $dragIndex -or $script:lastFrameIndex -gt $dragIndex+12) { throw 'Collar drag did not loop' }
End-PetDrag
Update-Animation
if ($script:dragging -or $script:clipName -ne 'work_start') { throw 'Drag did not resume task setup' }
Begin-PetDrag
$script:mood='done'; Switch-Art 'done' $true
Update-Animation
if ($script:clipName -ne 'drag') { throw 'Work event interrupted held drag' }
End-PetDrag
Update-Animation
if ($script:clipName -ne 'done' -or $script:lastFrameIndex -gt 4) { throw 'New completion did not resume after drag' }
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
# Simulate the full reaction's wall time before expiring it.
$script:taskStart=$script:taskStart.AddMilliseconds(-$script:reactionLength)
$script:loopStart=$script:loopStart.AddMilliseconds(-$script:reactionLength)
$script:reactionSavedStart=$script:reactionSavedStart.AddMilliseconds(-$script:reactionLength)
$script:workNext=$script:workNext.AddMilliseconds(-$script:reactionLength)
$script:reactionUntil=[DateTime]::UtcNow.AddMilliseconds(-1)
Update-Animation
if ($script:clipName -ne 'working') { throw 'Work reaction did not resume work' }
$script:mood='idle'; Switch-Art 'idle' $true
Begin-PetDrag; End-PetDrag; Update-Animation
if ($script:clipName -ne 'land') { throw 'Missing idle landing recovery' }
$script:reactionUntil=$null
$originalClock=${function:Get-AnimationTime}
$script:testAnimationClock=[DateTime]::UtcNow
function Get-AnimationTime { return $script:testAnimationClock }
try {
  $script:mood='working'; Switch-Art 'working' $true
  $workingLength=($script:manifest.clips.working.durations | Measure-Object -Sum).Sum
  $editingLength=($script:manifest.clips.editing.durations | Measure-Object -Sum).Sum
  $script:testAnimationClock=$script:taskStart.AddMilliseconds($introLength+0.63*$workingLength)
  $script:mood='editing'; Switch-Art 'editing'
  $phase=($script:testAnimationClock-$script:loopStart).TotalMilliseconds/$editingLength
  if ([Math]::Abs($phase-0.63) -gt 0.001) { throw 'Work/editing switch reset the typing phase' }
  $script:mood='tool'; Switch-Art 'tool'
  $script:testAnimationClock=$script:testAnimationClock.AddMilliseconds(700)
  $script:mood='working'; Switch-Art 'working'
  if ([Math]::Abs(($script:testAnimationClock-$script:loopStart).TotalMilliseconds/$workingLength-0.63) -gt 0.001) { throw 'Tool exit lost the saved typing pose' }
  Update-Animation
  Invoke-PetReaction
  $beforeCancel=$script:loopStart
  $script:reactionUntil=[DateTime]::UtcNow.AddMilliseconds($script:reactionLength-600)
  Cancel-Reaction
  $shift=($script:loopStart-$beforeCancel).TotalMilliseconds
  if ([Math]::Abs($shift-600) -gt 50) { throw 'Early reaction cancellation skipped background frames' }
  $script:mood='sleep'; Switch-Art 'sleep' $true
  $script:testAnimationClock=$script:testAnimationClock.AddMilliseconds(2500)
  Update-Animation
  $sleepStart=$script:sleepStarted; $sleepIndex=$script:lastFrameIndex
  Begin-PetDrag; End-PetDrag; Update-Animation
  if ($script:sleepStarted -ne $sleepStart -or $script:lastFrameIndex -ne $sleepIndex) { throw 'Sleep restarted after dragging' }
  $script:reactionUntil=$null
} finally {
  Set-Item Function:Get-AnimationTime $originalClock
}
Write-Output 'WPF preserves rapid-event phases, compensates interrupted reactions, and resumes sleep after dragging.'
foreach ($size in @(100,140,190,260,320)) {
  Apply-Size $size
  $script:root.Measure([System.Windows.Size]::new($script:window.Width,$script:window.Height))
  $script:root.Arrange([System.Windows.Rect]::new(0,0,$script:window.Width,$script:window.Height))
  $script:root.UpdateLayout()
  if ($script:picture.Width -ne $size*$script:frameAspect -or $script:picture.Height -ne $size -or $script:picture.ActualWidth -le 0 -or $script:picture.ActualWidth -gt $size*$script:frameAspect -or $script:picture.ActualHeight -gt $size) { throw "Wrong pet layout at ${size}: $($script:picture.ActualWidth) x $($script:picture.ActualHeight)" }
}
$unique=@($script:manifest.clips.PSObject.Properties | ForEach-Object { $_.Value.frames } | Sort-Object -Unique)
if ($script:bitmapCache.Count -gt 240) { throw 'Decoded cache grew with the catalog' }
foreach ($bitmap in $script:bitmapCache.Values) {
  if ($bitmap.PixelHeight -gt $script:whaleSize) { throw 'Animation bitmap was not decoded at display size' }
}
Write-Output "WPF contextual reactions, landing, five sizes and $($unique.Count) shared decoded images passed."
$script:folded=$true; $script:foldedAt=[DateTime]::UtcNow.AddMilliseconds(-6000)
Update-Animation
if ($script:animate.Interval.TotalMilliseconds -lt 1000) { throw 'Folded player still uses high-frequency polling' }
Expand-Dock $true
Apply-Size 260
$script:mute=$true; $script:dockEnabled=$false; $script:notifyOnDone=$false
Save-PetWindow
$saved=Read-PetPreferences $PreferencesPath 140
if ($saved.size -ne 260 -or -not $saved.mute -or $saved.dockEnabled -or $saved.notifyOnDone) { throw 'Preferences did not survive a round trip' }
if ((Read-PetPreferences $PreferencesPath 190).size -ne 190) { throw 'Explicit size setting must override saved menu size' }
$legacyPreferences=@{version=1; size=190; configuredSize=190; mute=$false; dockEnabled=$true; notifyOnDone=$true}
Write-PetPreferences $PreferencesPath $legacyPreferences
if ((Read-PetPreferences $PreferencesPath).size -ne 140) { throw 'Old default-size preferences must not defeat the new small default' }
$areas=@([System.Windows.Rect]::new(-1920,0,1920,1080),[System.Windows.Rect]::new(0,0,1920,1040))
$point=Get-PetPosition -1800 100 232 266 $areas
if ($point[0] -ne -1800 -or $point[1] -ne 100) { throw 'Saved negative-monitor position was lost' }
$point=Get-PetPosition -1800 100 232 266 @($areas[1])
if ($point[0] -ne 0 -or $point[1] -ne 100) { throw 'Removed-monitor position was not recovered' }
Write-Output 'WPF saved preferences, removed-monitor recovery and folded blink deadlines passed.'
$event=@{state='done'; phase='finish'; at=1234; reply='answer'; replyUntil=0}
[System.IO.File]::WriteAllText($StatePath,($event|ConvertTo-Json))
Update-Activity
$doneStart=$script:doneStarted
$event.reply=''
[System.IO.File]::WriteAllText($StatePath,($event|ConvertTo-Json))
Update-Activity
if ($script:doneStarted -ne $doneStart) { throw 'Preview change replayed the completion animation' }
$behavior=@{mode='lively';initialHoldMs=8000;restMinMs=8000;restMaxMs=18000;clips=@('cheerful_wave');weights=@{}}
$seq=100
foreach ($pair in @(@('reading','taking_notes'),@('waiting','looking_around'),@('error','jump_scare'))) {
  $seq++
  $visual=@{intent=$pair[0];clip=$pair[1];seq=$seq;loop=$true;behavior=$behavior;configKey='native-test'}
  $event=@{state='tool';at=$seq;presentation=$visual}
  [System.IO.File]::WriteAllText($StatePath,($event|ConvertTo-Json -Depth 8))
  Update-Activity
  if ($script:lastRenderedName -ne $pair[1]) { throw "Presentation did not render $($pair[1])" }
  $start=$script:presentationStart
  $event.at++
  [System.IO.File]::WriteAllText($StatePath,($event|ConvertTo-Json -Depth 8))
  Update-Activity
  if ($script:presentationStart -ne $start) { throw 'Repeated event restarted presentation' }
}
if ($script:manifest.idleBehavior.restMinMs -ne 8000 -or -not $script:modeItems.lively.IsChecked) { throw 'Live mode update failed' }
Send-BehaviorRequest -mode 'quiet'
$request=Get-Content -LiteralPath ($StatePath+'.request.json') -Raw | ConvertFrom-Json
if ($request.mode -ne 'quiet') { throw 'Desktop mode request failed' }
Remove-Item -LiteralPath ($StatePath+'.request.json')
$script:presentation=$null; $script:mood='idle'; $script:reactionUntil=$null
$script:manifest.idleBehavior.clips=@()
$script:idleNext=(Get-AnimationTime).AddSeconds(-1)
Update-Animation
if ($script:lastRenderedName -ne 'idle') { throw 'Empty idle pool must safely breathe' }
Write-Output 'WPF fine-grained presentation, same-state continuity and live behavior controls passed.'
$script:animate.Stop()
$script:monitor.Stop()
$script:window.Close()
'@
$preferencesFile=Join-Path $project ('output/preferences-test.'+[guid]::NewGuid().ToString('N')+'.json')
try {
  & ([scriptblock]::Create($source + $verification)) -AssetPath (Join-Path $project 'assets/whale-girl.png') -StatePath (Join-Path $project 'output/test-activity.json') -PreferencesPath $preferencesFile
} finally {
  if (Test-Path -LiteralPath $preferencesFile) { Remove-Item -LiteralPath $preferencesFile }
}
