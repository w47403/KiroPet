# 鲸鱼娘逐帧动画设计

> 以下保留早期素材设计记录。v0.9.0 的 21 段序列、工作补帧、姿势过渡和验证范围以 [当前优化记录](animation-optimization.md) 及 manifest 为准；当前播放段不再固定为 8 帧。

采用确认的第六版二头身形象。v0.5.0 使用内置 image_gen 新绘工作开场、桌前打字、桌边思考与伸懒腰、合电脑收桌子庆祝，以及转身迈步、盘腿、侧躺、跪坐伸懒腰。睡眠与侧躺、工作与编辑各使用同组图和不同节奏。13 段播放清单共 104 张帧图；没有通过旋转或缩放静态立绘来合成动作。完整新提示词见 [v0.5.0 提示词](animation-prompts-v050.md)。

每个状态有 8 张独立姿势。属于有限帧动画，细节之间可能仍有手绘式差异；不是 Live2D 模型。`manifest.json` 定义逐帧时长和循环方式，三种运行环境共用。完成播放一次后保持最后姿势，互动结束恢复当前状态，新工作状态优先。

## 状态与素材

| 状态 | 动作 | 循环 |
| --- | --- | --- |
| idle | 安静站立、偶尔眨眼 | 单次，由待机调度选择 |
| sit | 盘腿坐着、歪头、眨眼 | 单次 |
| nap | 抱尾巴侧躺、闭眼、轻醒 | 单次 |
| stretch | 跪坐、抬手、伸懒腰、放松 | 单次 |
| walk | 站立转身、迈步、回头挥手、回到站立 | 单次 |
| work_start | 拉出桌子、取椅子、拿出笔记本、摆放并开盖 | 单次，5.4 秒 |
| working | 桌前打字、视线/手指/尾巴细节 | 是，3.12 秒 |
| work_pause | 托腮、凑近看屏幕、靠椅伸懒腰、回到键盘 | 单次，7.2 秒 |
| tool | 复用 work_pause 桌前查看工具结果 | 循环，延续当前任务 |
| editing | 敲键盘 | 是 |
| done | 合电脑、起身、收桌子、庆祝、安静站立 | 单次，6.2 秒 |
| hug | 捧脸、展开双臂 | 否 |
| sleep | 抱尾巴侧躺，长时间闭眼停留 | 缓慢循环 |

待机从首帧安静停留 22 秒开始，选择与上次不同的小动作，播完后保持最后帧 18～45 秒。JS/Python 注入时钟与随机源可测试；WPF 使用同样的动作清单。工作事件优先，面板隐藏暂停时钟，桌面收起时暂停逐帧绘制。

任务首次进入 working/tool/editing 时开场一次。收到工具/文件事件时保留任务时钟，开场不重新起播；工具完成继续工作。工作循环每 18～35 秒插入一次 work_pause，结束回到打字。`PromptSubmit` 写入 `phase:start`，即使上一轮缺少结束事件也能启动新任务。完成事件可打断开场或循环，直接播放收尾，结束保持安静姿势。

Windows 边缘吸附用 WPF DoubleAnimation、340ms CubicEase EaseOut。四边阈值 36 DIP，角落同时对齐两边；1.2 秒离开延迟后隐藏，仅保留 26 DIP 标签。展开可反向打断当前动画。工作区从鼠标所在显示器取得并转换为 WPF 坐标。Tk 采用相同三次缓出曲线，16ms 定时推进，当前只用主屏幕范围。

## 素材构建

透明 sprite sheet 位于 `assets/animations/source/`，无损 WebP 保留原始 RGBA 像素；PNG 另留本地。`python scripts/prepare_animation_assets.py` 仅开发时需要 Pillow，按四列两行切分；侧躺/工作图沿网格附近透明间隙寻找切线，避免生成图轻微偏移造成截断。同一张表统一缩放、留白，输出固定画布和 Tk 190px 预缩放帧，保持原本绘制的姿势变化。

