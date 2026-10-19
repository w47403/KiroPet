# v0.9.0 动画优化与验收记录

2026-10-17。四批六轮开发已落实，最终统一交付 v0.9.0；v0.8.1 为第一批中间版本。安装体验由用户最后验收。

| 批次 / 轮次 | 已完成内容 | 验证 |
| --- | --- | --- |
| 一 / 1 | 帧边界调度、预加载解码、事件刷新、组合暂停恢复 | JS 时间边界与真实浏览器加载 |
| 二 / 2 | 缩短开场、收尾与循环；工具保留安静思考 | 完整任务事件流程与前后对比页 |
| 二 / 3 | 8 张工作补帧，工作/编辑扩为 16 帧；固定桌面桌腿 | 新帧像素一致性、透明度与人工查看 |
| 三 / 4 | 16 张坐下和侧躺图；进入、停留、起身；调整待机权重 | 姿势路径检查、待机打断测试 |
| 三 / 5 | 工作/坐/卧的摸头回应；恢复原动作时钟；落地恢复 | JS、WPF、浏览器互动检查 |
| 四 / 6 | 图片缓存去重、五档尺寸、连续事件压力测试、打包与验收页 | WPF 离屏布局、浏览器、VSIX 资源检查 |

## 可见变化

| 动作 | 原时长 | 当前时长 | 帧数 |
| --- | --- | --- | --- |
| 工作开场 | 5.40s | 2.08s | 8 |
| 工作打字循环 | 3.12s | 2.24s | 8 → 16 |
| 编辑循环 | 2.24s | 1.76s | 8 → 16 |
| 工作间歇 | 7.20s | 3.00s | 8 |
| 完成收尾 | 6.20s | 2.64s | 8 |
| 摸头 | 2.00s | 1.50s | 8 |

坐姿整段 8.2s，侧躺整段 10.9s，包含过渡和中途休息。短动作结束后回站立，再等待 22～45s 才选择下一个动作。工具循环使用前半段安静姿势。新任务和明确结束事件仍优先；拖动期间接收的新状态松手后生效。

摸头不打断摆桌子、完成、姿势转换和吃饭，改用气泡回应。普通站立、桌前、坐姿、卧姿各有适合的回应，结束后恢复背景动作时钟。

## 素材与构建

- `assets/animations/source/work_bridge.png`：8 张新增工作绘图。
- `assets/animations/source/sit_down.png`：8 张坐下过渡，反序用于起身。
- `assets/animations/source/lie_down.png`：8 张侧躺过渡，反序用于坐起。
- `scripts/animation-base.json`：优化前清单，供编排与对比使用。
- `scripts/optimize_animation_assets.py`：确定性切图、统一画布、邻格残片清理、桌面锁定和动作编排，不凭算法重绘人物。
- 21 段序列引用 152 张不同图片；原 136 张播放素材保留，新增 24 张，原工具图片被复用的思考片段替代引用。
- 原始 PNG 纳入源码但不进入安装包；Tk 预缩放图与桌面标准图随包提供。构建和 CI 自动应用优化。

## 验证与限制

最终回归结果：29 项 JavaScript 测试、19 项 Python 测试、WPF 验证与真实浏览器检查全部通过。

- JS 覆盖换帧、循环、组合暂停、工具切换、互动恢复、拖动及落地；模拟一小时混合事件。这是模拟时钟测试，不是实际挂机一小时。
- Python 检查透明边界、独立绘图、共享引用、桌面锁定、动作路径、行为与包内资源。
- Windows WPF 实际解码全部引用图片，离屏验证工作/完成/拖动/互动，以及 100、140、190、260、320px 布局和缓存去重。
- Headless Edge 加载真实面板 HTML，152 张引用图片全部解码成功，页面无脚本错误；检查互动恢复、落地、减少动态效果和离线对比页。
- 新切图、面板与对比页截图已人工查看。Kiro 内最终观感、多显示器实用体验仍待用户验收；macOS/Linux 原生 Tk 窗口未在对应系统实测。有限帧原画仍存在风格和姿势差异，不宣称达到骨骼动画或影视补间水平。

## 验收方式

1. 打开项目上级 `output/animation-review-v090.html`，选择动作对比；可暂停、半速、拖动进度或运行完整工作流程。
2. 安装 `kiro-whale-pet-0.9.0.vsix` 并重新加载 Kiro。
3. 发起一个真实请求，观察开场、工具、编辑和完成；分别在站立与工作时摸头、拖动松手，再观察贴边收起与展开。

## 生成方式与提示词

使用内置 image_gen，透明背景模式；参考现有 PNG 帧或 source WebP，原稿已保存到上述源码路径。未使用 API/CLI fallback。以下为提示词要点，具体播放编排由构建脚本记录。

### 坐下过渡

Production transparent sprite sheet of the exact same blue whale maid chibi girl. Standing and seated frames are identity and endpoint references. 1536x1024, exactly 4 columns by 2 rows, eight 384x512 cells, real alpha, no text or grid. Fixed camera and head size. Upright → slight knee bend → lowering → supported low crouch → hips reach floor → hands settle into lap → adjust shoulders → side-sitting rest. Preserve navy-to-cyan hair, headband, maid dress, white socks, navy shoes and whale tail. Natural anatomy, no props, complete sprite within each cell.

### 工作补帧

Matching companion sheet of eight in-between drawings for the supplied working sheet, between successive original cells and closing the loop. Same 1536x1024 4x2 layout, transparent background. Preserve face, head size, hair, clothes, feet, tail, chair, laptop and wooden desk. Tiny alternating hand/finger motion, gradual expression changes and small hair/tail follow-through. Lock furniture positions; no camera changes, large gestures or cropped limbs. Clean navy outlines and soft anime shading.

### 侧躺过渡

Eight consecutive drawings of gently lying down from side-sitting into a curled side-lying rest hugging the whale tail. Same character and costume, 1536x1024 4x2 sheet, real alpha, no text or props. Seated → support hand to floor → lean shoulder → lower elbow → lower head and shoulders → hug tail → settle cheek → final curled resting pose. Fixed camera and head scale, naturally lowering head, complete limbs and safe margins.
