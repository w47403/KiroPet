'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const root = path.resolve(__dirname, '..');

test('extension persists local events for desktop, resists Hook overwrite and clears previews on config change', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiropet-integration-'));
  const project = path.join(dir, 'project');
  const hook = path.join(project, '.kiro', 'hooks', 'whale-pet.json');
  fs.mkdirSync(path.dirname(hook), {recursive: true});
  fs.writeFileSync(hook, JSON.stringify({version: 'v1', hooks: [{name: 'Whale Pet - 完成', trigger: 'AgentStop', action: {type: 'command', command: 'HookSignal.ps1 -State done'}}]}));
  const monitors = [], commands = new Map(), subscriptions = [];
  const options = {autoStart: false};
  let configurationChanged;
  const vscode = {
    workspace: {
      workspaceFolders: [{name: 'project', uri: {scheme: 'file', fsPath: project}}],
      getConfiguration: () => ({get: (key, fallback) => options[key] ?? fallback}),
      onDidChangeConfiguration: callback => { configurationChanged = callback; return {dispose() {}}; },
      onDidChangeWorkspaceFolders: () => ({dispose() {}})
    },
    StatusBarAlignment: {Right: 2},
    commands: {registerCommand: (name, callback) => { commands.set(name, callback); return {dispose() {}}; }},
    window: {createStatusBarItem: () => ({show() {}, dispose() {}}), showWarningMessage: msg => assert.fail(msg)}
  };
  class FakeMonitor {
    constructor(config) { this.config = config; monitors.push(this); }
    start() { return this; }
    dispose() { this.disposed = true; }
  }
  const sandbox = {module: {exports: {}}, console, process, setInterval: () => 1, clearInterval() {},
    require: name => name === 'vscode' ? vscode : name === './session-monitor' ? {SessionMonitor: FakeMonitor} : name.startsWith('./') ? require(path.join(root, 'src', name)) : require(name)};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/extension.js'), 'utf8') + '\nmodule.exports.refresh=refresh;', sandbox);
  t.after(() => { sandbox.module.exports.deactivate(); subscriptions.forEach(s => s.dispose()); fs.rmSync(dir, {recursive: true, force: true}); });
  sandbox.module.exports.activate({globalStorageUri: {fsPath: dir}, extensionPath: root, subscriptions});
  assert(commands.has('kiroWhalePet.checkSessions'));
  assert.equal(monitors[0].config.workspaces[0], project);
  assert.equal(fs.existsSync(hook), false);
  assert.equal(fs.readdirSync(path.join(project, '.kiro', 'whale-pet-backups')).length, 1);
  const activity = {state: 'tool', at: Date.now(), startedAt: Date.now() - 5000, eventCount: 4, source: 'session', event: 'tool_call', detail: 'read_file'};
  monitors[0].config.onActivity(activity);
  const stateFile = path.join(dir, 'activity.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)), activity);
  fs.writeFileSync(stateFile, JSON.stringify({state: 'done', at: Date.now(), event: 'AgentStop'}));
  sandbox.module.exports.refresh();
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).source, 'session');
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).state, 'tool');
  options['localSessions.showReplyPreview'] = true;
  configurationChanged({affectsConfiguration: () => true});
  assert.equal(monitors[0].disposed, true);
  assert.equal(monitors[1].config.showReply, true);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).state, 'idle');
  options['localSessions.enabled'] = false;
  configurationChanged({affectsConfiguration: () => true});
  assert.equal(monitors[1].disposed, true);
  assert.equal(monitors.length, 2);
});
