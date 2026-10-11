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
$script:arts = @{'idle' = $bmp}
$script:artFolder = Join-Path (Split-Path -Parent $AssetPath) 'moods'
foreach ($name in @('idle','happy','hug','sleep','done')) {
  try {
    $file = Join-Path $script:artFolder ($name + '.png')
    if (Test-Path -LiteralPath $file) {
      $frame = New-Object System.Windows.Media.Imaging.BitmapImage
      $frame.BeginInit(); $frame.UriSource = [System.Uri]::new($file, [System.UriKind]::Absolute)
      $frame.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
      $frame.EndInit(); $frame.Freeze()
      $script:arts[$name] = $frame
    }
  } catch { }
}
function Switch-Art([string]$name) {
  if ($script:arts.ContainsKey($name)) { $script:picture.Source = $script:arts[$name] }
}


$script:transform = New-Object System.Windows.Media.TransformGroup
$script:scale = New-Object System.Windows.Media.ScaleTransform
$script:rotate = New-Object System.Windows.Media.RotateTransform
$script:move = New-Object System.Windows.Media.TranslateTransform
[void]$script:transform.Children.Add($script:scale)
[void]$script:transform.Children.Add($script:rotate)
[void]$script:transform.Children.Add($script:move)
$script:picture.RenderTransform = $script:transform
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
  if ($script:mute) { return }
  $script:bubbleText.Text = $message
  $script:bubble.Visibility = [System.Windows.Visibility]::Visible
  $script:bubbleUntil = [DateTime]::UtcNow.AddSeconds($seconds)
}

function Apply-Size([int]$newSize) {
  $script:whaleSize = $newSize
  $script:window.Width = $newSize + 42
  $script:window.Height = $newSize + 76
  $script:picture.Width = $newSize
  $script:picture.Height = $newSize
  $script:bubbleText.MaxWidth = $newSize + 18
}

function Add-MenuItem([System.Windows.Controls.ContextMenu]$menu, [string]$label, [scriptblock]$clicked) {
  $entry = New-Object System.Windows.Controls.MenuItem
  $entry.Header = $label
  $entry.Add_Click($clicked)
  [void]$menu.Items.Add($entry)
}

$menu = New-Object System.Windows.Controls.ContextMenu
Add-MenuItem $menu '🐋 摸摸鲸鱼娘' { Say $script:phrases[(Get-Random -Maximum $script:phrases.Count)] }
Add-MenuItem $menu '💻 工作中' { $script:mood = 'working'; Switch-Art 'happy'; Say '正在认真写代码！' }
Add-MenuItem $menu '✨ 完成啦' { $script:mood = 'done'; Switch-Art 'done'; Say '任务完成！辛苦啦～' }
Add-MenuItem $menu '💤 休息一下' { $script:mood = 'idle'; Switch-Art 'idle'; Say '休息一会儿也不错～' }
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
  try { $script:window.DragMove() } catch { }
  $after = [System.Windows.Forms.Cursor]::Position
  $d = [Math]::Abs($before.X - $after.X) + [Math]::Abs($before.Y - $after.Y)
  if ($d -lt 8) { Switch-Art 'hug'; $script:reactionUntil = [DateTime]::UtcNow.AddSeconds(2); Say $script:phrases[(Get-Random -Maximum $script:phrases.Count)] }
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
        $eventKey = "$($event.at)|$($event.state)|$($event.project)"
        $project = [string]$event.project
      } else {
        # Compatible with events written by v0.1.x.
        $next = $raw
        $eventKey = $raw
        $project = ''
      }
      if ($eventKey -ne $script:lastEventKey) {
        $script:lastEventKey = $eventKey
        $script:lastState = $next
        $projectHint = if ($project) { "[$project] " } else { '' }
        switch ($next) {
          'working' { $script:mood = 'working'; Switch-Art 'happy'; Say "${projectHint}Kiro 正在处理…" 3 }
          'tool' { $script:mood = 'working'; Switch-Art 'happy'; Say "${projectHint}正在调用工具…" 2 }
          'editing' { $script:mood = 'working'; Switch-Art 'happy'; Say "${projectHint}文件更新啦～" 2 }
          'done' { $script:mood = 'done'; Switch-Art 'done'; Say "${projectHint}任务完成啦！✨" 5 }
          'idle' { $script:mood = 'idle'; Switch-Art 'idle'; Say '待机中，随时出发～' 2 }
          'hello' { Say '我在这里～' 2 }
        }
      }
    }
  } catch { }
})

$script:animate = New-Object System.Windows.Threading.DispatcherTimer
$script:animate.Interval = [TimeSpan]::FromMilliseconds(60)
$script:animate.Add_Tick({
  $t = ([DateTime]::UtcNow - $script:tickStart).TotalSeconds
  $script:scale.ScaleX = 1 + 0.015 * [Math]::Sin($t * 2.3)
  $script:scale.ScaleY = 1 + 0.023 * [Math]::Sin($t * 2.3 + 0.3)
  if ($script:reactionUntil -and [DateTime]::UtcNow -gt $script:reactionUntil) {
    $script:reactionUntil = $null
    Switch-Art $(if ($script:mood -eq 'done') {'done'} elseif ($script:mood -eq 'working') {'happy'} else {'idle'})
  }
  $script:rotate.Angle = 1.6 * [Math]::Sin($t * 1.4)
  if ($script:mood -eq 'working') {
    $script:move.Y = 2.8 * [Math]::Sin($t * 4.0)
  } elseif ($script:mood -eq 'done') {
    $script:move.Y = -4 * [Math]::Abs([Math]::Sin($t * 5.0))
  } else {
    $script:move.Y = 2 * [Math]::Sin($t * 1.5)
  }
  if ([DateTime]::UtcNow -gt $script:bubbleUntil) {
    $script:bubble.Visibility = [System.Windows.Visibility]::Collapsed
  }
})
$script:window.Add_Closed({
  $script:animate.Stop()
  $script:monitor.Stop()
})
$script:monitor.Start()
$script:animate.Start()
Say '嗨～一起写代码吧！' 3
[void]$script:window.ShowDialog()
