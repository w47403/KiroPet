# v0.5.0 图像生成提示词

使用内置 image_gen，`transparent_background: true`。角色参考为确认的 v6；姿态灵感为用户本地表情包 contact sheet（盘腿、打盹、伸懒腰）。生成后将源图以保留精确 RGBA 的无损 WebP 保存到 `assets/animations/source/`。侧躺的初次结果边界余量不足，以下为最终采用的提示词。睡眠复用侧躺原图，按不同帧时长播放。

## sit

```text
Use case: stylized-concept. Production transparent animation sprite sheet for the approved two-head-tall whale maid girl. Image 1 is identity reference: navy to ocean blue long wavy hair, fin ears, single curled ahoge, white maid headband, navy dress, white whale apron, short legs, blue eyes, whale tail. Image 2 is pose inspiration only. Exactly 8 sequential full-body frames in a perfectly regular 4 columns by 2 rows grid, canvas 1536x2048, cell 384x1024? Use landscape canvas 1536x1024 with each cell 384x512. No labels/grid/text/background/shadow. Each frame same scale and ground baseline with comfortable transparent margins. Animation: sits cross-legged on floor, hands resting on knees, quietly looks ahead, blink slowly, tiny head tilt then returns to neutral. All eight frames SEATED, body below oversized head, tail rests curled at side. Calm slight goofy pleasant expression, no energetic arm waving. Frames 0 and 7 identical pose intent for seamless return, independently drawn. Preserve approved clean polished anime illustration and identity. Transparent background with actual alpha. Do not copy text from references.
```

### sit 追加修正（最终采用）

```text
Edit this transparent 8-frame 4x2 seated whale-girl sprite sheet for production safety. Keep same character identity, seated cross-legged animation, expressions and anime drawing style. Keep canvas1536x1024 with exactly8 equal384x512 cells. Reduce each character to a maximum300px wide and390px tall, center each character within its exact cell. All tails, fin ears and ahoge completely drawn within each own cell with at least40px transparent margin at left and right; do not clip any tail and do not include any neighboring character fragments. Entire first row stays within y0..512; secondrow within y512..1024. Ground baseline at local y460, same size and baseline all8frames. Clear transparent alpha background no labels effects text shadows borders. Calm idle seated sequence: open eyes, slow blink, slight head tilt, curious gaze, gentle blink, small puzzled mouth, returns soft neutral smile. Full tail tip in every frame.
```

## nap / sleep

```text
Transparent production SPRITE SHEET exactly8 fullbody poses in PERFECT 4 columns2 rows landscape1536x1024 equal384x512 cells. Character identity from reference near-two-head-tall blue whale maid girl. All poses LYING CURLED SIDEWAYS with her navy tail hugged as pillow, knees tucked and eyes drowsy, long blue hair, fin ears headband apron and ahoge. IMPORTANT keep each character only 280px wide and 220px tall, centered at x192 of its cell, feet baseline y440 in row1 and y952 in row2. At least50px transparent space at left and right. Row1 entirely INSIDE y0..512, row2 entirely inside y512..1024. Do not overlap grid cell or row boundaries. Camera fixed and identical character scale, ground baseline stays consistent. Sequence0 lying awake,1 eyelids lowering,2 eyes closed,3 small exhale,4 nuzzles pillow,5 softly asleep,6 half-open eyes,7 relaxed awake same as0. Every character fully drawn and complete, eight independent poses. Polished anime chibi matching approved image. No standing/sitting, no background, cast shadows, letters, effects, labels, watermarks or borders. Genuine transparent alpha outside each small character.
```

## stretch

