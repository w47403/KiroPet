'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {frameAt, frameDelay, AnimationPlayer} = require('../src/animation-player');
const root = path.resolve(__dirname, '..');
const imported = JSON.parse(fs.readFileSync(path.join(root, 'assets/animations/manifest.json')));
// Exercise the optional quiet-hold mode as well as the imported continuous mode below.
const manifest = {...imported, continuousIdle:false};

test('adaptive scheduling targets frame boundaries and sleeps on held poses', () => {
  const clip = {durations: [160, 320], loop: true};
  assert.equal(frameDelay(clip, 80), 80);
  assert.equal(frameDelay(clip, 160), 250);
  assert.equal(frameDelay(clip, 470), 16);
  assert.equal(frameDelay(clip, 480), 160);
  assert.equal(frameDelay({...clip, loop: false}, 1000), 250);
  let now = 21950;
  const player = new AnimationPlayer(manifest, () => 0, () => 0);
  player.now = () => now;
  player.sample();
  assert.equal(player.nextDelay, 50);
  now = 22000;
  assert.equal(player.sample().name, 'sit');
});

test('loading and visibility pauses compose and retain the latest event', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  player.pause('loading');
  now = 100; player.pause();
  player.setState('working');
  now = 500; player.resume('loading');
  assert.equal(player.sample().index, 0);
  now = 5000; player.setState('done'); player.resume();
  assert.equal(player.sample().name, 'done');
  assert.equal(player.sample().index, 0);
});

test('every clip has matching assets and valid frame timings', () => {
  assert.ok(manifest.clips.nap.frames.length>32);
  for (const clip of Object.values(manifest.clips)) {
    assert.ok(clip.frames.length >= 5);
    assert.equal(clip.durations.length, clip.frames.length);
    assert.ok(clip.durations.every(value => value >= 16));
    for (const file of clip.frames) assert.ok(fs.existsSync(path.join(root, 'assets/animations', file)));
    const total = clip.durations.reduce((sum, value) => sum + value, 0);
    assert.equal(frameAt(clip, clip.durations[0] - 1), 0);
    assert.equal(frameAt(clip, clip.durations[0]), 1);
    assert.equal(frameAt(clip, total), clip.loop ? 0 : clip.frames.length-1);
  }
});

test('idle holds quietly, varies poses without repetition, and is preempted by work', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now, () => 0);
  for (now of [0, 1000, 10000, 21999]) assert.deepEqual([player.sample().name,player.sample().index],['idle',0]);
  now = 22000;
  assert.equal(player.sample().name, 'sit');
  now += sum(manifest.clips.sit.durations);
  assert.equal(player.sample().index, manifest.clips.sit.frames.length-1);
  now += 1000;
  assert.equal(player.sample().index, manifest.clips.sit.frames.length-1);
  now = player.idleNext;
  assert.notEqual(player.sample().name, 'sit');
  player.setState('working');
  assert.equal(player.sample().name, 'work_start');
  player.setState('idle');
  assert.equal(player.sample().index,0);
  now += 20000;
  assert.equal(player.sample().index,0);
});

test('idle scheduling pauses with a hidden panel and reduced motion stays still', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now, () => 0);
  now=20000;player.pause();now=100000;player.resume();
  assert.equal(player.sample().name,'idle');
  now=102000; assert.equal(player.sample().name,'sit');
  now=130000; assert.equal(player.sample(true).index,0);
});

test('reactions expire back into current work and new states override them', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  player.setState('editing');
  now = 3000;
  player.react();
  assert.equal(player.sample().name, 'work_pet');
  now += sum(manifest.clips.work_pet.durations);
  assert.equal(player.sample().name, 'editing');
  player.react();
  player.setState('tool');
  assert.equal(player.sample().name, 'tool');
  player.setState('unknown');
  assert.equal(player.sample().name, 'idle');
});

test('completion holds final pose and a new completion can replay', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  player.setState('done');
  now = sum(manifest.clips.done.durations);
  assert.equal(player.sample().index, manifest.clips.done.frames.length-1);
  player.setState('done', true);
  assert.equal(player.sample().index, 0);
});

