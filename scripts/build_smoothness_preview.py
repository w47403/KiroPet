"""Build the offline before/after animation inspector without embedding PNG data.

The before directory is an immutable snapshot. Regenerating this page reads the
current manifest, so it also works when the smoothing pass changes frame counts.
"""

import argparse
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


NAMES = {
    "idle": "站立待机", "working": "工作打字", "editing": "修改文件",
    "work_start": "工作开场", "work_pause": "桌前思考", "tool": "调用工具",
    "done": "完成收尾", "sit": "坐下休息与起身", "nap": "侧躺休息与起身",
    "stretch": "伸懒腰", "walk": "走动", "rice_scoop": "舀饭",
    "rice_hug": "抱碗吃饭", "rice_full": "吃饱休息", "hug": "摸头",
    "drag": "拎起拖动", "sleep": "睡眠", "land": "松手落地",
    "work_pet": "工作时摸头", "sit_pet": "坐着摸头", "nap_pet": "躺着摸头",
}


TEMPLATE = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>鲸鱼娘 · 全动作流畅度对比</title>
<style>
:root{color-scheme:dark;--bg:#10151e;--panel:#19212d;--line:#344150;--text:#e9f0f7;--muted:#a6b6c8;--accent:#86e3cf}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
main{max-width:1180px;margin:26px auto;padding:0 24px 32px}h1{font-size:25px;margin:0}h2{font-size:17px;margin:0}.intro{margin:7px 0 20px;color:var(--muted)}
header{display:flex;align-items:start;justify-content:space-between;gap:20px}.tag{border:1px solid #42645f;color:var(--accent);padding:5px 12px;border-radius:20px;white-space:nowrap}
button,select,input{font:inherit}button,select{padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:#223042;color:var(--text);cursor:pointer}button:hover{border-color:var(--accent)}button:disabled,select:disabled{opacity:.5;cursor:wait}button.active{background:#245a54;border-color:var(--accent)}
.toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:15px 0}.toolbar label{display:inline-flex;align-items:center;gap:6px}.toolbar .spacer{flex:1}input[type=checkbox]{accent-color:var(--accent)}input[type=range]{width:100%;accent-color:var(--accent);cursor:pointer}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}.panel{border:1px solid var(--line);border-radius:14px;padding:17px;background:var(--panel);min-width:0}.heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.counts{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}
.views{display:flex;justify-content:center;align-items:end;gap:20px;min-height:382px;padding:14px 0 10px}.view{display:flex;flex-direction:column;align-items:center;gap:5px}.caption{font-size:11px;color:var(--muted)}
.stage{position:relative;overflow:hidden;flex:none;background-color:#26313c;background-image:linear-gradient(45deg,#35414b 25%,transparent 25%),linear-gradient(-45deg,#35414b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#35414b 75%),linear-gradient(-45deg,transparent 75%,#35414b 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;outline:1px solid #4c5966}
.large{width:256px;height:342px}.small{width:105px;height:140px}.stage img{display:block;width:100%;height:100%;object-fit:contain}.guides .stage:before{content:"";position:absolute;pointer-events:none;left:50%;top:0;bottom:0;border-left:1px dashed #fff9;z-index:2}.guides .stage:after{content:"";position:absolute;pointer-events:none;left:0;right:0;top:96.78%;border-top:1px dashed #f1c982;z-index:2}
.frameinfo{font:12px/1.7 ui-monospace,monospace;color:#c3d3e3;min-height:44px;overflow-wrap:anywhere}.frameinfo .path{color:var(--muted);font-size:11px}.timeline{margin-top:17px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:13px 16px}.timebar{display:flex;justify-content:space-between;gap:15px;font-variant-numeric:tabular-nums}.status{color:var(--accent)}.status.error{color:#ffb2aa}.help{color:var(--muted);font-size:12px;margin:10px 0 0}.clips{display:flex;flex-wrap:wrap;gap:7px;margin-top:17px}.clips button{font-size:12px;padding:6px 10px}.legend{margin:16px 0 0;font-size:12px;color:var(--muted)}
@media(max-width:1000px){.views{gap:10px}.large{width:224px;height:299.25px}.small{width:105px;height:140px}.views{min-height:340px}.panels{gap:10px}.panel{padding:12px}}
@media(max-width:820px){.panels{grid-template-columns:1fr}.large{width:256px;height:342px}.views{min-height:382px;gap:28px}main{padding:0 14px}header{gap:10px}.tag{font-size:12px}.heading{align-items:start}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
</head>
<body><main>
<header><div><h1>鲸鱼娘 · 全动作流畅度对比</h1><p class="intro">用同一个时钟检查帧间跳动、轮廓、桌面位置与动作衔接。</p></div><span class="tag">全部 <span id="clipcount"></span> 个动作</span></header>
<div class="toolbar">
<label>动作 <select id="clip" aria-label="选择动作"></select></label>
<button id="play" type="button">暂停</button><button id="restart" type="button">从头播放</button>
<label>倍速 <select id="speed" aria-label="播放倍速"><option value="0.1">0.1×</option><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
<span class="spacer"></span><label><input id="repeat" type="checkbox" checked>重复检查</label><label><input id="guides" type="checkbox">参考线</label>
</div>
<div class="panels" id="panels">
<section class="panel" aria-label="优化前"><div class="heading"><h2>优化前</h2><span class="counts" id="beforecounts"></span></div><div class="views"><div class="view"><div class="stage large"><img id="beforelarge" alt="优化前原尺寸"></div><span class="caption">原尺寸 · 256 × 342</span></div><div class="view"><div class="stage small"><img id="beforesmall" alt="优化前140像素桌宠"></div><span class="caption">默认高度 · 140 px</span></div></div><div class="frameinfo" id="beforeinfo"></div></section>
<section class="panel" aria-label="优化后"><div class="heading"><h2>优化后</h2><span class="counts" id="aftercounts"></span></div><div class="views"><div class="view"><div class="stage large"><img id="afterlarge" alt="优化后原尺寸"></div><span class="caption">原尺寸 · 256 × 342</span></div><div class="view"><div class="stage small"><img id="aftersmall" alt="优化后140像素桌宠"></div><span class="caption">默认高度 · 140 px</span></div></div><div class="frameinfo" id="afterinfo"></div></section>
</div>
<section class="timeline" aria-label="逐帧检查">
<div class="timebar"><span id="status" class="status" role="status">正在加载当前动作…</span><span id="time">0.000 / 0.000 秒</span></div>
<input id="seek" type="range" min="0" max="1" value="0" step="1" aria-label="同步播放进度（毫秒）">
<div class="toolbar"><button id="prev" type="button">← 上一帧</button><button id="next" type="button">下一帧 →</button><label>逐帧依据 <select id="stepSource" aria-label="逐帧依据"><option value="after">优化后</option><option value="before">优化前</option><option value="both">任一帧变化</option></select></label><span class="spacer"></span><span id="durationdetail" class="counts"></span></div>
<p class="help">拖动进度条会暂停；左右方向键逐帧，空格播放或暂停。两边按相同毫秒播放，各自动作循环按素材定义；非循环动作在末帧停留。“重复检查”会在较长一侧播完后一起回到开头。</p>
</section>
<nav class="clips" id="clips" aria-label="全部动作快捷选择"></nav>
<p class="legend">棋盘表示透明区域。参考线为画布中线和原始 y = 331 的脚底基准，用于观察位置漂移；角色坐下、侧躺和走动时会有正常位移。只加载当前动作的图片，可直接离线打开本页。</p>
</main>
<script>
'use strict';
const DATA = __DATA__;
const ids = ['before','after'];
const $ = id => document.getElementById(id);
const names = [...new Set([...Object.keys(DATA.after.manifest.clips),...Object.keys(DATA.before.manifest.clips)])];
const label = name => DATA.names[name] || name;
let selected = names.includes('working') ? 'working' : names[0];
let elapsed = 0, lastTick = performance.now(), paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let ready = false, loadGeneration = 0, retainedImages = [], duration = 1, timelines = {}, rendered = {};

function durationOf(clip,index){return Math.max(1,Number(clip.durations?.[index] ?? clip.frameDuration ?? 160));}
function buildTimeline(clip){
  if(!clip?.frames?.length)return null;
  const starts=[0];for(let i=0;i<clip.frames.length;i++)starts.push(starts.at(-1)+durationOf(clip,i));
  return {clip,starts,total:starts.at(-1)};
}
function frameAt(timeline,time){
  const {clip,starts,total}=timeline;
  const local=clip.loop ? time % total : Math.min(time,total-0.001);
  let low=0,high=clip.frames.length;
  while(low+1<high){const mid=(low+high)>>1;if(starts[mid]<=local)low=mid;else high=mid;}
  return {index:low,local,path:clip.frames[low],start:starts[low],duration:starts[low+1]-starts[low]};
}
function imageURL(id,path){return DATA[id].base + path.split('/').map(encodeURIComponent).join('/');}
function syncPlayButton(){ $('play').textContent=paused?'播放':'暂停';$('play').setAttribute('aria-pressed',String(!paused)); }
function render(){
  if(!ready)return;
  for(const id of ids){
    const timeline=timelines[id];
    if(!timeline){$(id+'info').textContent='此版本没有该动作';continue;}
    const frame=frameAt(timeline,elapsed);
    if(rendered[id]!==frame.path){const url=imageURL(id,frame.path);$(id+'large').src=url;$(id+'small').src=url;rendered[id]=frame.path;}
    const info=$(id+'info');info.replaceChildren();
    const current=document.createElement('div');current.textContent=`第 ${frame.index+1} / ${timeline.clip.frames.length} 帧 · 当前帧 ${frame.duration} ms · 动作内 ${(frame.local/1000).toFixed(3)} s`;
    const path=document.createElement('div');path.className='path';path.textContent=frame.path;info.append(current,path);
  }
  $('seek').value=Math.round(elapsed);$('time').textContent=`${(elapsed/1000).toFixed(3)} / ${(duration/1000).toFixed(3)} 秒`;
}
function setPaused(value){paused=value;lastTick=performance.now();syncPlayButton();}
function setTime(value){elapsed=Math.max(0,Math.min(duration,Number(value)));lastTick=performance.now();render();}
function boundariesFor(id){
  const timeline=timelines[id];if(!timeline)return [];
  const out=[];
  for(let offset=0;offset<duration;offset+=timeline.total){
    for(const value of timeline.starts){const time=offset+value;if(time<=duration)out.push(time);}
    if(!timeline.clip.loop)break;
  }
  return out;
}
function step(direction){
  if(!ready)return;setPaused(true);
  const source=$('stepSource').value;
  const boundaries=[...new Set([0,duration,...(source==='both'?ids.flatMap(boundariesFor):boundariesFor(source))])].sort((a,b)=>a-b);
  const next=direction>0?boundaries.find(value=>value>elapsed+0.1):boundaries.findLast(value=>value<elapsed-0.1);
  setTime(next ?? (direction>0?duration:0));
}
async function choose(name){
  const generation=++loadGeneration;ready=false;selected=name;elapsed=0;rendered={};retainedImages=[];
  $('clip').value=name;for(const button of $('clips').children)button.classList.toggle('active',button.dataset.clip===name);
  $('status').classList.remove('error');$('status').textContent=`正在加载 ${label(name)}…`;
  for(const element of [$('play'),$('restart'),$('seek'),$('prev'),$('next')])element.disabled=true;
  for(const id of ids){
    timelines[id]=buildTimeline(DATA[id].manifest.clips[name]);
    const t=timelines[id];$(id+'counts').textContent=t?`${t.clip.frames.length} 帧 · ${(t.total/1000).toFixed(2)} s · ${t.clip.loop?'循环':'单次'}`:'无此动作';
  }
  duration=Math.max(1,...ids.map(id=>timelines[id]?.total||0));$('seek').max=duration;
  $('durationdetail').textContent=ids.map(id=>`${id==='before'?'前':'后'} ${(timelines[id]?.total/1000||0).toFixed(3)} s`).join(' / ');
  const pending=[];
  for(const id of ids)for(const path of new Set(timelines[id]?.clip.frames||[])){
    const img=new Image();img.src=imageURL(id,path);retainedImages.push(img);
    pending.push(img.decode().then(()=>null,()=>`${id}: ${path}`));
  }
  const failures=(await Promise.all(pending)).filter(Boolean);
  if(generation!==loadGeneration)return;
  if(failures.length){$('status').classList.add('error');$('status').textContent=`${failures.length} 张图片加载失败：${failures[0]}`;return;}
  ready=true;lastTick=performance.now();
  for(const element of [$('play'),$('restart'),$('seek'),$('prev'),$('next')])element.disabled=false;
  $('status').textContent=`${label(name)} · 同步检查`;render();
}
function tick(now){
  const delta=Math.max(0,Math.min(now-lastTick,250));lastTick=now;
  if(ready&&!paused){
    elapsed+=delta*Number($('speed').value);
    if(elapsed>=duration){if($('repeat').checked)elapsed%=duration;else{elapsed=duration;setPaused(true);}}
    render();
  }
  requestAnimationFrame(tick);
}
for(const name of names){
  const option=document.createElement('option');option.value=name;option.textContent=`${label(name)} · ${name}`;$('clip').append(option);
  const button=document.createElement('button');button.type='button';button.dataset.clip=name;button.textContent=label(name);button.title=name;button.onclick=()=>choose(name);$('clips').append(button);
}
$('clipcount').textContent=names.length;
$('clip').onchange=()=>choose($('clip').value);
$('play').onclick=()=>setPaused(!paused);
$('restart').onclick=()=>{setTime(0);setPaused(false);};
$('seek').oninput=event=>{setPaused(true);setTime(event.target.value);};
$('prev').onclick=()=>step(-1);$('next').onclick=()=>step(1);
$('guides').onchange=()=> $('panels').classList.toggle('guides',$('guides').checked);
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName))return;
  if(event.code==='Space'){event.preventDefault();if(ready)setPaused(!paused);}
  if(event.code==='ArrowRight'){event.preventDefault();step(1);}
  if(event.code==='ArrowLeft'){event.preventDefault();step(-1);}
});
syncPlayButton();choose(selected);requestAnimationFrame(tick);
// Small inspection hook for local browser checks; the page needs no server.
window.animationReview={get state(){return{selected,elapsed,paused,ready,duration,frames:Object.fromEntries(ids.map(id=>[id,timelines[id]?frameAt(timelines[id],elapsed).index:null]))};},choose,setTime,step};
</script></body></html>
'''


def build(before: Path, after: Path, destination: Path) -> Path:
    """Read two manifest paths and write a self-contained HTML controller."""
    before = before.resolve()
    after = after.resolve()
    destination = destination.resolve()
    data = {"names": NAMES}
    for name, path in (("before", before), ("after", after)):
        manifest = json.loads(path.read_text(encoding="utf-8-sig"))
        if not manifest.get("clips"):
            raise ValueError(f"No animation clips in {path}")
        base = Path(os.path.relpath(path.parent, destination.parent)).as_posix() + "/"
        data[name] = {"manifest": manifest, "base": base}
    # Escape '<' so paths or names cannot accidentally close the script element.
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(TEMPLATE.replace("__DATA__", payload), encoding="utf-8")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, default=ROOT / "output/animation-v0110/before/manifest.json")
    parser.add_argument("--after", type=Path, default=ROOT / "assets/animations/manifest.json")
    parser.add_argument("--output", type=Path, default=ROOT / "output/animation-v0110/review.html")
    args = parser.parse_args()
    print(build(args.before, args.after, args.output))


if __name__ == "__main__":
    main()
