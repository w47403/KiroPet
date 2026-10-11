param(
  [Parameter(Mandatory = $true)][string]$AssetPath,
  [Parameter(Mandatory = $true)][string]$StatePath,
  [int]$InitialSize = 190,
  [int]$ParentProcessId = 0
)

# A tiny Windows WPF desktop companion: offline, no networking, no elevated permissions.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms

$script:whaleSize = [Math]::Max(100, [Math]::Min(320, $InitialSize))
$script:mute = $false
$script:tickStart = [DateTime]::UtcNow
$script:lastState = 'idle'
$script:lastEventKey = ''
$script:bubbleUntil = [DateTime]::UtcNow
$script:mood = 'idle'
$script:activityDetail = ''
$script:idleName = 'idle'
$script:idleStarted = $null
$script:idleNext = [DateTime]::UtcNow.AddSeconds(22)
$script:tick = 0
$script:phrases = @('在呢～', '摸摸头，继续加油！', '今天也要写出漂亮的代码～', '呼噜呼噜～', '一起摸鱼五秒钟？', '你写代码，我负责卖萌！')

$script:window = New-Object System.Windows.Window
$script:window.Title = 'Kiro 鲸鱼娘桌宠'
$script:window.Width = $script:whaleSize + 42
$script:window.Height = $script:whaleSize + 76
$script:window.WindowStartupLocation = 'Manual'
$script:window.WindowStyle = [System.Windows.WindowStyle]::None
$script:window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$script:window.AllowsTransparency = $true
$script:window.Background = [System.Windows.Media.Brushes]::Transparent
$script:window.Topmost = $true
$script:window.ShowInTaskbar = $false
$script:window.Left = [System.Windows.SystemParameters]::WorkArea.Right - $script:window.Width - 26
$script:window.Top = [System.Windows.SystemParameters]::WorkArea.Bottom - $script:window.Height - 20

$script:root = New-Object System.Windows.Controls.Grid
$script:root.Background = [System.Windows.Media.Brushes]::Transparent
$script:window.Content = $script:root

$script:picture = New-Object System.Windows.Controls.Image
$script:picture.Width = $script:whaleSize
$script:picture.Height = $script:whaleSize
$script:picture.Stretch = [System.Windows.Media.Stretch]::Uniform
$script:picture.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$script:picture.VerticalAlignment = [System.Windows.VerticalAlignment]::Bottom
$script:picture.Cursor = [System.Windows.Input.Cursors]::Hand
$script:picture.RenderTransformOrigin = [System.Windows.Point]::new(0.5, 0.82)
$bmp = New-Object System.Windows.Media.Imaging.BitmapImage
$bmp.BeginInit()
$bmp.UriSource = [System.Uri]::new([System.IO.Path]::GetFullPath($AssetPath), [System.UriKind]::Absolute)
$bmp.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
$bmp.EndInit()
$bmp.Freeze()
$script:picture.Source = $bmp
$script:animationFolder = Join-Path (Split-Path -Parent $AssetPath) 'animations'
$script:manifest = Get-Content -LiteralPath (Join-Path $script:animationFolder 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:frameCache = @{}
$script:clipName = ''
$script:clipStart = [DateTime]::UtcNow
$script:lastFrameIndex = -1
$script:taskActive = $false
$script:taskStart = [DateTime]::UtcNow
$script:workAccentStart = $null
$script:workNext = [DateTime]::MaxValue
function Switch-Art([string]$name, [bool]$Restart = $false) {
  if ($name -eq 'happy') { $name = 'working' }
  if ($null -eq $script:manifest.clips.PSObject.Properties[$name]) { $name = 'idle' }
  if ($name -in @('working','tool','editing') -and -not $script:taskActive) {
    $script:taskActive=$true; $script:taskStart=[DateTime]::UtcNow; $script:workAccentStart=$null
    $length=($script:manifest.clips.work_start.durations | Measure-Object -Sum).Sum
    $script:workNext=$script:taskStart.AddMilliseconds($length+18000)
  } elseif ($name -in @('idle','sleep','done')) {
    $script:taskActive=$false; $script:workAccentStart=$null
  }
  if ($script:clipName -eq $name -and -not $Restart) { return }
  if (-not $script:frameCache.ContainsKey($name)) {
    $frames = @()
    foreach ($relative in $script:manifest.clips.$name.frames) {
      $frame = New-Object System.Windows.Media.Imaging.BitmapImage
      $frame.BeginInit()
      $frame.UriSource = [System.Uri]::new((Join-Path $script:animationFolder $relative), [System.UriKind]::Absolute)
      $frame.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
      $frame.EndInit(); $frame.Freeze()
      $frames += $frame
    }
    $script:frameCache[$name] = $frames
  }
  $script:clipName = $name
  $script:clipStart = [DateTime]::UtcNow
  $script:lastFrameIndex = -1
  $script:picture.Source = $script:frameCache[$name][0]
}
Switch-Art 'idle'
[void]$script:root.Children.Add($script:picture)

$script:bubble = New-Object System.Windows.Controls.Border
$script:bubble.Visibility = [System.Windows.Visibility]::Collapsed
$script:bubble.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$script:bubble.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
$script:bubble.CornerRadius = [System.Windows.CornerRadius]::new(12)
$script:bubble.Padding = [System.Windows.Thickness]::new(12, 7, 12, 7)
$script:bubble.Margin = [System.Windows.Thickness]::new(0, 4, 0, 0)
$script:bubble.Background = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(232, 24, 49, 79))
$script:bubble.BorderBrush = [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.Color]::FromArgb(185, 116, 206, 250))
$script:bubble.BorderThickness = [System.Windows.Thickness]::new(1)
$script:bubbleText = New-Object System.Windows.Controls.TextBlock
$script:bubbleText.Foreground = [System.Windows.Media.Brushes]::White
$script:bubbleText.FontFamily = [System.Windows.Media.FontFamily]::new('Microsoft YaHei UI')
$script:bubbleText.FontSize = 12
$script:bubbleText.TextAlignment = [System.Windows.TextAlignment]::Center
$script:bubbleText.TextWrapping = [System.Windows.TextWrapping]::Wrap
$script:bubbleText.MaxWidth = $script:whaleSize + 18
$script:bubble.Child = $script:bubbleText
[void]$script:root.Children.Add($script:bubble)

