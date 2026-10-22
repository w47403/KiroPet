'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ACTIVE = new Set(['working', 'tool', 'editing']);
const STATES = new Set(['idle', 'working', 'tool', 'editing', 'done', 'sleep']);
function workspaceKey(workspace) {
  let value = path.resolve(workspace);
  if (process.platform === 'win32') value = value.toLowerCase();
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

// Each IDE window owns its display snapshot. Project Hooks use stable mailboxes
// so an installed command survives reloads without writing another window's UI.
class ActivityStore {
  constructor(directory) {
    this.directory = directory;
    this.stateFile = path.join(directory, 'runtime', `activity.${process.pid}.${crypto.randomUUID()}.json`);
    this.projects = new Map();
  }
  read() { return readJson(this.stateFile); }
  write(activity) {
    fs.mkdirSync(path.dirname(this.stateFile), {recursive: true});
    const temporary = this.stateFile + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(activity), 'utf8');
      fs.renameSync(temporary, this.stateFile);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  hookFile(workspace) { return path.join(this.directory, 'hooks', workspaceKey(workspace), 'activity.json'); }
  preferencesFile(workspaces) {
    const key = workspaces.length ? crypto.createHash('sha256').update(JSON.stringify(workspaces.map(workspaceKey).sort())).digest('hex').slice(0, 24) : 'no-project';
    return path.join(this.directory, 'preferences', key + '.json');
  }
  updateWorkspaces(workspaces) {
    const current = new Set(workspaces.map(workspaceKey));
    for (const key of this.projects.keys()) if (!current.has(key)) this.projects.delete(key);
    for (const workspace of workspaces) {
      const key = workspaceKey(workspace);
      if (!this.projects.has(key)) {
        const file = this.hookFile(workspace);
        this.projects.set(key, {file, signature: JSON.stringify(readJson(file)), activity: null});
      }
    }
  }
  readHooks() {
    for (const project of this.projects.values()) {
      const activity = readJson(project.file);
      const signature = JSON.stringify(activity);
      if (signature === project.signature) continue;
      project.signature = signature;
      if (activity && STATES.has(activity.state) && Number.isFinite(activity.at)) project.activity = {...activity, source: 'hook'};
    }
    const all = [...this.projects.values()].map(p => p.activity).filter(Boolean);
    const active = all.filter(a => ACTIVE.has(a.state));
    const selected = (active.length ? active : all).sort((a, b) => b.at - a.at)[0];
    return selected ? {...selected, activeSessions: active.length} : null;
  }
  dispose() { if (fs.existsSync(this.stateFile)) fs.unlinkSync(this.stateFile); }
}
module.exports = {ActivityStore, workspaceKey};
