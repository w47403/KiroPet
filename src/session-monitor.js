'use strict';

// Read-only adapter for the on-disk Kiro IDE session format observed in v1.
// This is NOT an official API. Never infer completion from silence or an answer.
const fs = require('fs/promises');
const {watch} = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const LIMIT = 4 * 1024 * 1024;
const clean = (value, size = 110) => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, size) : '';
function replyExcerpt(value) {
  if (typeof value !== 'string') return '';
  // Bound work on large answers and retain the newest visible sentences.
  const text = value.slice(-4096).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) || [];
  const tail = sentences.slice(-2).join('').trim();
  const chars = Array.from(tail);
  return chars.length > 90 ? '…' + chars.slice(-89).join('') : tail;
}
function normalize(value) {
  const result = path.resolve(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? result.toLowerCase() : result;
}
function belongsToWorkspace(meta, workspaces) {
  const roots = Array.isArray(meta.workspacePaths) ? meta.workspacePaths : meta.rootPaths;
  return Array.isArray(roots) && roots.some(root => typeof root === 'string' && workspaces.some(w => normalize(w) === normalize(root)));
}
function parseEvent(row, showReply = false) {
  const p = row?.payload;
  const at = Date.parse(row?.timestamp);
  if (!p || typeof p !== 'object' || !Number.isFinite(at) || typeof row.id !== 'string') return null;
  const base = {at, id: row.id, event: p.type, executionId: clean(p.executionId, 100), phase: 'continue'};
  switch (p.type) {
    case 'user': return {...base, state: 'working', phase: 'start', detail: '已收到新请求'};
    case 'turn_start': return {...base, state: 'working', phase: 'start', detail: 'Kiro 开始处理请求'};
    case 'assistant':
      if (p.operationType !== 'Say') return null; // Never extract Reasoning content.
      return {...base, state: 'working', detail: 'Kiro 已写入回答片段（尚未确认结束）',
        ...(showReply ? {reply: replyExcerpt(p.content)} : {})};
    case 'tool_call': {
      const tool = clean(p.toolName, 60) || '工具';
      const editing = /^(str_replace|fs_write|fs_append|write_file|delete_file|semantic_rename|smart_relocate)$/.test(tool);
      const status = p.status === 'completed' ? '已执行' : p.status === 'failed' ? '执行失败' : '调用';
      return {...base, state: editing ? 'editing' : 'tool', detail: `${status}工具 · ${tool}`};
    }
    case 'tool_result': return {...base, state: 'working', detail: p.success === false ? '工具返回错误 · 等待 Kiro 后续处理' : '工具已返回 · 继续处理'};
    case 'pending_interaction': return {...base, state: 'tool', detail: '等待你在 Kiro 中确认或回答'};
    case 'interaction_resolved': return {...base, state: 'working', detail: '确认已处理 · 等待后续记录'};
    case 'sub_agent_start': return {...base, state: 'tool', detail: 'Kiro 正在调用子任务'};
    case 'sub_agent_complete': return {...base, state: 'working', detail: '子任务已返回 · 主任务尚未确认结束'};
    case 'session_metadata': {
      const n = p.key === 'contextUsage' ? p.value?.usagePercentage : null;
      return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? {...base, contextUsage: n} : null;
    }
    case 'turn_end':
      if (p.stopReason === 'end_turn') return {...base, state: 'done', phase: 'finish', detail: 'Kiro 已确认本轮完成'};
      if (p.stopReason === 'cancelled' || p.stopReason === 'error') return {...base, state: 'idle', phase: 'finish', detail: p.stopReason === 'cancelled' ? '本轮已取消' : '本轮因错误结束，请查看 Kiro'};
      return {...base, state: 'idle', phase: 'finish', detail: '本轮已结束（结束原因未识别）'};
    default: return null;
  }
}

class SessionMonitor {
  constructor({root = path.join(os.homedir(), '.kiro', 'sessions'), workspaces = [], showReply = false, onActivity = () => {}, interval = 15000, now = Date.now, watchFactory = watch} = {}) {
    Object.assign(this, {root, workspaces, showReply, onActivity, interval, now});
    this.startedAt = now();
    this.files = new Map();
    this.sessions = new Map();
    this.recent = [];
    this.initialized = false;
    this.disposed = false;
    this.busy = false;
    this.watchFactory = watchFactory;
    this.candidates = [];
    this.needsDiscovery = false;
    this.pendingPoll = false;
    this.diagnostics = {matched: 0, unsupported: 0, errors: 0, malformed: 0, oversized: 0, records: 0, lastRecordAt: 0, rootExists: false};
  }
  start() {
    if (!this.workspaces.length) return this;
    this.ensureWatcher();
    void this.poll();
    this.timer = setInterval(() => { this.ensureWatcher(); void this.poll(); }, this.interval);
    this.timer.unref?.();
    return this;
  }
  ensureWatcher() {
    if (this.watcher || this.disposed) return;
    try {
      this.watcher = this.watchFactory(this.root, {recursive: true, persistent: false}, (kind, filename) => {
        const parts = filename ? String(filename).split(/[\\/]/) : [];
        if (parts[0] === 'cli' || parts[0] === '_global') return;
        if (parts.length > 3) return;
        // Windows also reports parent-directory timestamp changes on append.
        if (parts.length && parts.length < 3 && kind === 'change') return;
        const leaf = parts.at(-1);
        if (parts.length === 3 && !['messages.jsonl', 'session.json'].includes(leaf)) return;
        if (leaf === 'messages.jsonl' && kind === 'change' &&
            !this.candidates.some(c => path.resolve(c.file) === path.resolve(this.root, String(filename)))) return;
        const known = leaf === 'messages.jsonl' && this.candidates.some(c => path.resolve(c.file) === path.resolve(this.root, String(filename)));
        this.schedule(!known);
      });
      this.watcher.on('error', () => {
        this.watcher?.close(); this.watcher = null;
        this.diagnostics.errors++;
      });
    } catch (_) { this.watcher = null; }
  }
  schedule(discover = false) {
    if (this.disposed) return;
    this.needsDiscovery ||= discover;
    // A bounded batch window: continuous output must not postpone delivery.
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      const scan = this.needsDiscovery;
      this.needsDiscovery = false;
      void this.poll(scan);
    }, 250);
    this.debounce.unref?.();
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer); clearTimeout(this.debounce);
    this.watcher?.close(); this.watcher = null;
    this.files.clear(); this.sessions.clear();
  }
  async directories(dir) {
    try { return (await fs.readdir(dir, {withFileTypes: true})).filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => path.join(dir, e.name)); }
    catch (err) { if (err.code !== 'ENOENT') this.diagnostics.errors++; return []; }
  }
  async discover() {
    const result = [];
    this.diagnostics.matched = 0;
    this.diagnostics.unsupported = 0;
    this.diagnostics.rootExists = await fs.stat(this.root).then(s => s.isDirectory(), () => false);
    // Deliberately only two levels: never scan snapshots, CLI data or project files.
    for (const workspace of await this.directories(this.root)) {
      if (path.basename(workspace) === 'cli' || path.basename(workspace) === '_global') continue;
      for (const dir of await this.directories(workspace)) {
        try {
          const metaFile = path.join(dir, 'session.json');
          const stat = await fs.lstat(metaFile);
          if (!stat.isFile() || stat.size > 256 * 1024) continue;
          const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
          if (!belongsToWorkspace(meta, this.workspaces)) continue;
          if (meta.dataModelVersion !== 1 || !String(meta.schemaVersion).startsWith('1.')) { this.diagnostics.unsupported++; continue; }
          const matched = this.workspaces.find(w => (meta.workspacePaths || meta.rootPaths).some(r => typeof r === 'string' && normalize(r) === normalize(w)));
          result.push({file: path.join(dir, 'messages.jsonl'), project: path.basename(matched), session: path.basename(dir)});
          this.diagnostics.matched++;
        } catch (err) { if (err.code !== 'ENOENT') this.diagnostics.errors++; }
      }
    }
    return result;
  }
  async poll(discover = true) {
    if (this.disposed) return;
    if (this.busy) { this.pendingPoll = true; this.needsDiscovery ||= discover; return; }
    this.busy = true;
    try {
      const candidates = discover ? await this.discover() : this.candidates;
      this.candidates = candidates;
      const present = new Set(candidates.map(c => c.file));
      for (const file of this.files.keys()) if (!present.has(file)) { this.files.delete(file); this.sessions.delete(file); }
      for (const candidate of candidates) {
        if (this.disposed) break;
        try { await this.read(candidate); }
        catch (err) { if (err.code !== 'ENOENT') this.diagnostics.errors++; }
      }
      this.initialized = true;
      if (!this.disposed) this.publish();
    } catch (_) { this.diagnostics.errors++; }
    finally {
      this.busy = false;
      if (this.pendingPoll && !this.disposed) { this.pendingPoll = false; this.schedule(); }
    }
  }
  async read(candidate) {
    const {file} = candidate;
    const stat = await fs.lstat(file);
    if (!stat.isFile()) return;
    let cursor = this.files.get(file);
    const first = !cursor;
    if (!cursor) {
      cursor = {offset: Math.max(0, stat.size - LIMIT), pending: Buffer.alloc(0), anchor: Buffer.alloc(0), seen: new Map(), skipLine: stat.size > LIMIT};
      this.files.set(file, cursor);
    }
    if (!first && cursor.size === stat.size && cursor.mtime === stat.mtimeMs) return;
    const handle = await fs.open(file, 'r');
    try {
      if (first && !this.initialized) {
        // Baseline by seeking to EOF, not parsing megabytes of old conversations.
        cursor.offset = stat.size;
        cursor.anchor = Buffer.alloc(Math.min(128, stat.size));
        if (cursor.anchor.length) await handle.read(cursor.anchor, 0, cursor.anchor.length, stat.size - cursor.anchor.length);
        cursor.skipLine = stat.size > 0 && cursor.anchor.at(-1) !== 10;
        cursor.size = stat.size; cursor.mtime = stat.mtimeMs;
        return;
      }
      const anchor = Buffer.alloc(cursor.anchor.length);
      if (anchor.length) await handle.read(anchor, 0, anchor.length, cursor.offset - anchor.length);
      const rewritten = stat.size < cursor.offset || !anchor.equals(cursor.anchor) || (!first && stat.size === cursor.size);
      if (rewritten) {
        cursor.offset = Math.max(0, stat.size - LIMIT);
        cursor.pending = Buffer.alloc(0);
        cursor.skipLine = cursor.offset > 0;
      }
      const buffer = Buffer.alloc(Math.min(LIMIT, Math.max(0, stat.size - cursor.offset)));
      const {bytesRead} = await handle.read(buffer, 0, buffer.length, cursor.offset);
      cursor.offset += bytesRead;
      const data = Buffer.concat([cursor.pending, buffer.subarray(0, bytesRead)]);
      let start = 0, end;
      while ((end = data.indexOf(10, start)) !== -1) {
        if (cursor.skipLine) cursor.skipLine = false;
        else {
          try {
            const row = JSON.parse(data.subarray(start, end).toString('utf8').replace(/^\uFEFF/, ''));
            const event = parseEvent(row, this.showReply);
            if (event) {
              // Only retain sanitized metadata (and optional visible reply excerpt).
              const digest = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
              const duplicate = cursor.seen.get(event.id) === digest;
              cursor.seen.set(event.id, digest);
              if (cursor.seen.size > 10000) cursor.seen.delete(cursor.seen.keys().next().value);
              const live = this.initialized && event.at >= this.startedAt;
              if (!duplicate && live) this.accept(candidate, event);
            }
          } catch (_) { this.diagnostics.malformed++; }
        }
        start = end + 1;
      }
      cursor.pending = Buffer.from(data.subarray(start));
      if (cursor.pending.length > LIMIT) { cursor.pending = Buffer.alloc(0); cursor.skipLine = true; this.diagnostics.oversized++; }
      cursor.anchor = Buffer.alloc(Math.min(128, cursor.offset));
      if (cursor.anchor.length) await handle.read(cursor.anchor, 0, cursor.anchor.length, cursor.offset - cursor.anchor.length);
      cursor.size = cursor.offset; // Keep reading next tick if more than LIMIT arrived.
      cursor.mtime = stat.mtimeMs;
      if (cursor.offset < stat.size) this.schedule();
    } finally { await handle.close(); }
  }
  accept(candidate, event) {
    let previous = this.sessions.get(candidate.file);
    // Opening/restoring a chat can run standalone tools with their own execution
    // IDs. They are not an AI turn and must never create a busy session.
    const beginsTurn = ['user', 'turn_start'].includes(event.event);
    if (!previous && !beginsTurn) return;
    if (previous && event.at < previous.at) return;
    if (previous?.executionId && event.executionId && previous.executionId !== event.executionId && !['user', 'turn_start'].includes(event.event)) return;
    if (!event.state) {
      if (previous) this.sessions.set(candidate.file, {...previous, contextUsage: event.contextUsage});
      return;
    }
    // A delayed tool/result must never revive an explicitly finished turn.
    if (previous?.phase === 'finish' && !['user', 'turn_start', 'turn_end'].includes(event.event)) return;
    // user + turn_start describe one submission, not two animation restarts.
    const confirmsSubmission = event.event === 'turn_start' && previous?.event === 'user';
    const newTurn = beginsTurn && !confirmsSubmission;
    const reply = !this.showReply || newTurn || (event.phase === 'finish' && event.state !== 'done') ? '' :
      event.reply || previous?.reply || '';
    const replyUntil = reply ? (event.reply || event.state === 'done' ? this.now() + 8000 : previous?.replyUntil || 0) : 0;
    const activity = {...event, source: 'session', session: candidate.session, project: candidate.project,
      reply, replyUntil,
      phase: confirmsSubmission ? 'continue' : event.phase,
      executionId: event.executionId || (newTurn ? '' : previous?.executionId || ''),
      startedAt: newTurn ? event.at : previous?.startedAt || event.at,
      eventCount: newTurn ? 1 : (previous?.eventCount || 0) + 1,
      contextUsage: newTurn ? undefined : previous?.contextUsage};
    this.sessions.set(candidate.file, activity);
    this.diagnostics.records++;
    this.diagnostics.lastRecordAt = this.now();
    this.recent.push({event: event.event, state: event.state, at: event.at});
    if (this.recent.length > 20) this.recent.shift();
  }
  publish() {
    const all = [...this.sessions.values()];
    const active = all.filter(s => ['working', 'tool', 'editing'].includes(s.state));
    const selected = (active.length ? active : all).sort((a, b) => b.at - a.at)[0];
    if (!selected) return;
    const activity = {...selected, activeSessions: active.length};
    const signature = JSON.stringify(activity);
    if (signature !== this.lastPublished) { this.lastPublished = signature; this.onActivity(activity); }
  }
  status() { return {...this.diagnostics, watching: !!this.watcher, fallbackMs: this.interval, root: this.root, recent: [...this.recent]}; }
}
module.exports = {SessionMonitor, parseEvent, belongsToWorkspace, replyExcerpt};