function Say([string]$message, [int]$seconds = 3) {
  if ($script:mute -or $script:folded) { return }
  $script:bubbleText.Text = $message
  $script:bubble.Visibility = [System.Windows.Visibility]::Visible
  $script:bubbleUntil = [DateTime]::UtcNow.AddSeconds($seconds)
}

function Apply-Size([int]$newSize) {
  Expand-Dock $true
  $script:whaleSize = $newSize
  $script:window.Width = $newSize + 42
  $script:window.Height = $newSize + 76
  $script:picture.Width = $newSize
  $script:picture.Height = $newSize
  $script:bubbleText.MaxWidth = $newSize + 18
  $script:dockSide = ''
}

# Coordinates are WPF DIPs; convert the current monitor's pixel work area for DPI.
$script:dockEnabled = $true
$script:dockSide = ''
$script:folded = $false
$script:dragging = $false
$script:hideAt = [DateTime]::MaxValue
$script:dockArea = $null
$script:dockTab = New-Object System.Windows.Controls.Border
$script:dockTab.Background = [System.Windows.Media.Brushes]::SteelBlue
$script:dockTab.CornerRadius = [System.Windows.CornerRadius]::new(10)
$script:dockTab.Visibility = [System.Windows.Visibility]::Collapsed
$script:dockTab.Cursor = [System.Windows.Input.Cursors]::Hand
$tabText = New-Object System.Windows.Controls.TextBlock
$tabText.Text = '🐋'
$tabText.Foreground = [System.Windows.Media.Brushes]::White
$tabText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$tabText.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$script:dockTab.Child = $tabText
[void]$script:root.Children.Add($script:dockTab)