test('hidden panels freeze timeline including states received while hidden', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  now = 700; player.pause();
  const frozen = player.sample().index;
  now = 1700;
  assert.equal(player.sample().index, frozen);
  player.setState('tool');
  assert.equal(player.sample().index, 0);
  now = 5000; player.resume();
  assert.equal(player.sample().index, 0);
  now += manifest.clips.work_start.durations[0];
  assert.equal(player.sample().index, 1);
  assert.equal(player.sample(true).index, manifest.clips.work_start.frames.length-1);
});

test('task setup survives tool events, loops with breaks, and completion interrupts any phase', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');
  assert.equal(player.sample().name,'work_start');
  now=sum(manifest.clips.work_start.durations)/2;
  const before=player.sample().index;
  player.setState('tool');
  assert.equal(player.sample().name,'work_start');
  assert.equal(player.sample().index,before);
  now=sum(manifest.clips.work_start.durations)+100;
  player.setState('editing');
  assert.equal(player.sample().name,'editing');
  now=24000;
  assert.equal(player.sample().name,'work_pause');
  now+=sum(manifest.clips.work_pause.durations)+1;
  assert.equal(player.sample().name,'editing');
  player.setState('done',true);
  assert.equal(player.sample().name,'done');
  assert.equal(player.sample().index,0);
  now+=sum(manifest.clips.done.durations);
  assert.equal(player.sample().index,manifest.clips.done.frames.length-1);
  player.setState('working');
  assert.equal(player.sample().name,'work_start');
  now+=1000;
  player.setState('working',true);
  assert.equal(player.sample().index,0);
});

function sum(values){return values.reduce((a,b)=>a+b,0);}

test('context reactions freeze and resume the exact background frame', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');
  player.react();
  assert.equal(player.reaction,null,'setup is not interrupted by a pat');
  now=sum(manifest.clips.work_start.durations)+400;
  const before=player.sample();
  player.react();
  assert.equal(player.sample().name,'work_pet');
  now+=sum(manifest.clips.work_pet.durations);
  assert.deepEqual(player.sample(),before);
  player.react(); now+=300; player.beginDrag(); now+=800; player.endDrag();
  assert.deepEqual(player.sample(),before,'dragging during a reaction preserves the background clock');
  player.react();
  player.setState('working');
  assert.equal(player.reaction,null,'a new same-state work event preempts interaction');
  player.setState('idle');
  player.beginDrag();now+=1000;player.endDrag();
  assert.equal(player.sample().name,'land');
  now+=sum(manifest.clips.land.durations);
  assert.equal(player.sample().path,manifest.clips.idle.frames[0]);
});

test('one hour of mixed events has bounded scheduling and valid frames', () => {
  let now=0, eventAt=0, count=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0.3);
  const states=['working','tool','editing','done','idle','sleep'];
  while(now<3600000){
    if(now>=eventAt){player.setState(states[count++%states.length]);eventAt+=17000;}
    const frame=player.sample();
    assert.equal(frame.path,manifest.clips[frame.name].frames[frame.index]);
    assert.ok(player.nextDelay>=16&&player.nextDelay<=250);
    now+=player.nextDelay;
  }
  assert.ok(count>200);
});

test('collar drag loops while task time freezes; new work events resume on release', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');now=2000;
  const pose=player.sample();player.beginDrag();
  assert.equal(player.sample().name,'drag');
  now+=160;assert.equal(player.sample().index,frameAt(manifest.clips.drag,160));
  now+=sum(manifest.clips.drag.durations);assert.equal(player.sample().index,frameAt(manifest.clips.drag,160));
  player.endDrag();assert.deepEqual(player.sample(),pose);
  player.beginDrag();now+=20000;player.setState('done',true);
  assert.equal(player.sample().name,'drag');
  player.endDrag();assert.deepEqual([player.sample().name,player.sample().index],['done',0]);
  player.beginDrag();player.pause();now+=40000;player.resume();
  player.endDrag();assert.equal(player.sample().index,0);
});

