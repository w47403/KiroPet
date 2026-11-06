# 🐋 KiroPet · 鲸鱼娘 AI 桌宠 v0.13.0

Kiro / VS Code 兼容扩展。鲸鱼娘根据 Kiro 已保存的本地会话事件显示工作、工具、编辑和明确完成状态，并可展示最新回答摘录。动画已全量替换为 [dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet) 的 95 个透明动作，保留原视频帧率与完整动作时长；运行时不调用模型、不发送聊天消息、不联网。

非官方个人自用项目，与 DeepSeek、Kiro、OpenAI 无官方关联。第三方动画来源、署名和禁商用条款见 [资源许可说明](../THIRD_PARTY_ASSETS.md)，不属于本扩展的 MIT 源代码授权范围。

## 安装与开始使用

1. 在 Kiro 中打开本地项目，运行 **Extensions: Install from VSIX...**，选择 `kiro-whale-pet-0.13.0.vsix`。
2. 安装后运行 **Developer: Reload Window**。默认自动显示“小小只（140px）”桌面悬浮窗。
3. 在 Kiro 原生聊天里发起一轮新请求。默认读取 `~/.kiro/sessions`，**无需安装 Hook**。
4. 点击底部状态栏「鲸鱼娘」打开菜单。若系统浮窗启动失败，会提示原因并打开 IDE 内面板。

启动时跳过已有对话历史。安装、重新加载或更换会话目录后，需要发起新一轮请求。普通切换回答摘录开关或增减工作区，不会丢失仍在监听范围内的任务。

## 日常操作

- **重新显示 / 关闭浮窗**：状态栏菜单，或命令「鲸鱼娘：显示桌面悬浮窗 / 关闭桌面悬浮窗」。
- **打开 IDE 面板**：命令「鲸鱼娘：打开编辑器内桌宠面板」。
- **摸头与拖动**：轻点互动；移动超过 8px 进入拖动，松手恢复当前任务。仅左右两侧可吸附并收起，鼠标靠近展开；顶部和底部不吸附，靠近左右角落也不自动调整高度。
- **位置和偏好**：按当前工作区组合保存位置、尺寸、气泡静音、吸附及完成时自动展开的选择。Windows 右键可调整尺寸；新修改的 IDE 尺寸设置优先。
- **完成时保持收起**：桌宠右键 →「完成时自动展开：开启 / 关闭」。收起后的徽标仍显示完成状态。
- **全部动作**：Windows / Tk 右键菜单 →「全部动作（95）」；IDE 面板使用「全部动作」下拉框。选中的动作播放一次后恢复任务；新工作事件会接管演示。待机持续呼吸，间隔穿插日常、美食、节日等动作。
- **手动演示与诊断**：状态栏菜单中的同名子菜单；面板中展开同名区域。手动状态会被后续真实 AI 事件接管。

每个 IDE 窗口拥有自己的活动状态和桌宠。不同窗口不会互相清空状态；同一窗口打开多个项目时，优先显示尚在工作的会话。此版不提供跨窗口全局单实例汇总。

## 设置

从状态栏菜单或面板点击「设置」，也可在设置中搜索 `kiroWhalePet`。

| 设置 | 默认 | 作用 |
| --- | --- | --- |
| `autoStart` | `true` | Kiro 启动后自动显示 |
| `desktopMode` | `auto` | 系统浮窗；设为 `panel` 则只使用 IDE 面板 |
| `size` | `140` | 默认“小小只”，显示框尺寸100～320；重新打开浮窗生效 |
| `localSessions.enabled` | `true` | 只读监听当前本地项目的会话 |
| `localSessions.directory` | 空 | sessions 根目录；默认 `~/.kiro/sessions` |
| `localSessions.showReplyPreview` | `true` | 显示最新一两句可见回答，最多 90 个 Unicode 字符；可随时切换 |
| `autoInstallHooksNewProjects` | `false` | 仅兼容 Hook 模式下，自动为后来打开的项目安装已授权联动 |

## 联动与隐私

- 只处理已写入本地的真实事件；只在明确 `turn_end / end_turn` 后显示完成。取消、错误和未知结束原因不会伪装成成功；静默也不等于完成。
- 回答摘录仅取 assistant / Say，完成后最多保留 8 秒。Kiro 是否实时保存生成中的回答取决于其版本，不保证逐 token 显示。
- 不提取或展示 Reasoning、提示词、工具参数、工具结果。读取 JSONL 时这些字段可能短暂进入解析内存，持久状态仅保留元数据及启用后的回答摘录。
- 窗口状态保存在扩展全局存储的 `runtime/` 内，并在扩展正常退出时删除；项目 Hook 消息在 `hooks/`，偏好在 `preferences/`。不向远端传输。
- 当前适配 Kiro IDE schemaVersion 1.x / dataModelVersion 1。旧 globalStorage、CLI、SSH/容器中的远端项目不在默认监听范围。

## 常见问题

**一直待机**：确认打开了本地项目，并在重新加载扩展后发起过新请求；运行「鲸鱼娘：诊断本地会话监听」，检查目录、匹配数、格式和读取错误。诊断不输出聊天正文。

**一直工作**：查看最近事件。缺少明确结束记录时会显示「完成状态未确认」，不会按超时编造完成。若 Kiro 升级改变格式，诊断中的不支持格式计数可帮助定位。

**关闭后找不到桌宠**：重新运行「鲸鱼娘：显示桌面悬浮窗」；要关闭下次自动启动，在状态栏菜单切换自动显示。