function Get-WorkRect {
  $screen = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position)
  $area = $screen.WorkingArea
  $source = [System.Windows.PresentationSource]::FromVisual($script:window)
  $matrix = [System.Windows.Media.Matrix]::Identity
  if ($source) { $matrix = $source.CompositionTarget.TransformFromDevice }
  $start = $matrix.Transform([System.Windows.Point]::new($area.Left,$area.Top))
  $end = $matrix.Transform([System.Windows.Point]::new($area.Right,$area.Bottom))
  return [System.Windows.Rect]::new($start,$end)
}
function Move-Smooth([double]$x, [double]$y, [bool]$immediate = $false) {
  $fromX = $script:window.Left; $fromY = $script:window.Top
  $script:window.BeginAnimation([System.Windows.Window]::LeftProperty,$null)
  $script:window.BeginAnimation([System.Windows.Window]::TopProperty,$null)
  $script:window.Left = $x; $script:window.Top = $y
  if ($immediate) { return }
  $ease = New-Object System.Windows.Media.Animation.CubicEase
  $ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
  foreach ($axis in @(@([System.Windows.Window]::LeftProperty,$fromX,$x),@([System.Windows.Window]::TopProperty,$fromY,$y))) {
    $animation = New-Object System.Windows.Media.Animation.DoubleAnimation
    $animation.From = $axis[1]; $animation.To = $axis[2]
    $animation.Duration = [TimeSpan]::FromMilliseconds(340)
    $animation.EasingFunction = $ease
    $animation.FillBehavior = [System.Windows.Media.Animation.FillBehavior]::Stop
    $script:window.BeginAnimation($axis[0],$animation)
  }
}
function Expand-Dock([bool]$immediate = $false) {
  if (-not $script:folded) { return }
  $script:folded = $false
  $script:picture.Visibility = [System.Windows.Visibility]::Visible
  $script:dockTab.Visibility = [System.Windows.Visibility]::Collapsed
  Move-Smooth $script:dockX $script:dockY $immediate
  $script:hideAt = [DateTime]::MaxValue
}
function Fold-Dock {
  if (-not $script:dockSide -or -not $script:dockEnabled -or $script:dragging -or $script:root.IsMouseOver -or $menu.IsOpen) { return }
  $area = $script:dockArea
  $x = $script:dockX; $y = $script:dockY
  $script:dockTab.Width = 26; $script:dockTab.Height = 64
  $script:dockTab.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
  $script:dockTab.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  switch ($script:dockSide) {
    'left' { $x=$area.Left-$script:window.Width+26; $script:dockTab.HorizontalAlignment='Right' }
    'right' { $x=$area.Right-26; $script:dockTab.HorizontalAlignment='Left' }
    'top' { $y=$area.Top-$script:window.Height+26; $script:dockTab.VerticalAlignment='Bottom'; $script:dockTab.Width=64; $script:dockTab.Height=26 }
    'bottom' { $y=$area.Bottom-26; $script:dockTab.VerticalAlignment='Top'; $script:dockTab.Width=64; $script:dockTab.Height=26 }
  }
  $script:folded = $true
  $script:foldedAt = [DateTime]::UtcNow
  $script:bubble.Visibility = [System.Windows.Visibility]::Collapsed
  $script:dockTab.Visibility = [System.Windows.Visibility]::Visible
  $script:dockTab.ToolTip = $(if ($script:activityDetail) { $script:activityDetail } else { '鲸鱼娘 · 鼠标靠近展开，拖动移出边缘' })
  Move-Smooth $x $y
  $script:hideAt = [DateTime]::MaxValue
}
function Snap-Dock {
  $script:dockSide = ''
  if (-not $script:dockEnabled) { return }
  $area = Get-WorkRect
  $x=$script:window.Left; $y=$script:window.Top
  $distances = @{
    left=[Math]::Abs($x-$area.Left); right=[Math]::Abs($area.Right-$x-$script:window.Width)
    top=[Math]::Abs($y-$area.Top); bottom=[Math]::Abs($area.Bottom-$y-$script:window.Height)
  }
  $nearest = $distances.GetEnumerator() | Sort-Object Value | Select-Object -First 1
  if ($nearest.Value -gt 36) { return }
  $script:dockSide = $nearest.Key
  $x=[Math]::Max($area.Left,[Math]::Min($area.Right-$script:window.Width,$x))
  $y=[Math]::Max($area.Top,[Math]::Min($area.Bottom-$script:window.Height,$y))
  # At corners snap both coordinates while retaining one reveal edge.
  if ($distances.left -le 36) { $x=$area.Left } elseif ($distances.right -le 36) { $x=$area.Right-$script:window.Width }
  if ($distances.top -le 36) { $y=$area.Top } elseif ($distances.bottom -le 36) { $y=$area.Bottom-$script:window.Height }
  $script:dockX=$x; $script:dockY=$y; $script:dockArea=$area
  Move-Smooth $x $y
  $script:hideAt=[DateTime]::UtcNow.AddMilliseconds(1400)
}
$script:root.Add_MouseEnter({ Expand-Dock })
$script:root.Add_MouseLeave({ if ($script:dockSide -and -not $script:dragging) { $script:hideAt=[DateTime]::UtcNow.AddMilliseconds(1200) } })
$script:dockTab.Add_MouseLeftButtonDown({ Expand-Dock $true })

