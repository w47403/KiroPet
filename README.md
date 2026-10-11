# 🐋 KiroPet · Kiro AI 桌宠 v0.3.1

## v0.3.1 Windows 悬浮窗修复

- 修复 v0.3.0 在 Windows PowerShell 5.1 下启动桌面悬浮窗时的中文编码解析错误：VSIX 打包时强制为 `.ps1` 文件写入 UTF-8 BOM。
- 明确区分「显示桌面悬浮窗」与「打开 IDE 面板」：即使设置了 `desktopMode=panel`，用户手动点击显示桌面悬浮窗仍会优先启动系统浮窗。
- Windows 桌面浮窗仍支持拖动、置顶、右键互动、小/中/大三档尺寸及关闭后重新打开。
- 安装升级后请 **重新加载 Kiro 窗口**，然后运行命令 `鲸鱼娘：显示桌面悬浮窗`。


> 非官方个人同人项目；与 DeepSeek、Kiro、OpenAI 无官方关联。所含鲸鱼主题立绘为专门生成的插画，不是 DeepSeek 官方角色模型或 Live2D 建模文件。

Kiro/VS Code 兼容插件，不消耗模型积分，不读取聊天/思考内容，也不联网。**新版本已换用确认的鲸鱼娘形象，新增 5 种由参考图裁切的静态表情**，状态联动时自动切换。

## 📦 更新安装

1. 打开 Kiro IDE；按 `Ctrl+Shift+P`（macOS 用 `Cmd+Shift+P`）。
2. 运行 **Extensions: Install from VSIX...**，选择 `kiro-whale-pet-0.3.1.vsix`。
3. 如果之前装过 v0.1.0，会以相同的 publisher + name 更新；安装后 **Developer: Reload Window**。
4. 在屏幕右下角找鲸鱼娘；点击 Kiro 底部状态栏的 `鲸鱼娘` 进入控制菜单。

## 关闭之后怎么再开？

- 关闭桌面悬浮窗：右击桌宠 → **退出桌宠**，或通过底部状态栏 → **关闭桌面悬浮窗**。
- **重新打开桌面悬浮窗**：`Ctrl/Cmd+Shift+P` → `鲸鱼娘：显示桌面悬浮窗`。
- **重新打开 Kiro 内面板**：`Ctrl/Cmd+Shift+P` → `鲸鱼娘：打开 Kiro 内桌宠面板`。
- **禁止/恢复 Kiro 下次启动时自动弹出**：点击底部状态栏 → **关闭/开启 Kiro 启动时自动显示**；也可在 `Settings` 搜索 `kiroWhalePet.autoStart`。
- **插件彻底禁用**：Kiro 扩展列表里找到 `Kiro 鲸鱼娘桌宠` → Disable；以后再 Enable 即可。

## 支持平台

| 运行环境 | 桌面悬浮窗 | Kiro 内动画面板 | 依赖 |
| --- | --- | --- | --- |
| Windows 10/11 | ✅ WPF 透明窗、置顶、拖动、右键 | ✅ | Windows PowerShell 5.1 + WPF（随 Windows 预装，可能被公司策略禁用） |
| macOS | ✅ 试验性 Tk 桌面窗 | ✅ | Python 3 + Tk 组件，否则自动退回 IDE 面板 |
| Linux (X11) | ✅ 试验性 Tk 桌面窗 | ✅ | Python 3 + Tk（`python3-tk`），窗口管理器决定透明/置顶效果 |
| Linux (Wayland) | ⚠️ 窗口行为依赖桌面环境 | ✅ | 推荐直接使用 IDE 面板 |

桌面悬浮窗失败会提示并自动打开 Kiro 内面板。设置 `kiroWhalePet.desktopMode = panel` 则完全不启动系统窗。macOS/Linux 桌面悬浮窗与 Windows 的透明度、系统托盘功能并不完全一致；没有强行宣称平台一致性。

## 动画交互

- Windows 桌面窗：待机轻摆、工作时快速浮动、完成时跳动，单击随机互动、拖动、右键调整大小/退出。
- macOS/Linux Tk 窗：上下浮动、点击互动、拖动、菜单退出。
- Kiro 内面板：轻摆、工作/工具调用/文件写入/完成时切换动画；点击互动，提供显示、关闭系统桌宠按钮。
- 以上是 **2D 立绘的程序化变换**，**不是真正 Live2D 骨骼动画**。若要眨眼、视线跟随、头发物理和骨骼网格变形，需要获得分层 PSD 与经过 Live2D Cubism Editor 建模的 `.model3.json` + 模型、动作、纹理素材，依对应 SDK 授权接入渲染器。