**关闭回答摘录**：关闭 `localSessions.showReplyPreview`。已显示的摘录立即清除，当前任务和完成监听继续。

**需要旧 Hook 联动**：关闭 `localSessions.enabled`，再从「手动演示与诊断」安装 Agent Hooks。已有、可识别的鲸鱼娘 Hook 会升级并保留 `.bak`；第三方或混合 Hook 不会被覆盖。启用本地监听时，已有桌宠 Hook 会备份移到 `.kiro/whale-pet-backups/`。新 Hook 会话开始后生效。

## 平台支持

| 平台 | 系统浮窗 | 依赖与限制 |
| --- | --- | --- |
| Windows 10/11 | WPF 透明窗、拖动、吸附、右键 | 系统 Windows PowerShell 5.1 + WPF；公司策略可能限制启动 |
| macOS | 试验性 Tk | Python 3 + Tk；透明与窗口行为依系统而异 |
| Linux X11 | 试验性 Tk | Python 3 + Tk，窗口管理器决定透明和置顶行为 |
| Linux Wayland | 依桌面环境 | 建议使用 IDE 面板 |

IDE 面板支持主题、隐藏时暂停和减少动态效果。Tk 目前按主屏幕恢复位置；Windows 支持负坐标显示器和移除显示器后的可见区域恢复。macOS 和 Linux 原生系统上的最终安装观感仍需对应设备验证。

## 开发与验证

开发环境：Node.js 22+、Python 3.12+，重新导入视频需要 Pillow 和 imageio-ffmpeg；旧版素材工具仍使用 NumPy 和 OpenCV（均列在 requirements-dev.txt）。运行扩展本身没有 npm 运行时依赖。

```sh
npm ci
python -m pip install -r requirements-dev.txt
npm run verify
```

该入口执行语法检查、JS 回归、素材构建、VSIX 打包、Python 回归、跨语言换帧边界检查；Windows 还执行原生 WPF 验证。VSIX 输出到项目上级目录。

可选的完整窗口与浏览器检查：

```sh
npx playwright install chromium
npm run verify -- --browser --tk
```

- `KIRO_TEST_PYTHON` 可指定 Python 可执行文件，避免多版本 Python 混用。
- `KIRO_TEST_BROWSER` 可指定已安装的 Chromium / Edge 可执行文件。
- Linux 原生 Tk 检查需要显示服务，可用 `xvfb-run -a npm run verify -- --browser --tk`；需安装 `python3-tk`、`xvfb` 及浏览器所需系统依赖。
- 单独打包：`python build_vsix.py`；导入版直接打包当前清单中的素材，不再执行旧素材的补帧或桌面锁定。PowerShell 文件自动写入 UTF-8 BOM。
- 重新导入：`python scripts/import_dsh_animations.py <dsh-whale-pet源码目录>`，一次性转换全部 95 个 WebM 为透明 PNG，并生成 Tk 尺寸。保留全部源帧；256 色透明调色板压缩减小逐帧包体。
- 三种播放器均按需解码，最多缓存 240 帧；无需在启动时加载全部动作。

源码入口：`src/extension.js`；会话适配：`src/session-monitor.js`；窗口与 Hook 状态：`src/activity-store.js`；原生播放器：`scripts/WhalePet.ps1`、`scripts/WhalePet.py`。动画素材说明见 [动画设计](animation-design.md) 与 [v0.9.0 优化记录](animation-optimization.md)。

## 发布

`main`、PR 和手动运行只生成经过检查的安装包，正式 Release 仅在推送 `v<package.json版本>` 标签时创建。标签版本必须与包版本一致；已有 Release 不会被覆盖。CI 安装包附 `SHA256SUMS`，包内 `build-info.json` 记录源码提交与是否存在本地改动。

历史版本见 [CHANGELOG](../CHANGELOG.md)，本版改动的设计和验证边界见 [可靠性记录](reliability-v0100.md)。


## 活跃度与动作设置（0.13.0）

桌宠右键菜单可直接选择“活跃度 → 安静／均衡／活泼”。选择“配置动作池（在编辑器中打开）”，或运行命令“鲸鱼娘：活跃度与动作设置”，即可用中文多选菜单设置各状态动作和排除列表。设置自动保存、立即生效，无需重启；三种播放器共享设置。

- 安静：随机动作播完休息 45～90 秒；均衡：22～45 秒；活泼：8～18 秒。
- 支持待机、睡眠、处理请求、思考、搜索资料、阅读文件、编写代码、修改文件、收到请求、等待确认、发生错误、任务完成共 12 类动作池。
- 工作类动作持续循环；每次重新进入状态随机选一个，有多个候选时避免连续选中上次动作。待机按模式间隔随机活动；完成动作播放一次。空池恢复默认，排除所有候选时以呼吸保底，手动预览不受排除列表限制。
- 状态优先级：报错 > 等待确认 > 收到请求 > 编码／修改 > 阅读 > 搜索 > 思考 > 处理请求。升优先级缓冲 500 毫秒，降级或同级切换缓冲 1.5 秒；重复事件不重置计时。错误提示保留约 3 秒，新任务和明确结束可立即切换。
- 任务状态与动画分开记录，缓冲不会延迟完成记录。多会话中优先展示未完成会话的重要状态，不因另一个会话完成而误报全部完成。
- 细分状态来自本地会话的事件类型和工具名；不读取思考内容。旧版事件联动只提供粗粒度状态时，使用兼容动作。