function Add-MenuItem([System.Windows.Controls.ContextMenu]$menu, [string]$label, [scriptblock]$clicked) {
  $entry = New-Object System.Windows.Controls.MenuItem
  $entry.Header = $label
  $entry.Add_Click($clicked)
  [void]$menu.Items.Add($entry)
}

$menu = New-Object System.Windows.Controls.ContextMenu
Add-MenuItem $menu '🐋 摸摸鲸鱼娘' { Switch-Art 'hug'; $script:reactionUntil = [DateTime]::UtcNow.AddSeconds(2); Say $script:phrases[(Get-Random -Maximum $script:phrases.Count)] }
Add-MenuItem $menu '💻 工作中' { $script:activityDetail=''; $script:reactionUntil=$null; $script:mood = 'working'; Switch-Art 'happy'; Say '正在认真写代码！' }
Add-MenuItem $menu '🛠 调用工具' { $script:activityDetail=''; $script:reactionUntil=$null; $script:mood = 'tool'; Switch-Art 'tool'; Say '工具准备好啦～' }
Add-MenuItem $menu '📝 修改文件' { $script:activityDetail=''; $script:reactionUntil=$null; $script:mood = 'editing'; Switch-Art 'editing'; Say '正在更新文件～' }
Add-MenuItem $menu '✨ 完成啦' { $script:activityDetail=''; $script:reactionUntil=$null; $script:mood = 'done'; Switch-Art 'done' $true; Say '任务完成！辛苦啦～' }
Add-MenuItem $menu '💤 休息一下' {
  $script:activityDetail=''; $script:reactionUntil=$null; $script:mood='idle'; $script:idleName='idle'; $script:idleStarted=$null
  $script:idleNext=[DateTime]::UtcNow.AddSeconds(22); Switch-Art 'idle' $true; Say '休息一会儿也不错～'
}
Add-MenuItem $menu '🌙 打个盹' { $script:activityDetail=''; $script:reactionUntil=$null; $script:mood = 'sleep'; Switch-Art 'sleep'; Say '呼噜呼噜～' }
[void]$menu.Items.Add((New-Object System.Windows.Controls.Separator))
Add-MenuItem $menu '小小只 (140px)' { Apply-Size 140 }
Add-MenuItem $menu '正常大小 (190px)' { Apply-Size 190 }
Add-MenuItem $menu '大大只 (260px)' { Apply-Size 260 }
[void]$menu.Items.Add((New-Object System.Windows.Controls.Separator))
Add-MenuItem $menu '静音 / 恢复气泡' {
  $script:mute = -not $script:mute
  if ($script:mute) { $script:bubble.Visibility = [System.Windows.Visibility]::Collapsed } else { Say '我回来啦～' }
}
Add-MenuItem $menu '退出桌宠' { $script:window.Close() }
Add-MenuItem $menu '边缘吸附与收起：开启 / 关闭' {
  Expand-Dock $true
  $script:dockEnabled = -not $script:dockEnabled
  if (-not $script:dockEnabled) { $script:dockSide = '' }
  Say $(if ($script:dockEnabled) { '边缘吸附已开启～' } else { '边缘吸附已关闭～' })
}
$script:picture.ContextMenu = $menu
$script:root.ContextMenu = $menu