- 播放帧：`assets/animations/<state>/00.png` 至 `07.png`，256×342，透明背景。
- Tk 帧：`assets/animations/tk/190/<state>/00.png` 至 `07.png`，142×190。
- manifest：`assets/animations/manifest.json`。
- 原始素材不进入 VSIX，保持安装包体积；素材和提示词保留在仓库便于维护。

## 开发验证

- `node --test test/*.test.js`：帧时长边界、互动恢复、事件打断、完成重播、面板暂停与恢复、实际生成的 Webview 脚本。
- `python build_vsix.py` 后执行 `python -m unittest discover -s test -p 'test_*.py'`：RGBA 透明度、每段 8 帧内容不同、VSIX 文件/BOM、待机调度、吸附几何、真实 stdin Hook 元数据与无效输入。
- Windows：`powershell.exe -NoProfile -STA -File test/verify-wpf.ps1`：实际 WPF 解码和离屏渲染。输出位于 `output/wpf-validation/`。
- 跨平台 Tk 需要对应平台手动验证窗口管理器的透明与置顶行为。

## v0.4.0 原始提示词（working / sleep 已由 v0.5.0 替换）

### idle

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: IDLE cheerful standing with relaxed arms. Eight phases: 1 eyes open, tail neutral; 2 tail bends slightly upward and hair tips follow; 3 eyes half-closing, tail lifted; 4 eyes CLOSED in a blink, shoulders relax; 5 eyes half-opening, tail starts to lower; 6 eyes open again, tail low and hair curls settle; 7 slight content smile, tail returning; 8 nearly frame 1 so loop seamless. Feet planted identically; gentle chest breathing is drawn into individual pose. The eye blink MUST be clearly represented by closed eyelids in frame4. No props.
```

### working

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: WORKING / thinking. No props. Eight chronological poses of her thoughtfully touching chin with right index finger: 1 hand begins near chest, eyes open looking forward; 2 hand rises halfway; 3 finger touches chin, gaze moves gently upward; 4 eyelids half-close and head inclines a tiny amount; 5 eyes briefly close in a thinking blink, finger still on chin, ahoge bends; 6 eyes open looking slightly to her left; 7 hand lowers to chest, tiny curious 'o' mouth; 8 returns to initial thoughtful pose for loop. Left hand relaxed at side. Tail smoothly sways behind her, individual hair curls follow and settle. Keep subtle slightly clueless thinking expression, not an angry or genius face. Feet planted. Eight genuinely different drawings.
```

### tool

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: TOOL USE, holding a cute small navy-and-cyan adjustable wrench. Eight phases: 1 wrench held at chest with RIGHT hand, smiling eyes open; 2 right forearm raises wrench slightly; 3 elbow bends and wrench lifts to shoulder height; 4 wrist turns wrench outward as she looks at it and blinks; 5 wrench lowers in a small careful working arc; 6 she checks the tool with a tiny satisfied smile, left hand gestures toward it; 7 left hand relaxes, right returns near chest; 8 nearly same as frame1. This is a hand tool gesture, not hitting herself. Tail follows small cyclic upward/downward bends, hair tips sway, each arm position is clearly different. Feet planted. Only one small wrench per frame, anatomically correct hands.
```

### editing

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: EDITING FILES / typing on a small navy laptop on a short little simple desk in front of her waist. Character STANDS with shoes and full tail visible, laptop below face, desk just wide enough for laptop, identical desk/laptop size and position in all 8 frames. Eight sequential poses: 1 hands hovering over keyboard, eyes open looking slightly down; 2 left hand presses keys right hand raised a little; 3 right hand presses left hand rises; 4 both hands touch keyboard eyes half-closing; 5 short CLOSED-eye blink while fingers change posture; 6 eyes open, right hand presses keys again; 7 left hand presses, small satisfied smile; 8 returns to initial typing pose. Only arm/hands and eyes move in a subtle realistic alternation, tail sways, hair tips follow. Same grounded body. Do not hide face behind laptop, do not alternate props or laptop orientation. Small clean desk without chair. This must be visibly typing frame by frame.
```

