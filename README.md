# 🐋 KiroPet · Kiro AI 桌宠 v0.5.3

## v0.5.3 工作动画桌面稳定性修复

- 修正工作/修改文件/工具与工作间歇的桌面逐帧定位：以桌面木纹的水平边缘为基准，在打包阶段统一画面位置，降低桌子和人物整体上下颠簸。工作开场最后一帧与收尾第一帧也参与对齐。
- 只平移整张透明帧，不拉伸人物、不改变原有表情动作；限制位移避免裙摆、鞋子、尾巴被裁切。同步修正 Windows/Kiro 面板使用的 PNG 与 macOS/Linux Tk 的 190px 帧。
- GitHub Actions 会在测试、打包之前执行 `scripts/stabilize_work_frames.py`，本地需要先安装 Pillow 并执行 `python scripts/stabilize_work_frames.py` 再运行 `python build_vsix.py`。重新用 `scripts/prepare_animation_assets.py` 生成素材时也会自动校准。
- 这是**桌面位置稳定性**修复，不会自动重新绘制原画；不同帧绘制的桌宽、发型与脸型细节仍可能存在差异，彻底统一需要继续重绘源分格图。


## v0.5.2 坐姿修正、吃白饭与拎后领拖动

- 重画侧坐待机，裙摆、两条袜腿和两只鞋分开，替换原先鞋尖挤在一起的盘腿姿势。
- 随机待机新增三段：站着舀白饭、抱大碗嚼饭、坐小凳吃完最后一口并摸肚子。每段只播放一次，然后安静保持休息姿势，不连续扒饭。
- 移动超过 8px 才进入拖动：后领被拎起，悬空踢腿、挥手、鼓脸，拖动期间持续循环。轻点仍是摸头；松手或丢失捕获后结束挣扎，恢复原任务或待机，边缘吸附继续生效。
- 拖动冻结底层动画时间；期间的新 AI 事件仍被接收，松手后按最新状态播放。Windows 改用鼠标捕获移动，避免系统 `DragMove` 的模态循环阻塞动画。
- 当前共 17 段动画、136 张播放帧。生成方式、完整提示词和原稿路径见 [v0.5.2 素材记录](docs/animation-prompts-v052.md)。

v0.5.1 保持 WPF 吸附动画的最终位置，并对应用的真实动画时钟做精确寻址验证，避免云端绘制节奏导致测试偶发失败；发布构建等待 Windows 检查通过后才执行。

## v0.5.0 多姿势、安静待机与边缘收起

- 工作拆成“启动 → 持续工作与穿插动作 → 完成”：约 5.4 秒拉桌子、拿电脑、开盖；随后在桌前打字，每 18～35 秒穿插约 7.2 秒托腮、看屏幕、靠椅伸懒腰；完成时约 6.2 秒合电脑、收桌子、起身庆祝。
- 新增站立转身迈步、盘腿坐、抱尾巴侧躺、跪坐伸懒腰。共 13 段动作、104 张播放帧，保持第六版二头身形象。工具和文件事件延续当前任务，不重复摆桌子；新的 `PromptSubmit` 才重新开场。
- 待机先保持静止 22 秒；随后从站着眨眼、转身迈步、坐着、躺着、伸懒腰中选择一个短动作，播放一次后静静保持姿势 18～45 秒，相邻动作不会重复。新工作事件立即打断待机。
- 工作气泡持续显示实际事件。Kiro 提供 Hook JSON 时显示工具名称与文件名，例如“正在读取文件 · README.md”；工具返回后提示继续处理。旧版本没有元数据时保留事件级提示。
- 把桌宠拖到屏幕边缘 36px 内，松手后平滑吸附；离开约 1.2 秒后滑入边缘，保留 26px 鲸鱼标签。鼠标靠近展开，右键可关闭吸附。角落同时对齐两条边。
- Windows 使用 340ms 三次缓出动画，按鼠标所在显示器的工作区及 DPI 计算位置；Tk 使用 16ms 动画调度，暂按主屏幕尺寸计算，系统窗口管理器可能限制移出屏幕。

升级 VSIX 并重新加载 Kiro 后，再运行“鲸鱼娘：为当前项目安装 Agent Hooks”更新已有联动。插件仅更新自己生成的 Hook，并保留 `.bak` 备份；其他配置会跳过。

## v0.4.0 鲸鱼娘逐帧动画

换用确认的第六版大头短身鲸鱼娘，新增 **7 段动画、56 张独立绘制的透明帧**。Windows WPF 桌面窗、Kiro 内面板与 Python/Tk 桌面窗都按同一份帧时长清单播放，原有整张立绘缩放、旋转、上下平移效果已移除。

| 状态 | 动作 | 播放方式 |
| --- | --- | --- |
| 待机 idle | 安静站立，偶尔眨眼及切换坐、躺、伸懒腰 | 短动作之间长时间静止 |
| 处理中 working | 摆桌子、拿电脑 → 桌前打字，穿插托腮/伸懒腰 | 开场一次，工作循环 |
| 调用工具 tool | 当前工作桌前查看屏幕/思考 | 延续任务，不重播开场 |
| 修改文件 editing | 交替敲键盘、眨眼、摆尾 | 循环 |
| 完成 done | 合电脑、收桌子、起身庆祝 | 约 6.2 秒，播放一次后安静站立 |
| 摸头 hug | 捧脸、张开双臂、回到放松姿势 | 播放一次后回到当前状态 |
| 休息 sleep | 抱尾巴侧躺、合眼打盹 | 缓慢循环，手动选择 |

面板隐藏时暂停动画时钟；重新显示后继续。帧图按动作缓存，桌面状态文件以 700ms 间隔检查，播放计时器为 80ms。无需网络、额外 Electron、Pillow 或动画 SDK。Python/Tk 默认 190px 有预缩放素材；其他尺寸使用 Tk 原生整数缩放，观感可能与 WPF 不完全一致。