$script:picture.Add_MouseLeftButtonDown({
  param($sender, $event)
  if ($event.ClickCount -ge 2) {
    Say '嘿嘿～被发现啦！' 2
    $event.Handled = $true
    return
  }
  $before = [System.Windows.Forms.Cursor]::Position
  Expand-Dock $true
  Move-Smooth $script:window.Left $script:window.Top $true
  $script:dragging = $true
  try { $script:window.DragMove() } catch { }
  $script:dragging = $false
  $after = [System.Windows.Forms.Cursor]::Position
  $d = [Math]::Abs($before.X - $after.X) + [Math]::Abs($before.Y - $after.Y)
  if ($d -lt 8) { Switch-Art 'hug'; $script:reactionUntil = [DateTime]::UtcNow.AddSeconds(2); Say $script:phrases[(Get-Random -Maximum $script:phrases.Count)] }
  else { Snap-Dock }
  $event.Handled = $true
})

# Polls the text token written by the extension or optional Kiro Agent Hooks.
$script:monitor = New-Object System.Windows.Threading.DispatcherTimer
$script:monitor.Interval = [TimeSpan]::FromMilliseconds(700)
$script:monitor.Add_Tick({
  try {
    if ($ParentProcessId -gt 0) {
      $parent = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
      if ($null -eq $parent) { $script:window.Close(); return }
    }
    if (Test-Path -LiteralPath $StatePath) {
      $raw = [System.IO.File]::ReadAllText($StatePath).Trim()
      if ($raw.StartsWith('{')) {
        $event = $raw | ConvertFrom-Json
        $next = [string]$event.state
        $eventKey = "$($event.at)|$($event.state)|$($event.project)|$($event.detail)"
        $project = [string]$event.project
        $script:activityDetail = [string]$event.detail
      } else {
        # Compatible with events written by v0.1.x.
        $next = $raw
        $eventKey = $raw
        $project = ''
        $script:activityDetail = ''
      }
      if ($eventKey -ne $script:lastEventKey) {
        if ($raw.StartsWith('{') -and $event.phase -eq 'start') { $script:taskActive=$false; $script:workAccentStart=$null }
        $script:reactionUntil = $null
        $script:lastEventKey = $eventKey
        $script:lastState = $next
        if ($next -eq 'idle' -and $script:mood -ne 'idle') {
          $script:idleName='idle'; $script:idleStarted=$null; $script:idleNext=[DateTime]::UtcNow.AddSeconds(22)
        }
        $projectHint = if ($project) { "[$project] " } else { '' }
        switch ($next) {
          'working' { $script:mood = 'working'; Switch-Art 'happy'; Say "${projectHint}Kiro 正在处理…" 3 }
          'tool' { $script:mood = 'tool'; Switch-Art 'tool'; Say "${projectHint}正在调用工具…" 2 }
          'editing' { $script:mood = 'editing'; Switch-Art 'editing'; Say "${projectHint}文件更新啦～" 2 }
          'done' { $script:mood = 'done'; Switch-Art 'done' $true; Say "${projectHint}任务完成啦！✨" 5 }
          'idle' { $script:mood = 'idle'; Switch-Art 'idle'; Say '待机中，随时出发～' 2 }
          'sleep' { $script:mood = 'sleep'; Switch-Art 'sleep'; Say '呼噜呼噜～' 2 }
          'hello' { Say '我在这里～' 2 }
        }
        if ($script:activityDetail) { Say $script:activityDetail 3 }
        $script:dockTab.ToolTip = $script:activityDetail
      }
    }
  } catch { }
})

