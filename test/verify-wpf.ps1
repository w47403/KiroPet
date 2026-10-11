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
foreach ($name in @('idle','working','tool','editing','done','hug','sleep')) {
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
Write-Output 'WPF decoded all 56 frames and rendered 14 state poses without a visible window.'
$script:animate.Stop()
$script:monitor.Stop()
$script:window.Close()
'@
& ([scriptblock]::Create($source + $verification)) -AssetPath (Join-Path $project 'assets/whale-girl.png') -StatePath (Join-Path $project 'output/test-activity.json')
