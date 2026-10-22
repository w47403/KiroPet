'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kiropet-windows-'));
  const windows = [];
  t.after(() => {
    for (const window of windows) { window.api.deactivate(); window.subscriptions.forEach(s => s.dispose()); }
    fs.rmSync(directory, {recursive: true, force: true});
  });
  function open(name, enabled = true) {
    const project = path.join(directory, name);
    const subscriptions = [], commands = new Map();
    const options = {autoStart: false, 'localSessions.enabled': enabled};
    let changed, monitor;
    const vscode = {
      workspace: {
        workspaceFolders: [{name, uri: {scheme: 'file', fsPath: project}}],
        getConfiguration: () => ({get: (key, fallback) => options[key] ?? fallback}),
        onDidChangeConfiguration: fn => { changed = fn; return {dispose() {}}; },
        onDidChangeWorkspaceFolders: () => ({dispose() {}})
      },
      StatusBarAlignment: {Right: 2},
      commands: {registerCommand: (key, fn) => { commands.set(key, fn); return {dispose() {}}; }},
      window: {createStatusBarItem: () => ({show() {}, dispose() {}}), showWarningMessage: msg => assert.fail(msg)}
    };
    class FakeMonitor {
      constructor(config) { this.config = config; this.root = config.root; monitor = this; }
      start() { return this; }
      update(config) { Object.assign(this.config, config); }
      dispose() { this.disposed = true; }
    }
    const sandbox = {module: {exports: {}}, console, process, setInterval: () => 1, clearInterval() {},
      require: name => name === 'vscode' ? vscode : name === './session-monitor' ? {SessionMonitor: FakeMonitor} : name.startsWith('./') ? require(path.join(root, 'src', name)) : require(name)};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/extension.js'), 'utf8') +
      '\nmodule.exports.snapshot=readActivity;module.exports.refresh=refresh;module.exports.hookFile=w=>activityStore.hookFile(w);', sandbox);
    const api = sandbox.module.exports;
    api.activate({globalStorageUri: {fsPath: directory}, extensionPath: root, subscriptions});
    const window = {api, monitor, commands, subscriptions, project, options, change: () => changed({affectsConfiguration: () => true})};
    windows.push(window);
    return window;
  }
  return {directory, open};
}
test('starting a second IDE window and delivering its events cannot reset or replace the first window', t => {
  const {open} = fixture(t);
  const a = open('a');
  a.monitor.config.onActivity({state: 'working', project: 'a', source: 'session', event: 'turn_start', at: Date.now()});
  const b = open('b');
  assert.equal(a.api.snapshot().state, 'working');
  b.monitor.config.onActivity({state: 'done', project: 'b', source: 'session', event: 'turn_end', at: Date.now()});
  a.api.refresh();
  assert.equal(a.api.snapshot().project, 'a');
  assert.equal(a.api.snapshot().state, 'working');
  a.commands.get('kiroWhalePet.sleep')();
  b.api.refresh();
  assert.equal(b.api.snapshot().state, 'done');
});
test('legacy Hooks reach only the owning project and manual state is retained until a new Hook arrives', t => {
  const {open} = fixture(t);
  const a = open('a', false), b = open('b', false);
  const file = a.api.hookFile(a.project);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({state: 'tool', project: 'a', event: 'PreToolUse', at: Date.now()}));
  a.api.refresh(); b.api.refresh();
  assert.equal(a.api.snapshot().state, 'tool');
  assert.equal(b.api.snapshot().state, 'idle');
  a.commands.get('kiroWhalePet.sleep')(); a.api.refresh();
  assert.equal(a.api.snapshot().state, 'sleep');
  fs.writeFileSync(file, JSON.stringify({state: 'done', project: 'a', event: 'AgentStop', at: Date.now() + 10}));
  a.api.refresh();
  assert.equal(a.api.snapshot().state, 'done');
});
