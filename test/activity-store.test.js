'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {ActivityStore} = require('../src/activity-store');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kiropet-store-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return {directory, create: () => new ActivityStore(directory)};
}
function hook(store, workspace, state, at) {
  const file = store.hookFile(workspace);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({state, at, project: path.basename(workspace)}));
}
test('two windows own independent snapshots and closing one preserves the other', t => {
  const {create} = fixture(t);
  const a = create();
  a.write({state: 'working', project: 'a'});
  const b = create();
  b.write({state: 'idle', project: 'b'});
  assert.notEqual(a.stateFile, b.stateFile);
  assert.equal(a.read().state, 'working');
  b.write({state: 'done', project: 'b'});
  assert.equal(a.read().project, 'a');
  b.dispose();
  assert.equal(a.read().state, 'working');
});
test('Hook mailboxes survive reloads, distinguish same-named projects and only expose opened workspaces', t => {
  const {directory, create} = fixture(t);
  const a = create(), b = create();
  const first = path.join(directory, 'first', 'project'), second = path.join(directory, 'second', 'project');
  assert.equal(a.hookFile(first), b.hookFile(first));
  assert.notEqual(a.hookFile(first), a.hookFile(second));
  hook(a, first, 'working', 1);
  a.updateWorkspaces([first]); b.updateWorkspaces([second]);
  assert.equal(a.readHooks(), null, 'startup must not replay old Hook activity');
  hook(a, first, 'tool', 2);
  assert.equal(a.readHooks().state, 'tool');
  assert.equal(b.readHooks(), null);
  hook(a, second, 'done', 3);
  assert.equal(b.readHooks().state, 'done');
  assert.equal(a.readHooks().state, 'tool');
  a.updateWorkspaces([]);
  assert.equal(a.readHooks(), null);
});
test('parallel project Hooks keep an unfinished task visible until all observed tasks finish', t => {
  const {directory, create} = fixture(t);
  const store = create();
  const a = path.join(directory, 'a'), b = path.join(directory, 'b');
  store.updateWorkspaces([a, b]);
  hook(store, a, 'working', 1); hook(store, b, 'tool', 2);
  assert.equal(store.readHooks().activeSessions, 2);
  hook(store, b, 'done', 3);
  assert.equal(store.readHooks().state, 'working');
  hook(store, a, 'done', 4);
  assert.equal(store.readHooks().state, 'done');
  assert.equal(store.readHooks().activeSessions, 0);
});
