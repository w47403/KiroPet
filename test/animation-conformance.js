'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {frameAt, frameDelay, AnimationPlayer} = require('../src/animation-player');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/animations/manifest.json')));
const clips = manifest.clips;
const samples = [];
for (const [name, clip] of Object.entries(clips)) {
  let total = 0;
  const times = new Set([-10, 0, 1]);
  for (const duration of clip.durations) { total += duration; for (const t of [total-1,total,total+1]) times.add(t); }
  times.add(total*3+17);
  for (const elapsed of times) samples.push({name, elapsed});
}
const peeks = [0, 340, 5000, 5230, 12200];
const expected = {frames: samples.map(s => [frameAt(clips[s.name], s.elapsed), frameDelay(clips[s.name], s.elapsed)]),
  peeks: [340, 4660, 230, 6970, 230]};
const introLength=clips.work_start.durations.reduce((a,b)=>a+b,0);
const pauseLength=clips.work_pause.durations.reduce((a,b)=>a+b,0);
const workEvents=[{at:0,state:'working'}, {at:introLength+200},
  {at:introLength+600,state:'editing'}, {at:introLength+900,state:'tool'},
  {at:introLength+1500,state:'working'}, {at:introLength+1800,state:'tool'},
  {at:introLength+2200,state:'editing'}, {at:introLength+18000},
  {at:introLength+18000+pauseLength}];
let clock=0;
const director=new AnimationPlayer(manifest,()=>clock,()=>0);
const expectedWork=workEvents.map(event=>{
  clock=event.at;if(event.state)director.setState(event.state);
  const frame=director.sample();return [frame.name,frame.index,Math.round(director.nextDelay*1e6)/1e6];
});
const input = JSON.stringify({clips, manifest, samples, peeks, workEvents});
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, input, encoding: 'utf8', windowsHide: true, maxBuffer: 8*1024*1024});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const python = process.env.KIRO_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const py = run(python, ['-X','utf8','-c',
  "import json,sys;sys.path.insert(0,'scripts');from animation_runtime import frame_at,frame_delay,peek_delay,WorkDirector\n"+
  "d=json.load(sys.stdin)\nclass FixedRandom:\n def uniform(self,a,b): return a\n"+
  "w=WorkDirector(d['manifest'],FixedRandom());state='idle';work=[]\n"+
  "for e in d['workEvents']:\n if e.get('state'): w.set_state(state,e['state'],e['at']);state=e['state']\n name,index=w.sample(state,e['at']);work.append([name,index,round(w.next_delay,6)])\n"+
  "print(json.dumps(dict(work=work,frames=[[frame_at(d['clips'][s['name']],s['elapsed']),frame_delay(d['clips'][s['name']],s['elapsed'])] for s in d['samples']],peeks=[peek_delay(t,'idle') for t in d['peeks']])))"]);
assert.deepEqual(py.work,expectedWork,'Python and JavaScript disagree after rapid work events or a break');
delete py.work;
assert.deepEqual(py, expected, 'Python and JavaScript disagree at an animation boundary');
if (process.platform === 'win32') {
  const ps = run('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',
    ". './scripts/animation_timing.ps1';$d=[Console]::In.ReadToEnd()|ConvertFrom-Json;$frames=@(foreach($s in $d.samples){$c=$d.clips.($s.name);$r=Get-FrameSample $c $s.elapsed ([bool]$c.loop);,@($r.index,$r.delay)});$peeks=@(foreach($t in $d.peeks){Get-PeekDelay $t 'idle'});@{frames=$frames;peeks=$peeks}|ConvertTo-Json -Depth 5 -Compress"]);
  assert.deepEqual(ps, expected, 'PowerShell and JavaScript disagree at an animation boundary');
}
console.log(`Animation timing agrees across ${process.platform === 'win32' ? 'JS, Python and WPF' : 'JS and Python'}: ${samples.length} boundary samples.`);
