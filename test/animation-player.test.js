'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {frameAt, AnimationPlayer} = require('../src/animation-player');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/animations/manifest.json')));

test('every state has eight assets and valid frame timings', () => {
  assert.deepEqual(Object.keys(manifest.clips).sort(), ['done', 'drag', 'editing', 'hug', 'idle', 'nap', 'rice_full', 'rice_hug', 'rice_scoop', 'sit', 'sleep', 'stretch', 'tool', 'walk', 'work_pause', 'work_start', 'working']);
  for (const clip of Object.values(manifest.clips)) {
    assert.equal(clip.frames.length, 8);
    assert.equal(clip.durations.length, 8);
    assert.ok(clip.durations.every(value => value >= 80));
    for (const file of clip.frames) assert.ok(fs.existsSync(path.join(root, 'assets/animations', file)));
    const total = clip.durations.reduce((sum, value) => sum + value, 0);
    assert.equal(frameAt(clip, clip.durations[0] - 1), 0);
    assert.equal(frameAt(clip, clip.durations[0]), 1);
    assert.equal(frameAt(clip, total), clip.loop ? 0 : 7);
  }
});

test('idle holds quietly, varies poses without repetition, and is preempted by work', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now, () => 0);
  for (now of [0, 1000, 10000, 21999]) assert.deepEqual([player.sample().name,player.sample().index],['idle',0]);
  now = 22000;
  assert.equal(player.sample().name, 'sit');
  now += 6000;
  assert.equal(player.sample().index, 7);
  now += 1000;
  assert.equal(player.sample().index, 7);
  now = 50000;
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
  player.react();
  assert.equal(player.sample().name, 'hug');
  now = 8000;
  assert.equal(player.sample().name, 'editing');
  player.react();
  player.setState('tool');
  assert.equal(player.sample().name, 'work_pause');
  player.setState('unknown');
  assert.equal(player.sample().name, 'idle');
});

test('completion holds final pose and a new completion can replay', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  player.setState('done');
  now = 10000;
  assert.equal(player.sample().index, 7);
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
  assert.equal(player.sample(true).index, 7);
});

test('task setup survives tool events, loops with breaks, and completion interrupts any phase', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');
  assert.equal(player.sample().name,'work_start');
  now=1000;
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
  now+=10000;
  assert.equal(player.sample().index,7);
  player.setState('working');
  assert.equal(player.sample().name,'work_start');
  now+=1000;
  player.setState('working',true);
  assert.equal(player.sample().index,0);
});

function sum(values){return values.reduce((a,b)=>a+b,0);}

test('collar drag loops while task time freezes; new work events resume on release', () => {
  let now=0;
  const player=new AnimationPlayer(manifest,()=>now,()=>0);
  player.setState('working');now=2000;
  const pose=player.sample();player.beginDrag();
  assert.equal(player.sample().name,'drag');
  now+=160;assert.equal(player.sample().index,1);
  now+=sum(manifest.clips.drag.durations);assert.equal(player.sample().index,1);
  player.endDrag();assert.deepEqual(player.sample(),pose);
  player.beginDrag();now+=20000;player.setState('done',true);
  assert.equal(player.sample().name,'drag');
  player.endDrag();assert.deepEqual([player.sample().name,player.sample().index],['done',0]);
  player.beginDrag();player.pause();now+=40000;player.resume();
  player.endDrag();assert.equal(player.sample().index,0);
});

test('each rice animation is selectable, finishes once, and holds its quiet rest', () => {
  for(const name of ['rice_scoop','rice_hug','rice_full']){
    let now=0;
    const candidates=manifest.idleBehavior.clips.filter(n=>n!=='idle');
    const choice=(candidates.indexOf(name)+.1)/candidates.length;
    const player=new AnimationPlayer(manifest,()=>now,()=>choice);
    now=22000;assert.equal(player.sample().name,name);
    now+=sum(manifest.clips[name].durations)+100;
    assert.deepEqual([player.sample().name,player.sample().index],[name,7]);
    now+=5000;assert.equal(player.sample().index,7);
  }
});

test('webview uses frame player and its emitted inline script parses', () => {
  const code = fs.readFileSync(path.join(root, 'src/extension.js'), 'utf8');
  const context = {module: {exports: {}}, require: name => name === 'vscode' ? {Uri: {file: file => file}} : require(name)};
  vm.runInNewContext(code + '\nextContext={extensionPath:' + JSON.stringify(root) + '};module.exports.render=htmlFor;', context);
  const html = context.module.exports.render({cspSource: 'https://test.invalid', asWebviewUri: file => 'https://test.invalid/' + file.replaceAll('\\', '/')});
  assert.match(html, /WhaleAnimation.AnimationPlayer/);
  assert.doesNotMatch(html, /@keyframes|animation:breath/);
  assert.match(html, /visibilitychange/);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
});
