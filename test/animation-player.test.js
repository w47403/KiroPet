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
  assert.deepEqual(Object.keys(manifest.clips).sort(), ['done', 'editing', 'hug', 'idle', 'sleep', 'tool', 'working']);
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

test('reactions expire back into current work and new states override them', () => {
  let now = 0;
  const player = new AnimationPlayer(manifest, () => now);
  player.setState('editing');
  player.react();
  assert.equal(player.sample().name, 'hug');
  now = 2200;
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
  now += manifest.clips.tool.durations[0];
  assert.equal(player.sample().index, 1);
  assert.equal(player.sample(true).index, 0);
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