test('rapid work events preserve typing phase and suspend it during tools', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');
  now=sum(manifest.clips.work_start.durations)+sum(manifest.clips.working.durations)*0.63;
  const phase=()=>((now-player.loopStarted)%sum(manifest.clips[player.state].durations))/sum(manifest.clips[player.state].durations);
  player.sample();
  player.setState('editing');
  assert.ok(Math.abs(phase()-.63)<1e-9);
  now+=120;
  const saved=phase();
  player.setState('tool');
  now+=700;
  player.setState('working');
  assert.ok(Math.abs(phase()-saved)<1e-9,'tools must retain the typing pose');
  for(let i=0;i<30;i++) {
    const before=phase();
    player.setState(i%2?'working':'editing');
    assert.ok(Math.abs(phase()-before)<1e-9,'event cadence must not restart the loop');
  }
  player.setState('done',true);
  assert.equal(player.sample().name,'done');
});

test('same-state events cancel reactions without fast-forwarding the background', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');
  now=sum(manifest.clips.work_start.durations)+400;
  const before=player.sample();
  player.react();now+=600;
  player.setState('working');
  assert.deepEqual(player.sample(),before);
  player.react();now+=200;player.setState('editing');
  const length=sum(manifest.clips.editing.durations);
  assert.ok(Math.abs((now-player.loopStarted)/length-400/sum(manifest.clips.working.durations))<1e-9);
});

test('sleep drag resumes the exact background pose', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now);
  player.setState('sleep');now=2500;
  const before=player.sample();player.beginDrag();now+=9000;player.endDrag();
  assert.deepEqual(player.sample(),before);
});

test('desk-side breaks resume the typing phase instead of skipping ahead', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');now=player.workNext;
  const elapsed=now-player.loopStarted;
  assert.equal(player.sample().name,'work_pause');
  now+=sum(manifest.clips.work_pause.durations);
  const frame=player.sample();
  assert.equal(frame.index,frameAt(manifest.clips.working,elapsed));
});

test('each rice animation is selectable, finishes once, and holds its quiet rest', () => {
  for(const name of ['rice_scoop','rice_hug','rice_full']){
    let now=0;
    const candidates=manifest.idleBehavior.clips.filter(n=>n!=='idle').flatMap(n=>Array(manifest.idleBehavior.weights[n]).fill(n));
    const choice=(candidates.indexOf(name)+.1)/candidates.length;
    const player=new AnimationPlayer(manifest,()=>now,()=>choice);
    now=22000;assert.equal(player.sample().name,name);
    now+=sum(manifest.clips[name].durations)+100;
    assert.deepEqual([player.sample().name,player.sample().index],[name,manifest.clips[name].frames.length-1]);
    now+=5000;assert.equal(player.sample().index,manifest.clips[name].frames.length-1);
  }
});

test('webview uses frame player and its emitted inline script parses', () => {
  const code = fs.readFileSync(path.join(root, 'src/extension.js'), 'utf8');
  const context = {module: {exports: {}}, require: name => name === 'vscode' ? {Uri: {file: file => file}} : name.startsWith('./') ? require(path.join(root, 'src', name)) : require(name)};
  vm.runInNewContext(code + '\nextContext={extensionPath:' + JSON.stringify(root) + '};module.exports.render=htmlFor;', context);
  const html = context.module.exports.render({cspSource: 'https://test.invalid', asWebviewUri: file => 'https://test.invalid/' + file.replaceAll('\\', '/')});
  assert.match(html, /WhaleAnimation.AnimationPlayer/);
  assert.doesNotMatch(html, /@keyframes|animation:breath/);
  assert.match(html, /visibilitychange/);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});

test('imported idle breathes continuously and every catalog action can be previewed', () => {
  let now=0;
  const player=new AnimationPlayer(imported,()=>now,()=>0);
  now=1000;assert.equal(player.sample().name,'idle');assert.ok(player.sample().index>0);
  now=22000;const action=player.sample().name;assert.notEqual(action,'idle');
  now+=sum(imported.clips[action].durations);assert.equal(player.sample().name,'idle');
  for(const entry of imported.catalog){
    player.cancelReaction();player.react(entry.id);
    assert.equal(player.sample().name,entry.id);
    now+=sum(imported.clips[entry.id].durations);
    assert.equal(player.sample().name,'idle');
  }
});
