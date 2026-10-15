'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {SessionMonitor, parseEvent, belongsToWorkspace} = require('../src/session-monitor');
const start = Date.parse('2026-10-12T12:00:00Z');
let id = 0;
const row = (type, extra = {}, at = start + ++id * 1000) => ({id: `record-${++id}`, timestamp: new Date(at).toISOString(), payload: {type, ...extra}});
const encode = records => records.map(r => JSON.stringify(r) + '\n').join('');
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kiropet-session-test-'));
  const workspace = path.join(root, 'project');
  const dir = path.join(root, 'hash', 'sess_test');
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({schemaVersion: '1.0.0', dataModelVersion: 1, workspacePaths: [workspace]}));
  const file = path.join(dir, 'messages.jsonl');
  await fs.writeFile(file, '');
  const activities = [];
  const monitor = new SessionMonitor({root, workspaces: [workspace], onActivity: a => activities.push(a), now: () => start, ...options});
  t.after(async () => { monitor.dispose(); await fs.rm(root, {recursive: true, force: true}); });
  return {root, workspace, dir, file, monitor, activities, append: records => fs.appendFile(file, encode(records))};
}
test('maps observed events, never extracts reasoning, prompts, arguments or results', () => {
  assert.equal(parseEvent(row('assistant', {operationType: 'Reasoning', content: 'private'}), true), null);
  for (const r of [row('user', {content: 'secret'}), row('tool_call', {toolName: 'read_file', args: {path: 'secret'}}), row('tool_result', {content: 'secret'})]) {
    assert.doesNotMatch(JSON.stringify(parseEvent(r, true)), /secret/);
  }
  const answer = row('assistant', {operationType: 'Say', content: '你好\n世界'});
  assert.doesNotMatch(parseEvent(answer).detail, /你好/);
  assert.match(parseEvent(answer, true).reply, /你好 世界/);
  assert.equal(parseEvent(answer).state, 'working');
  assert.equal(parseEvent(row('turn_end', {stopReason: 'end_turn'})).state, 'done');
  for (const stopReason of ['error', 'cancelled', 'unknown']) assert.equal(parseEvent(row('turn_end', {stopReason})).state, 'idle');
  assert.match(parseEvent(row('pending_interaction')).detail, /确认/);
  assert.equal(parseEvent(row('session_metadata', {key: 'contextUsage', value: {usagePercentage: 22.5}})).contextUsage, 22.5);
  assert.equal(parseEvent(row('session_metadata', {key: 'contextUsage', value: {usagePercentage: 101}})), null);
});
test('startup baselines old history, then follows start, tool, reply and explicit completion', async t => {
  const f = await fixture(t);
  await f.append([row('turn_start', {}, start - 10000), row('turn_end', {stopReason: 'end_turn'}, start - 1000)]);
  await f.monitor.poll();
  assert.equal(f.activities.length, 0);
  await f.append([row('turn_start', {executionId: 'new'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).phase, 'start');
  const startedAt = f.activities.at(-1).startedAt;
  await f.append([row('tool_call', {executionId: 'new', toolName: 'str_replace'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'editing');
  assert.equal(f.activities.at(-1).startedAt, startedAt);
  await f.append([row('assistant', {executionId: 'new', operationType: 'Say', content: 'all done'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'working');
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'working');
  await f.append([row('turn_end', {executionId: 'new', stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
  assert.equal(f.activities.at(-1).eventCount, 4);
  await f.append([row('tool_result', {executionId: 'new'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
});
test('handles split UTF-8 and partial JSON, malformed rows, rewrite and duplicate records', async t => {
  const f = await fixture(t, {showReply: true});
  await f.monitor.poll();
  await f.append([row('user')]);
  await f.monitor.poll();
  f.activities.length = 0;
  const r = row('assistant', {operationType: 'Say', content: '鲸鱼正在回答'});
  const bytes = Buffer.from(encode([r]));
  const split = bytes.indexOf(Buffer.from('鲸')) + 1;
  await fs.appendFile(f.file, bytes.subarray(0, split));
  await f.monitor.poll();
  assert.equal(f.activities.length, 0);
  await fs.appendFile(f.file, bytes.subarray(split));
  await f.monitor.poll();
  assert.match(f.activities.at(-1).reply, /鲸鱼正在回答/);
  const next = row('tool_call', {toolName: 'read_file'});
  await fs.writeFile(f.file, 'bad json\n' + encode([r, next]));
  await f.monitor.poll();
  assert.equal(f.activities.length, 2);
  assert.equal(f.monitor.status().malformed, 1);
  await f.append([next]);
  await f.monitor.poll();
  assert.equal(f.activities.length, 2);
  await fs.writeFile(f.file, encode([row('turn_end', {stopReason: 'cancelled'})]));
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'idle');
  assert.match(f.activities.at(-1).detail, /取消/);
});
test('discovers new sessions, isolates projects, and does not replay newly copied old history', async t => {
  const f = await fixture(t);
  await f.monitor.poll();
  for (const [name, workspace, at] of [['other', 'unrelated', start + 1000], ['old', f.workspace, start - 1000], ['live', f.workspace, start + 3000]]) {
    const dir = path.join(f.root, 'hash', name);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'session.json'), JSON.stringify({schemaVersion: '1.0.0', dataModelVersion: 1, workspacePaths: [workspace]}));
    await fs.writeFile(path.join(dir, 'messages.jsonl'), encode([row('turn_start', {}, at)]));
  }
  await f.monitor.poll();
  assert.equal(f.monitor.status().matched, 3);
  assert.equal(f.activities.length, 1);
  assert.equal(f.activities[0].session, 'live');
  assert.equal(belongsToWorkspace({workspacePaths: [f.workspace + '-different']}, [f.workspace]), false);
});
test('one completed session does not celebrate while another is still working', async t => {
  const f = await fixture(t);
  const second = path.join(f.root, 'hash', 'sess_second');
  await fs.mkdir(second);
  await fs.copyFile(path.join(f.dir, 'session.json'), path.join(second, 'session.json'));
  await fs.writeFile(path.join(second, 'messages.jsonl'), '');
  await f.monitor.poll();
  await f.append([row('turn_start', {executionId: 'one'})]);
  await fs.appendFile(path.join(second, 'messages.jsonl'), encode([row('turn_start', {executionId: 'two'})]));
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).activeSessions, 2);
  await fs.appendFile(path.join(second, 'messages.jsonl'), encode([row('turn_end', {executionId: 'two', stopReason: 'end_turn'})]));
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'working');
  assert.equal(f.activities.at(-1).activeSessions, 1);
  await f.append([row('turn_end', {executionId: 'older', stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'working');
  await f.append([row('turn_end', {executionId: 'one', stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
});
test('unknown schema, missing directory and dispose degrade safely', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.dir, 'session.json'), JSON.stringify({schemaVersion: '2.0.0', dataModelVersion: 2, workspacePaths: [f.workspace]}));
  await f.monitor.poll();
  assert.equal(f.monitor.status().unsupported, 1);
  assert.equal(f.activities.length, 0);
  const absent = new SessionMonitor({root: path.join(f.root, 'absent')});
  await absent.poll();
  assert.equal(absent.status().rootExists, false);
  absent.dispose();
  f.monitor.dispose();
  await f.append([row('turn_start')]);
  await f.monitor.poll();
  assert.equal(f.activities.length, 0);
});

async function until(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Timed out waiting for file notification');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('answer excerpts keep newest sentences, Unicode, completion, and reset per turn', async t => {
  const {replyExcerpt} = require('../src/session-monitor');
  assert.equal(replyExcerpt('第一句。第二句！第三句？'), '第二句！第三句？');
  assert.equal(Array.from(replyExcerpt('🐋'.repeat(150))).length, 90);
  assert.equal(replyExcerpt(null), '');
  const f = await fixture(t, {showReply: true});
  await f.monitor.poll();
  await f.append([row('user'), row('turn_start', {executionId: 'one'}),
    row('assistant', {executionId: 'one', operationType: 'Say', content: '第一句。第二句！第三句？'}),
    row('turn_end', {executionId: 'one', stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
  assert.equal(f.activities.at(-1).reply, '第二句！第三句？');
  assert.equal(f.activities.at(-1).replyUntil, start + 8000);
  await f.append([row('user')]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).reply, '');
  assert.equal(f.activities.at(-1).replyUntil, 0);
  const partial = row('assistant', {operationType: 'Say', content: '片段'});
  await f.append([partial]);
  await f.monitor.poll();
  await f.append([{...partial, payload: {...partial.payload, content: '片段更新'}}]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).reply, '片段更新');
  assert.equal(f.activities.at(-1).state, 'working');
  f.monitor.showReply = false;
  await f.append([row('assistant', {operationType: 'Say', content: '不展示'}), row('turn_end', {stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).reply, '');
  assert.doesNotMatch(JSON.stringify(f.activities.at(-1)), /不展示/);
});

test('opening chats cannot create phantom work or hide another chat completion', async t => {
  const f = await fixture(t);
  await f.monitor.poll();
  const old = {file: 'old-chat', session: 'old', project: 'project'};
  for (const event of ['tool_call', 'tool_result', 'assistant', 'pending_interaction']) {
    f.monitor.accept(old, parseEvent(row(event, {executionId: 'standalone', operationType: 'Say'})));
  }
  f.monitor.publish();
  assert.equal(f.activities.length, 0);
  assert.equal(f.monitor.sessions.size, 0);
  await f.append([row('user')]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).phase, 'start');
  const startedAt = f.activities.at(-1).startedAt;
  await f.append([row('turn_start', {executionId: 'actual-turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).phase, 'continue');
  assert.equal(f.activities.at(-1).startedAt, startedAt);
  f.monitor.accept(old, parseEvent(row('tool_result', {executionId: 'standalone-2'})));
  await f.append([row('turn_end', {executionId: 'actual-turn', stopReason: 'end_turn'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
  assert.equal(f.activities.at(-1).activeSessions, 0);
  await f.append([row('tool_result', {executionId: 'unrelated-after-completion'})]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'done');
  await f.append([row('user')]);
  await f.monitor.poll();
  assert.equal(f.activities.at(-1).state, 'working');
  assert.equal(f.activities.at(-1).phase, 'start');
});

test('real file notifications deliver without rediscovery or fallback polling', async t => {
  const f = await fixture(t, {interval: 60000});
  let scans = 0;
  const discover = f.monitor.discover.bind(f.monitor);
  f.monitor.discover = async () => { scans++; return discover(); };
  f.monitor.start();
  await until(() => f.monitor.initialized);
  assert.equal(f.monitor.status().watching, true);
  await f.append([row('turn_start')]);
  await until(() => f.activities.length === 1);
  assert.equal(f.activities[0].state, 'working');
  assert.equal(scans, 1, 'ordinary output should not scan the session tree');
  await f.append([row('turn_end', {stopReason: 'end_turn'})]);
  await until(() => f.activities.at(-1).state === 'done');
  f.monitor.dispose();
  assert.equal(f.monitor.status().watching, false);
  await f.append([row('turn_start')]);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(f.activities.length, 2);
});

test('watch failure falls back and startup ignores a partial historical record', async t => {
  const f = await fixture(t, {interval: 80, watchFactory: () => { throw new Error('unavailable'); }});
  await fs.writeFile(f.file, '{"historical":');
  f.monitor.start();
  await until(() => f.monitor.initialized);
  assert.equal(f.monitor.status().watching, false);
  await fs.appendFile(f.file, 'true}\n' + encode([row('turn_start')]));
  await until(() => f.activities.length === 1);
  assert.equal(f.monitor.status().malformed, 0);
  assert.equal(f.activities[0].state, 'working');
});

test('watch discovers a newly created session without replaying history', async t => {
  const f = await fixture(t, {interval: 60000});
  f.monitor.start();
  await until(() => f.monitor.initialized);
  const dir = path.join(f.root, 'hash', 'new_session');
  await fs.mkdir(dir);
  await fs.copyFile(path.join(f.dir, 'session.json'), path.join(dir, 'session.json'));
  await fs.writeFile(path.join(dir, 'messages.jsonl'), encode([row('turn_start')]));
  await until(() => f.activities.length === 1);
  assert.equal(f.activities[0].session, 'new_session');
});