```text
Use case stylized-concept. Transparent animation sheet EXACTLY 8 sequential frames in regular 4 columns x2 rows landscape 1536x1024. Identity image1 approved near-two-head-tall navy/ocean-blue whale maid girl; image2 inspiration for yawn and stretch. Each 384x512 cell contains whole character with 30px clear margins on all sides, none crosses boundaries. Ground feet stay aligned, same character scale. Sequence: frame0 relaxed seated on knees, frame1 raises arms overhead,2 both arms high yawning,3 leaned backwards gently stretching,4 stretches left,5 stretches right,6 arms lower,7 sits quietly on knees again smiling a little. All eight frames KNEELING with tiny short legs folded underneath, NOT upright standing. Hair fin ears curled ahoge white maid headband navy dress whale apron tail present unchanged. No words, watermarks, labels, symbols, borders, ground, or shadows; genuine transparent alpha outside character. Clean anime illustration matching approved identity. Include every hair lock/tail/hand wholly within each cell, small enough for safety margins.
```

## working（早期草稿，未用于最终工作流程）

```text
Use case stylized-concept. Production animation sprite sheet exactly8 frames 4columns2rows landscape1536x1024, transparent alpha, each cell384x512. Image1 approved identity (two-head-tall whale maid girl blue wavy hair fin ears single curled ahoge white headband navy maid dress white whale apron navy tail), image2 pose inspiration only. Animation SITTING cross-legged with small navy laptop resting on knees. Frame0 watching laptop thoughtfully right hand on chin,1 eyes glance left,2 raises finger tiny idea,3 nods,4 blink,5 tilts head confused a little,6 returns chin gesture,7 watches screen neutral. Small independently drawn hand/eyelid/head movement, all frames SEATED, feet folded, whale tail rests on ground. Keep constant scale and ground baseline, roomy30px transparent margins, all hair tail hands fully inside their own cells. Do not draw standing legs. No letters/symbols/text/watermark/border/shadow/background. Preserve cute slightly airheaded cheerful identity and clean anime polished art. Same pose angle throughout, genuine sequential clip.
```

## work_start（最终）

```text
Use case stylized-concept. Production transparent animation sprite sheet exactly8 chronological fullbody frames in strict4 columns2 rows landscape1536x1024 (384x512 cells). Same approved near-two-head-tall whale maid girl from identity reference. This clip is WORK STARTUP, a narrative animation: 0 stands facing front cheerfully empty hands;1 turns three-quarter and reaches beside her;2 pulls a tiny low wooden desk toward herself, desk entering from side;3 desk now in front of her, she pulls a small blue swivel chair behind;4 sits on the chair and lifts a closed navy laptop out of her apron;5 sets closed laptop on desk;6 opens laptop screen with both hands;7 fully prepared seated behind desk, hands on keyboard ready to type. Long wavy navy-to-ocean-blue hair fin ears single curled ahoge white headband navy dress white whale apron navy whale tail, same character identity and scale all frames. Large head but desk naturally at elbow height with VERY short chibi chair and desk legs. Desk stays centered in foreground once introduced. Frame7 is target for subsequent typing loop. Keep full desk, chair, hair, tail and feet completely inside eachcell with30px transparent margin. Start standing, then physical pulling/placing/opening actions, not 8 seated poses. Clean polished anime art, no words logos symbols shadows background borders. Actual transparent alpha.
```

## working / editing（最终）

```text
Use case stylized-concept. Companion animation to this WORK START sheet: preserve EXACT identity, character scale, brown wooden desk, navy open laptop, blue swivel chair, front facing camera, costumes and desk position from bottom-right frame. Generate 8 sequential WORK LOOP frames in regular4columns2rows transparent sheet1536x1024, cells384x512. All8frames fully at desk with open laptop, seated on chair behind desk (NOT cross-legged on floor). Frame0 two hands keyboard smilingfocused;1 left fingers pressing keys;2 right fingers tapping;3 glance at screen;4 blink whiletyping;5 left handtouchpad;6 right fingers keyboard;7 neutral focus hands keyboard matching0. Independently drawn incremental arms/finger/eye/hair/ahoge/tail movements, smooth relaxed typing loop, no unrelated waving. Entire desk feet chair tail hair fit each cell with24px clear margins, all eight fixed equal scale and camera and baseline. Cute near-two-head-tall whale maid girl navy-to-blue hair whale fins white headband curled ahoge, whale apron navy dress. No text, effects symbols labels borders shadows background. Real transparent alpha.
```

