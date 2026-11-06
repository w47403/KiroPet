<div align="center">

# 🐋 KiroPet · 鲸鱼娘桌宠

**你写代码，她陪你工作。**

为 Kiro / VS Code 兼容编辑器打造的桌宠扩展：透明悬浮窗、任务状态联动、中文动作菜单和可自定义的陪伴节奏。

[使用指南](docs/USAGE.md) · [构建安装包](#从源码构建) · [更新记录](CHANGELOG.md) · [反馈问题](https://github.com/w47403/KiroPet/issues)

<img src="assets/whale-girl.png" width="360" alt="鲸鱼娘待机形象，动画来自 dsh-whale-pet" />

</div>

> **动画来源声明**：本项目当前使用的 **全部 95 个动画均来自 [luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)**，动画并非 KiroPet 原创。该项目的大部分动画进一步来源于 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。感谢原作者的创作与分享！**代码与动画分别授权：代码 MIT，第三方动画不适用本项目 MIT 授权，禁止商业使用。** 完整署名、导入版本及资源条款见 [第三方资源说明](THIRD_PARTY_ASSETS.md)。

## 可以做什么

| 功能 | 说明 |
| --- | --- |
| 透明桌面悬浮窗 | 拖动、摸摸互动、左右边缘吸附收起、完成时自动展开 |
| 跟随真实任务 | 读取 Kiro 本地会话记录，区分阅读、搜索、编码、修改、等待确认、报错与完成 |
| 95 个完整动作 | 中文分类与手动点播；保留源帧率与时长，统一画布避免切换时忽大忽小 |
| 三档活跃度 | 安静、均衡、活泼，按自己的工作习惯选择 |
| 自定义动作池 | 12 类状态可分别多选动作，也能排除不喜欢的自动动作 |
| 更平稳的切换 | 状态优先级与切换缓冲；连续同类事件不反复重播 |
| 回答摘录气泡 | 可选显示最新一两句已保存的可见回答，支持静音与关闭 |
| 编辑器内面板 | 不方便使用桌面窗时，可切换为编辑器内展示 |

**运行时不调用模型、不向远端上传会话、不消耗模型额度。** Kiro 自动联动只适配已支持的本地会话格式；在普通 VS Code 中安装不等于能自动识别其他 AI 扩展，仍可使用桌宠、面板与手动演示。

## 动作预览

以下是导入动画的静态帧，实际使用中连续播放。所有预览素材同样来自上述动画项目。

<table>
<tr><th>编写代码</th><th>阅读记录</th><th>等待确认</th></tr>
<tr>
<td><img src="assets/animations/dsh/coding/0080.png" width="260" alt="编写代码动作" /></td>
<td><img src="assets/animations/dsh/taking_notes/0080.png" width="260" alt="记笔记动作" /></td>
<td><img src="assets/animations/dsh/looking_around/0080.png" width="260" alt="东张西望动作" /></td>
</tr>
</table>

## 安装与开始使用

1. 从 [Releases](https://github.com/w47403/KiroPet/releases) 选择已发布版本；未发布版本可[从源码构建](#从源码构建)。`main` 上通过验证的构建也会保存在 [Actions](https://github.com/w47403/KiroPet/actions) 的 `KiroPet-vsix` 附件中（下载附件需要登录 GitHub）。
2. 在编辑器命令面板运行 **Extensions: Install from VSIX…**，选择 `.vsix` 文件，再运行 **Developer: Reload Window**。
3. 在 Kiro 中打开本地项目，并发起一轮**新的**聊天请求。默认监听 `~/.kiro/sessions`，无需安装额外事件联动脚本。
4. 点击底部状态栏「鲸鱼娘」打开控制菜单，或右键桌宠选择动作与活跃度。

当前源码版本为 **0.13.0**。安装包包含全部透明逐帧素材，体积约 **869 MiB**，请预留下载和解压空间。启动采用按需加载，三种播放器的解码缓存均有上限。

启动时不会回放历史聊天。若一直待机，先运行「鲸鱼娘：诊断本地会话监听」。完整设置、旧版事件联动、平台限制与常见问题见 [使用指南](docs/USAGE.md)。

## 调成你喜欢的节奏

桌宠右键 → **活跃度**，或状态栏 → **活跃度与动作设置**：

| 模式 | 每次空闲随机动作结束后的休息间隔 |
| --- | --- |
| 安静 | 45～90 秒 |
| 均衡（默认） | 22～45 秒 |
| 活泼 | 8～18 秒 |

选择 **配置动作池（在编辑器中打开）**，用中文多选菜单设置各状态的动作、排除列表或恢复默认。设置自动保存并立即同步到播放器。

动作优先展示报错和等待确认；升优先级缓冲 500 毫秒，降级或同级切换缓冲 1.5 秒。新任务与明确结束可以立即切换。工作状态持续循环，待机间隔穿插随机活动，完成动作播放一次。任务状态与动画分开记录，动画缓冲不会延迟完成记录。

## 平台与隐私

- **Windows 10/11**：WPF 透明悬浮窗，使用系统 Windows PowerShell 5.1。
- **macOS / Linux**：Tk 桌面窗为试验性支持，需要 Python 3 + Tk；透明、置顶和位置行为受系统影响。Wayland 建议使用编辑器内面板。
- **数据留在本机**：仅监听当前本地工作区的 Kiro 会话；不提取或展示思考内容、提示词、工具参数及工具结果。回答摘录可关闭。
- **不猜测任务完成**：只认明确的完成事件；取消、报错和长时间静默不会被当作成功。多个会话并行时优先展示未完成的任务。

本项目非官方，与 Kiro、DeepSeek、OpenAI 无官方关联。鲸鱼娘为社区二创形象，不是 DeepSeek 官方形象。

## 从源码构建

需要 Git、Node.js 22+、Python 3.12+。完整仓库包含动画资源，首次克隆耗时较长。

```sh
git clone --depth 1 https://github.com/w47403/KiroPet.git
cd KiroPet
npm ci
python -m pip install -r requirements-dev.txt
python build_vsix.py
```

安装包输出到仓库上级目录。运行回归测试和打包验证：

```sh
npm run verify
```

可选浏览器与原生 Tk 验证、动画重新导入和环境变量配置见 [开发与验证](docs/USAGE.md#开发与验证)。版本标签的自动发布说明见 [发布流程](docs/USAGE.md#发布)。

| 入口 | 职责 |
| --- | --- |
| `src/extension.js` | 编辑器菜单、配置与桌宠启动 |
| `src/session-monitor.js` | 只读会话事件适配 |
| `src/behavior-policy.js` | 状态优先级、缓冲、活跃度与动作池 |
| `src/animation-player.js` | 编辑器内动画播放器 |
| `scripts/WhalePet.ps1` / `WhalePet.py` | Windows WPF / Tk 桌面窗 |
| `scripts/import_dsh_animations.py` | 上游透明视频转逐帧素材 |

## 来源、致谢与许可证

- **直接动画来源**：[luweiyabo/dsh-whale-pet](https://github.com/luweiyabo/dsh-whale-pet)，本项目导入其全部 95 个动作，并借鉴动作触发与配置思路。
- **上游素材项目**：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)。原作者地址和素材条款随仓库保留。
- **形象设计署名**：根据上游说明，原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，DeepSeek 版女仆鲸鱼娘设计出自 [@ZipZipPipe](https://space.bilibili.com/4168597)。上游注明形象采用 **CC BY-NC-SA 4.0**（署名、非商业、相同方式共享）。
- **KiroPet 代码**：采用 [MIT License](LICENSE)。本项目的工作包括编辑器适配、本地事件监听、原生窗口、动作调度、素材转换与测试；不主张动画或角色设计的原创权。
- **动画与衍生图片**：不由本项目重新授予 MIT 权利，仍须遵守上游素材和形象条款；不得据代码的 MIT 许可证将素材用于商业用途。

导入提交、资源路径、逐文件校验信息与原始声明见 [THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md)。

欢迎提交 Issue 与 PR。反馈问题时请附扩展版本、系统、编辑器版本和复现步骤；不要上传私人聊天记录或密钥。贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