### done

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: DONE / task completed, a SINGLE celebration sequence, NOT a loop. Eight distinct sequential full-body drawings: 1 cheerful open-eye smile hands near chest; 2 bends knees a little preparing to celebrate, hands rise; 3 raises both little arms toward shoulder level, eyes joyful; 4 arms stretch above head and a tiny happy hop with feet slightly above same baseline; 5 landing with knees lightly bent, arms starting to lower and hair tips flutter; 6 happy closed-eye smile making two small fists by cheeks; 7 opens eyes and lowers left hand, right hand forms thumbs up; 8 final relaxed standing with open bright blue eyes, big friendly smile and RIGHT thumbs up held at chest. Tail lifts during cheer then settles, visible motion in hair, ahoge and skirt. Last frame is a pleasing stable pose held after animation. Don't use text, confetti or floating symbols. Exact same anatomy and costume all frames.
```

### hug

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: HUG / reaction to a head pat, single 2-second friendly response. Eight consecutive drawings: 1 open-eye smile with arms down; 2 shoulders rise slightly and hands start to lift; 3 hands raised near cheeks, eyes half-closed happily; 4 eyes CLOSED in a delighted smile, little fists touching cheeks; 5 arms open outward toward viewer in a tiny welcoming hug, face joyful eyes closed; 6 hold open hug with tail lifted and hair curls swaying; 7 arms slowly lower, eyes half-open; 8 arms relaxed, eyes open and happy, close to idle pose. Maintain modest costume and same huge-head tiny-body proportion. No additional person, no hand reaching in from outside, no symbols, no text. Feet planted. The hug is arms opening, not body scaling.
```

### sleep

```text
Use case: stylized-concept. Production sprite sheet for an actual frame-by-frame desktop pet animation. Reference image is approved version 6 character identity ONLY. Draw the exact same cute near-two-head-tall blue whale girl, huge round head, tiny short body, short limbs, navy-to-cyan wavy long hair, whale-flipper ears with pale undersides, whale-spout curled ahoge, white scalloped maid headband, tiny blue bows, navy puff-sleeve maid dress, white whale-emblem scalloped apron, white socks and navy rounded shoes, one curving navy whale tail with horizontal flukes and pale underside. Consistent original anime clean dark navy outlines, soft restrained cel shading.
OUTPUT is ONE TRANSPARENT sprite sheet 1536x1024, EXACTLY 4 columns by 2 rows, eight frames in chronological reading order. Each equal cell is 384x512. Draw exactly ONE complete front-facing full-body character in EVERY cell. Fixed scale, identical camera, stable body center x=192 within each cell, feet baseline at local y=470. Entire headband, ahoge, tail and shoes fit inside each cell with 24 pixel clear margins. No cell borders, no text, no labels, no ground shadows, no checkerboard painted in artwork, no background, real alpha transparency. Frames must be separate and never overlap cell boundaries. Keep each character anatomy and costume consistent across all eight. Make GENUINELY DISTINCT consecutive HAND-DRAWN poses with changing eyes, arms, hair strands, tail shape and body posture, not eight copies and not whole-image rotations or scaling. Smooth small incremental movements and clean silhouette appropriate for looping.
Animation: SLEEP / gentle standing doze loop. No props. Eight full-body sequential drawings with very small smooth changes: 1 half-lidded sleepy blue eyes, relaxed little mouth, hands resting together over apron; 2 eyelids start to close, head bows slightly; 3 eyes CLOSED peaceful, shoulders lower, tail begins relaxing; 4 eyes closed, slight inhale drawn as subtle shoulder/chest change, tiny head tilt; 5 eyes closed, breath out, head nods just a little, tail low; 6 eyes closed, shoulders settle, hair tips sway inward; 7 eyes half-opening into sleepy slit, tiny yawn mouth; 8 returns to frame1 sleepy half-lidded pose. Feet planted consistently. Make sweet gentle sleep, no drool, no sleep bubbles, no text, no floating Z symbols. Only subtle drawn body/face/hand/tail/hair motion, not whole image scaling or rotation.
```