这是实际逐帧的 2D 有限动画，包含角色部位和表情变化；不是 Live2D 骨骼模型，也没有承诺影视级补间。素材说明、生成提示词和开发验证见 [动画说明](docs/animation-design.md)。

## v0.3.1 Windows 悬浮窗修复

- 修复 v0.3.0 在 Windows PowerShell 5.1 下启动桌面悬浮窗时的中文编码解析错误：VSIX 打包时强制为 `.ps1` 文件写入 UTF-8 BOM。
- 明确区分「显示桌面悬浮窗」与「打开 IDE 面板」：即使设置了 `desktopMode=panel`，用户手动点击显示桌面悬浮窗仍会优先启动系统浮窗。
- Windows 桌面浮窗仍支持拖动、置顶、右键互动、小/中/大三档尺寸及关闭后重新打开。
- 安装升级后请 **重新加载 Kiro 窗口**，然后运行命令 `鲸鱼娘：显示桌面悬浮窗`。


> 非官方个人同人项目；与 DeepSeek、Kiro、OpenAI 无官方关联。所含鲸鱼主题立绘为专门生成的插画，不是 DeepSeek 官方角色模型或 Live2D 建模文件。

Kiro/VS Code 兼容插件，不消耗模型积分，不读取聊天/思考内容，也不联网。工作状态来自 Agent Hooks；逐帧素材随插件离线打包。

## 📦 更新安装

1. 打开 Kiro IDE；按 `Ctrl+Shift+P`（macOS 用 `Cmd+Shift+P`）。
2. 运行 **Extensions: Install from VSIX...**，选择 `kiro-whale-pet-0.5.3.vsix`。
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

- Windows 桌面窗：多姿势逐帧动作、点击摸头、拖动、边缘吸附收起、右键选择状态和调整大小。
- macOS/Linux Tk 窗：同一套逐帧动作、点击摸头、拖动、菜单退出。
- Kiro 内面板：相同动作与安静待机节奏，提供工作状态、休息和桌面窗控制按钮。系统减少动态效果偏好开启时展示当前动作首帧。IDE 面板本身不移动或吸附桌面边缘。
- 新 Agent 事件优先于互动动作；完成动作不会不断重复跳跃。休息是手动展示状态，不推断 AI 的真实内部活动。

## Agent Hooks 工作状态（需要 Kiro IDE 1.x）

菜单 → **为当前项目安装 Agent 联动**，或者 **为所有已打开项目安装 Agent 联动**。

插件经你确认后会为选定本地项目安装或更新 `.kiro/hooks/whale-pet.json`，新 Agent 会话生效。Hook 读取 Kiro 通过 stdin 提供的 JSON，仅保存事件、工具名、文件 basename、项目及时间；不保存提示词、工具结果、文件内容或命令参数。官方行为见 [Kiro Hooks](https://kiro.dev/docs/hooks/)。

| Agent 事件 | 桌宠状态 |
| --- | --- |
| `PromptSubmit` | 开始处理 |
| `PreToolUse` | 准备调用工具 |
| `PostToolUse` | 工具已返回，继续处理 |
| `PostFileSave` | 已修改文件 |
| `AgentStop` | 本轮完成 |

Windows 使用扩展持久目录的 `HookSignal.ps1`；macOS/Linux 使用 `HookSignal.sh` 调用 `status_signal.py`（需要 Python 3）。退出码为 0，避免因桌宠异常干扰 Agent 操作。桌面与面板持续显示工作提示，面板另显示事件时间。具体工具信息取决于 Kiro 是否提供元数据；手工中止或异常结束可能没有 `AgentStop`。

其他扩展也可调用 `vscode.commands.executeCommand('kiroWhalePet.reportActivity', {state:'tool', project:'项目', detail:'正在搜索代码', phase:'continue'})` 提供实际工作说明。新任务传 `state:'working', phase:'start'`，完成传 `state:'done', phase:'finish'`；该命令不自动连接 ChatGPT 或读取其他应用聊天。

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
- ✅ Windows WPF 实际解码全部帧、离屏渲染、负坐标屏幕的角落吸附/收起/展开已验证；Kiro 实际安装与用户多屏幕配置仍需安装后检查。
- ⚠️ macOS、Linux 原生窗口/透明度取决于系统与 Tk 安装，未在这些桌面环境分别实测。

## GitHub 源码同步与自动打包

- 在 `main` 分支提交更新后，GitHub Actions 会自动检查 JS/Python/Bash 语法并生成 VSIX；可在仓库 **Actions → Build KiroPet → Artifacts** 下载。
- 要保留可长期分享的安装包，创建 `v0.2.0` 这类版本标签并推送；CI 将为标签创建 GitHub Release 并上传对应 VSIX（GitHub Actions 要允许写入 `contents`）。
- 私有仓库的内容和安装包仅对有权限的 GitHub 用户可见。分享给朋友可在 **Settings → Collaborators** 邀请对方，或者单独发送你审核过的 `.vsix`。
- 本仓库**不会自动把 ChatGPT 对话里的改动上传**；每次修改都需要执行一次 Git 提交和推送。GitHub Actions 自动打包的是已经推送到 GitHub 的代码。
- 源码仓库为 [`w47403/KiroPet`](https://github.com/w47403/KiroPet)，当前为私有仓库，拥有访问权限才可以查看和克隆。

## AI 消息可见性说明

当前版本依据已配置的 Agent Hooks 感知任务开始、工具、文件变更、正常结束，并显示事件提供的工具名与文件名。不读取聊天正文或模型内部思考，也不自动发送追问。
