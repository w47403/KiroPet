"""Build a portable, offline old/new animation review page from packaged assets."""
import base64
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
new=json.loads((ROOT/'assets/animations/manifest.json').read_text(encoding='utf-8'))
old=json.loads((ROOT/'scripts/animation-base.json').read_text(encoding='utf-8'))
paths={p for m in (old,new) for c in m['clips'].values() for p in c['frames']}
images={p:'data:image/png;base64,'+base64.b64encode((ROOT/'assets/animations'/p).read_bytes()).decode() for p in paths}
template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>鲸鱼娘 · 动画验收</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1526;color:#e3f0ff;font:15px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:32px auto;padding:0 24px}h1{font-size:28px;margin:0}p{color:#a5bbd3}header{display:flex;justify-content:space-between;align-items:center}.badge{border:1px solid #3c677a;border-radius:40px;padding:5px 16px;color:#7ee8d4}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}button,select{font:inherit;background:#1c304a;color:#e3f0ff;border:1px solid #3c536d;border-radius:10px;padding:8px 16px;cursor:pointer}button.active{background:#196b70;border-color:#79e4d5}.panels{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:#14243a;border:1px solid #2c4059;border-radius:20px;padding:20px;text-align:center}.stage{height:380px;display:flex;align-items:end;justify-content:center;background:radial-gradient(ellipse at bottom,#284261,transparent 70%);border-radius:12px}.stage img{height:342px;width:256px;object-fit:contain}.label{font-weight:600;margin:0 0 10px}.meta{font:12px ui-monospace,monospace;color:#9cb4d1;min-height:40px;margin-top:12px}input[type=range]{width:100%;accent-color:#73dfcd}.hint{font-size:13px}.footer{display:flex;justify-content:space-between;color:#aac1da;margin:14px 0}@media(max-width:650px){.panels{grid-template-columns:1fr}.stage{height:320px}.stage img{height:300px}header{align-items:start}}
</style><main><header><div><h1>鲸鱼娘 · 动画验收</h1><p>同一人设，观察工作节奏与动作衔接。</p></div><span class="badge">v0.9.0</span></header>
<div class="controls"><select id="clip"></select><button id="task">完整工作流程</button><button id="pause">暂停</button><button id="restart">重播</button><select id="speed"><option value="1">正常速度</option><option value="0.5">半速检查</option><option value="0.25">四分之一速度</option></select></div>
<div class="panels"><section class="panel"><div class="label">优化前</div><div class="stage"><img id="old" alt="优化前动画"></div><div id="oldmeta" class="meta"></div></section><section class="panel"><div class="label">当前版本</div><div class="stage"><img id="new" alt="当前动画"></div><div id="newmeta" class="meta"></div></section></div>
<div class="footer"><span id="mode">逐段对比</span><span id="time"></span></div><input id="seek" type="range" min="0" max="20000" value="0" step="10" aria-label="播放进度">
<p class="hint">可暂停或拖动进度条逐帧检查。非循环动作播完后保持末帧。完整流程按相同事件时间播放：开始 → 工具 → 编辑 → 完成。此页面离线运行，不连接 Kiro。</p></main>
<script>__PLAYER__</script><script>
const manifests=__MANIFESTS__,images=__IMAGES__;
const names={idle:'站立待机',working:'工作打字',editing:'修改文件',work_start:'工作开场',work_pause:'桌前思考',tool:'调用工具',done:'完成收尾',sit:'坐下休息与起身',nap:'侧躺休息与起身',stretch:'伸懒腰',walk:'走动',rice_scoop:'舀饭',rice_hug:'抱碗吃饭',rice_full:'吃饱休息',hug:'摸头',drag:'拎起拖动',sleep:'睡眠',land:'松手落地',work_pet:'工作时摸头',sit_pet:'坐着摸头',nap_pet:'躺着摸头'};
const selector=document.getElementById('clip');for(const name of Object.keys(manifests.new.clips)){const o=document.createElement('option');o.value=name;o.textContent=names[name]||name;selector.append(o)}selector.value='working';
let elapsed=0,last=performance.now(),paused=false,task=false,players={},eventIndex=0;
const events=[[0,'working'],[6500,'tool'],[10000,'editing'],[14000,'done']];
function reset(){elapsed=0;eventIndex=0;for(const id of ['old','new'])players[id]=new WhaleAnimation.AnimationPlayer(manifests[id],()=>elapsed,()=>0);last=performance.now();render()}
function render(){
 if(task){while(eventIndex<events.length&&elapsed>=events[eventIndex][0]){for(const id of ['old','new']){const p=players[id];p.now=()=>events[eventIndex][0];p.setState(events[eventIndex][1],eventIndex===0);p.now=()=>elapsed}eventIndex++}}
 for(const id of ['old','new']){let frame;const clip=manifests[id].clips[selector.value];if(task)frame=players[id].sample();else if(clip){const index=WhaleAnimation.frameAt(clip,elapsed);frame={name:selector.value,index,path:clip.frames[index]}}else frame={name:'idle',index:0,path:'idle/00.png'};document.getElementById(id).src=images[frame.path];document.getElementById(id+'meta').textContent=(names[frame.name]||frame.name)+' · 帧 '+(frame.index+1)+' / '+manifests[id].clips[frame.name].frames.length}
 document.getElementById('time').textContent=(elapsed/1000).toFixed(2)+' 秒';document.getElementById('seek').value=elapsed;
}
function tick(t){if(!paused)elapsed+=(t-last)*Number(document.getElementById('speed').value);last=t;if(elapsed>20000)reset();render();requestAnimationFrame(tick)}
selector.onchange=()=>{task=false;document.getElementById('mode').textContent='逐段对比';reset()};document.getElementById('task').onclick=()=>{task=true;document.getElementById('mode').textContent='完整工作流程';reset()};document.getElementById('restart').onclick=reset;document.getElementById('pause').onclick=()=>{paused=!paused;document.getElementById('pause').textContent=paused?'继续':'暂停'};
document.getElementById('seek').oninput=e=>{const value=Number(e.target.value);reset();elapsed=value;render()};
document.getElementById('mode').textContent='正在解码素材…';
const controls=[...document.querySelectorAll('button,select,input')];controls.forEach(el=>el.disabled=true);
const cached=Object.values(images).map(src=>{const img=new Image();img.src=src;return img});
Promise.all(cached.map(img=>img.decode().catch(()=>{}))).then(()=>{controls.forEach(el=>el.disabled=false);document.getElementById('mode').textContent='逐段对比';reset();requestAnimationFrame(tick)});
</script></html>'''
html=template.replace('__PLAYER__',(ROOT/'src/animation-player.js').read_text(encoding='utf-8')).replace('__MANIFESTS__',json.dumps({'old':old,'new':new},ensure_ascii=False)).replace('__IMAGES__',json.dumps(images))
destination=ROOT.parent/'output/animation-review-v090.html'
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(html,encoding='utf-8')
print(destination)