## work_pause / tool（最终）

```text
Use case stylized-concept. Draw complementary long WORK BREAK / thinking animation sheet, EXACT8 sequential frames regular4 columns2rows1536x1024 transparent actual alpha. Keep EXACT same approved whale girl identity, scale, navy open laptop, centered lightbrown wooden desk and blue swivel chair as reference. Fixed front camera deskfeet ground baseline and scene scale. Frames:0 stops typing both hands hover over keyboard;1 left elbow on desk chin in left palm looking at screen;2 rests both cheeks in palms on desk blank slightly goofy thoughtful eyes;3 leans forward inspecting screen and tilts head;4 leans back in swivel chair arms raised overhead for a little stretch;5 shoulders stretching with eyes happily closed, feet tucked forward;6 returns upright at desk and lowers hands;7 hands back on keyboard neutral focused pose like reference ready to continue typing. This is a one-shot desk-side action followed by normal typing, not eight standing poses, not laptop held on floor. Clean polished two-head-tall anime maid whale girl blue gradient long wavy hair fin ears curled ahoge headband apron and tail all unchanged. Whole desk/chair/character/tail inside each384x512 cell with24px transparent margins; no overlaps or croppedtail. No words labels symbols props outside scene castshadows or background.
```

## done（最终）

```text
Use case stylized-concept. Production TASK COMPLETE narrative animation exactly8 chronological full-body frames strict4columns2rows landscape1536x1024 transparent alpha. Image1 is continuity reference for exact wooden desk navy laptop blue swivel chair and girl scale; image2 identity reference when she stands. Frame0 seated at desk typing last keys;1 leans forward closes laptop screen;2 holds closed laptop against chest smiling;3 stands from swivel chair and slides laptop back into apron;4 turns three-quarter and pushes desk and chair toward side;5 desk and chair now gone, turns back front hands raise;6 happy little cheer both hands by cheeks eyesclosed;7 relaxed standing arms down bright gentle smile tail settled. IMPORTANT show actual close/pack/push/stand sequence, not eight typing poses. Desk occupies same position as typing reference frames0-3; after4 furniture leaves scene, by5 none. Entire character incl tail ahoge shoes and full visible furniture portions fitinside own384x512cell,24px clear margins and fixed character size/baseline all8frames. Keep approved near-two-head-tall proportions navy maid dress white whale apron fin ears long blue gradient hair curled ahoge white headband. Clean anime art, no text bubbles symbols effects borders castshadow background. Lastframe pleasing quiet standing pose.
```

## walk（最终）

```text
Use case stylized-concept. New idle movement animation for approved near-two-head-tall whale maid girl, exact identity blue gradient wavy long hair fin ears curled ahoge white headband navy maid dress white whale apron whale tail. EXACT8 sequential fullbodyframes regular4columns2rows1536x1024 transparent alpha cells384x512, roomy30px margins entirebodyhairtailshoes visible. This is TURN AND WALK / standing movement, NOT seated. Frame0 front standing relaxed;1 turns threequarter left and looks that way;2 SIDE VIEW walks left, leftfootforward rightfootback arms opposite swing;3 sideview weight shifts rightfootpassing;4 sideview rightfootforward leftfootback arms counter swing;5 turns head back toward viewer while feet settle;6 turns body front with small hand wave;7 front standing arms down neutral, feetplant baseline same as0. Slight drawn body shift within eachcell, consistent character scale and height. Hair and tail follow steps, natural chibi short-legged walk then return. No whole-image rotations and no furniture/props, no words effects labels borders shadows/background. Independently drawn changing body angle and leg poses; make steps obvious. Real alpha outside subject.
```