$script:animate = New-Object System.Windows.Threading.DispatcherTimer
$script:animate.Interval = [TimeSpan]::FromMilliseconds(80)
function Update-Animation {
  if ([DateTime]::UtcNow -ge $script:hideAt) { Fold-Dock }
  if ($script:folded) {
    if (([DateTime]::UtcNow-$script:foldedAt).TotalMilliseconds -ge 340) { $script:picture.Visibility = [System.Windows.Visibility]::Hidden }
    return
  }
  if (-not $script:window.IsVisible -or $script:window.WindowState -eq [System.Windows.WindowState]::Minimized) { return }
  if ($script:reactionUntil -and [DateTime]::UtcNow -gt $script:reactionUntil) {
    $script:reactionUntil = $null
    Switch-Art $script:mood
  }
  $quiet = $script:mood -eq 'idle' -and -not $script:reactionUntil
  $working = $script:mood -in @('working','tool','editing') -and -not $script:reactionUntil
  $workElapsed = 0
  $introLength = ($script:manifest.clips.work_start.durations | Measure-Object -Sum).Sum
  if ($working) {
    $workElapsed=([DateTime]::UtcNow-$script:taskStart).TotalMilliseconds
    if ($workElapsed -lt $introLength) { Switch-Art 'work_start'
    } else {
      $accentLength=($script:manifest.clips.work_pause.durations | Measure-Object -Sum).Sum
      if ($script:workAccentStart -and ([DateTime]::UtcNow-$script:workAccentStart).TotalMilliseconds -ge $accentLength) { $script:workAccentStart=$null }
      if ($script:mood -ne 'tool' -and -not $script:workAccentStart -and [DateTime]::UtcNow -ge $script:workNext -and $accentLength -gt 0) {
        $script:workAccentStart=[DateTime]::UtcNow
        $script:workNext=[DateTime]::UtcNow.AddMilliseconds($accentLength+(Get-Random -Minimum 18000 -Maximum 35001))
      }
      if (($script:mood -eq 'tool' -or $script:workAccentStart) -and $accentLength -gt 0) { Switch-Art 'work_pause'
      } else { Switch-Art $script:mood }
    }
  }
  if ($quiet) {
    if ([DateTime]::UtcNow -ge $script:idleNext) {
      $names = @($script:manifest.idleBehavior.clips | Where-Object { $_ -ne $script:idleName })
      $script:idleName = $names[(Get-Random -Maximum $names.Count)]
      Switch-Art $script:idleName $true
      $script:idleStarted = [DateTime]::UtcNow
      $length = ($script:manifest.clips.($script:idleName).durations | Measure-Object -Sum).Sum
      $script:idleNext = [DateTime]::UtcNow.AddMilliseconds($length + (Get-Random -Minimum 18000 -Maximum 45001))
    } elseif ($script:clipName -ne $script:idleName) { Switch-Art $script:idleName }
  }
  $clip = $script:manifest.clips.($script:clipName)
  $total = 0
  foreach ($duration in $clip.durations) { $total += $duration }
  $elapsed = ([DateTime]::UtcNow - $script:clipStart).TotalMilliseconds
  if ($working) {
    $elapsed = if ($script:clipName -eq 'work_start') { $workElapsed
    } elseif ($script:workAccentStart -and $script:mood -ne 'tool') { ([DateTime]::UtcNow-$script:workAccentStart).TotalMilliseconds
    } else { $workElapsed-$introLength }
  }
  if ($quiet -and $script:idleStarted) { $elapsed = ([DateTime]::UtcNow-$script:idleStarted).TotalMilliseconds }
  if (($clip.loop -or ($working -and $script:mood -eq 'tool' -and $script:clipName -eq 'work_pause')) -and -not $quiet) { $elapsed = $elapsed % $total }
  if ($quiet -and -not $script:idleStarted) { $elapsed = 0 }
  $index = $clip.frames.Count - 1
  for ($i = 0; $i -lt $clip.durations.Count; $i++) {
    if ($elapsed -lt $clip.durations[$i]) { $index = $i; break }
    $elapsed -= $clip.durations[$i]
  }
  if ($index -ne $script:lastFrameIndex) {
    $script:picture.Source = $script:frameCache[$script:clipName][$index]
    $script:lastFrameIndex = $index
  }
  if ([DateTime]::UtcNow -gt $script:bubbleUntil) {
    if ($script:mood -in @('working','tool','editing') -and -not $script:mute) {
      $script:bubbleText.Text = $(if ($script:activityDetail) { $script:activityDetail } else { @{working='正在处理你的请求';tool='正在调用工具';editing='正在更新文件'}[$script:mood] })
      $script:bubble.Visibility = [System.Windows.Visibility]::Visible
    } else { $script:bubble.Visibility = [System.Windows.Visibility]::Collapsed }
  }
}
$script:animate.Add_Tick({ Update-Animation })
$script:window.Add_Closed({
  $script:animate.Stop()
  $script:monitor.Stop()
})
$script:monitor.Start()
$script:animate.Start()
Say '嗨～一起写代码吧！' 3
[void]$script:window.ShowDialog()