## Agent Hooks 工作状态（需要 Kiro IDE 1.x）

菜单 → **为当前项目安装 Agent 联动**，或者 **为所有已打开项目安装 Agent 联动**。

插件经你确认后会为选定本地项目写入独立的 `.kiro/hooks/whale-pet.json`，不会覆盖现有文件。新 Agent 会话生效。Hook 执行无网络请求，不读取 stdin 内容或聊天文本，只在本机状态文件里记录：

| Agent 事件 | 桌宠状态 |
| --- | --- |
| `PromptSubmit` | 开始处理 |
| `PreToolUse` | 准备调用工具 |
| `PostFileSave` | 已修改文件 |
| `AgentStop` | 本轮完成 |

Windows 使用安装时复制到扩展持久目录的 `HookSignal.ps1`；macOS/Linux 使用 `HookSignal.sh`。退出码为 0，避免因桌宠异常干扰 Agent 操作。在 IDE 面板显示**最近事件、项目和经过的秒数**，这是事件经过时间，不是准确 token/内部进度。Hooks 事件触发取决于 Kiro 版本和项目配置。手工中止或异常结束可能没有 `AgentStop`。

**多项目限制：** Kiro IDE 1.x 的项目 Hook 仍需按工作区安装；可以一键为当前所有已打开项目安装，也可以手动打开配置 `kiroWhalePet.autoInstallHooksNewProjects`，使后来新打开的工作区自动安装。对于**没有打开过、也没有安装 Hook 的项目，无法实现实时监控**。Kiro CLI V3 支持 `~/.kiro/hooks/` 全局 Hook，但官方只明确了其 CLI 范围，不代表 IDE 的全局 Hook 也已支持。

**私有思考/token 限制：** 没有使用私有接口、逆向或截获 Kiro 流量；插件不能可靠读取 AI 私有思考、精确 token、服务器侧步骤百分比。使用 Kiro 官方可用事件而非假进度条。

## 文件与构建

- `src/extension.js`：扩展入口、全平台 Webview、菜单、状态追踪、Hooks 安装。
- `scripts/WhalePet.ps1`：Windows 桌面宠物。
- `scripts/WhalePet.py`：可选 macOS/Linux Tk 窗口。
- `scripts/HookSignal.ps1` / `.sh`：Hook 事件转本地状态 JSON。
- `assets/whale-girl.png`：当前确认的人设主视图；`assets/moods/`：待机、开心、拥抱、睡觉、完成的静态动作素材。
- `assets/reference/whale-girl-approved-concept.webp`：确认人设的参考图压缩备份。
- `build_vsix.py`：纯 Python VSIX 生成器。

用 `python build_vsix.py` 生成包，或使用 `@vscode/vsce`。没有 npm 运行时依赖。

## 已检查与尚未实测

- ✅ JS 语法、Python 语法、VSIX 文件及 Hook 命令生成的自动测试。
- ⚠️ Windows WPF GUI、Kiro 安装和系统策略需在用户机器验证；当前开发环境不是 Windows，**不能声称已经在 Windows Kiro 上实际打开 GUI**。
- ⚠️ macOS、Linux 原生窗口/透明度取决于系统与 Tk 安装，未在这些桌面环境分别实测。

## GitHub 源码同步与自动打包

- 在 `main` 分支提交更新后，GitHub Actions 会自动检查 JS/Python/Bash 语法并生成 VSIX；可在仓库 **Actions → Build KiroPet → Artifacts** 下载。
- 要保留可长期分享的安装包，创建 `v0.2.0` 这类版本标签并推送；CI 将为标签创建 GitHub Release 并上传对应 VSIX（GitHub Actions 要允许写入 `contents`）。
- 私有仓库的内容和安装包仅对有权限的 GitHub 用户可见。分享给朋友可在 **Settings → Collaborators** 邀请对方，或者单独发送你审核过的 `.vsix`。
- 本仓库**不会自动把 ChatGPT 对话里的改动上传**；每次修改都需要执行一次 Git 提交和推送。GitHub Actions 自动打包的是已经推送到 GitHub 的代码。
- 源码仓库为 [`w47403/KiroPet`](https://github.com/w47403/KiroPet)，当前为私有仓库，拥有访问权限才可以查看和克隆。

## AI 消息可见性说明

当前 v0.3.0 仅依据已配置的 Agent Hooks 感知任务开始、工具、文件变更、正常结束，并显示本地状态提示。**尚不读取 Kiro 聊天窗口具体文本，也不自动发送快捷追问**，因为不存在已验证的公开、稳定的 Kiro 消息读取与发送接口。今后若 Kiro 提供可靠接口可逐步扩展。
