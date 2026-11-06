'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {eventProgress, isManagedHook, inspectHooks, disableOwnedHook} = require('./event-health');
const {SessionMonitor} = require('./session-monitor');
const {ActivityStore} = require('./activity-store');
const {BehaviorPolicy, INTENTS, MODES} = require('./behavior-policy');
let behaviorPolicy = null;
let writeSnapshot = null;

let extContext;
let child = null;
let statusItem = null;
let panel = null;
let activityStore = null;
let lastHookSignature;
let refreshTimer = null;
let lastDesktopError = '';
let sessionMonitor = null;
let sessionActivity = null;
const P = 'kiroWhalePet.';
const STATES = new Set(['idle', 'working', 'tool', 'editing', 'done', 'sleep']);
const EMOJI = {idle: '$(smiley)', working: '$(sync~spin)', tool: '$(tools)', editing: '$(edit)', done: '$(check)', sleep: '$(moon)'};

function dataDir() { return extContext.globalStorageUri.fsPath; }
function localStateFile() { return activityStore.stateFile; }
function assetsDir() { return path.join(extContext.extensionPath, 'assets'); }
function settings() { return vscode.workspace.getConfiguration('kiroWhalePet'); }
function writableFiles() {
  const dir = dataDir();
  fs.mkdirSync(dir, {recursive: true});
  for (const item of ['HookSignal.ps1', 'HookSignal.sh', 'status_signal.py']) {
    const target = path.join(dir, item);
    const source = path.join(extContext.extensionPath, 'scripts', item);
    fs.copyFileSync(source, target); // Stable path across VSIX upgrades.
    if (process.platform !== 'win32') fs.chmodSync(target, 0o700);
  }
}
function readActivity() {
  try {
    const obj = JSON.parse(fs.readFileSync(localStateFile(), 'utf8'));
    return {intent: obj.intent, presentation: obj.presentation, state: STATES.has(obj.state) ? obj.state : 'idle',
      project: String(obj.project || '').slice(0, 80), detail: String(obj.detail || '').replace(/[\x00-\x1f]/g,' ').slice(0, 160),
      reply: String(obj.reply || '').slice(0, 180), replyUntil: Number(obj.replyUntil) || 0,
      phase: ['start','continue','finish'].includes(obj.phase) ? obj.phase : '',
      at: Number(obj.at) || 0, startedAt: Number(obj.startedAt) || Number(obj.at) || 0,
      eventCount: Number(obj.eventCount) || 0, event: String(obj.event || '').slice(0,40),
      source: obj.source === 'session' ? 'session' : obj.event === 'Manual' ? 'manual' : 'hook',
      session: String(obj.session || ''), contextUsage: obj.contextUsage, activeSessions: obj.activeSessions};
  } catch (_) { return {state: 'idle', project: '', at: 0}; }
}
function writeActivity(state, project = '', detail = '', phase = '') {
  if (!STATES.has(state)) return;
  const dir = dataDir();
  try {
    fs.mkdirSync(dir, {recursive: true});
    activityStore.write({state, project, phase, detail: String(detail).slice(0,160),
      at: Date.now(), startedAt: Date.now(), eventCount: 0, event: 'Manual'});
    refresh();
  } catch (err) { vscode.window.showWarningMessage('鲸鱼娘状态写入失败：' + err.message); }
}
function refresh() {
  if (activityStore && !settings().get('localSessions.enabled', true)) {
    const hooks = activityStore.readHooks();
    const signature = JSON.stringify(hooks);
    if (signature !== lastHookSignature) {
      lastHookSignature = signature;
      if (hooks) persistSessionActivity(hooks);
      else if (readActivity().source === 'hook') activityStore.write({state: 'idle', at: Date.now(), event: 'Manual'});
    }
  }
  if (behaviorPolicy) {
    const previous = activityStore.read();
    const presentation = behaviorPolicy.sample();
    if (previous && JSON.stringify(previous.presentation) !== JSON.stringify(presentation)) writeSnapshot({...previous, presentation});
    consumeBehaviorRequest();
  }
  let activity = readActivity();
  // Once a live local session is observed, legacy Hooks must not overwrite it.
  if (sessionActivity && activity.source === 'hook') {
    persistSessionActivity(sessionActivity);
    activity = readActivity();
  }
  const progress = eventProgress(activity);
  const text = progress.stale ? '$(warning)' : (EMOJI[activity.state] || EMOJI.idle);
  if (statusItem) {
    statusItem.text = `${text} 鲸鱼娘`;
    statusItem.tooltip = `鲸鱼娘 · ${activity.detail || activity.state}${activity.project ? ' · ' + activity.project : ''}\n${progress.label} · 已接收 ${progress.eventCount} 条事件 · ${progress.durationSeconds}s\n点击打开控制菜单`;
  }
  if (panel) panel.webview.postMessage({type: 'activity', activity});
}
function persistSessionActivity(activity) {
  try {
    activityStore.write(activity);
  } catch (err) { console.warn('KiroPet session state write failed:', err.code); }
}
function startSessionMonitor() {
  const config = settings();
  const configured = config.get('localSessions.directory', '').trim();
  const root = path.resolve(configured || path.join(os.homedir(), '.kiro', 'sessions'));
  const workspaces = getProjectFolders().map(folder => folder.uri.fsPath);
  activityStore.updateWorkspaces(workspaces);
  const showReply = config.get('localSessions.showReplyPreview', true);
  const enabled = config.get('localSessions.enabled', true);
  if (enabled && sessionMonitor && path.resolve(sessionMonitor.root) === root) {
    sessionMonitor.update({workspaces, showReply});
    // Newly added projects may still have an old, owned Hook to migrate.
    for (const folder of getProjectFolders()) {
      try { disableOwnedHook(hookPath(folder)); }
      catch (err) { console.warn('KiroPet Hook migration failed:', err.message); }
    }
    return;
  }
  if (sessionMonitor) sessionMonitor.dispose();
  sessionMonitor = null;
  sessionActivity = null;
  if (readActivity().source === 'session') writeActivity('idle', '', '等待新的 Kiro 会话记录');
  if (!enabled) return;
  for (const folder of getProjectFolders()) {
    try { disableOwnedHook(hookPath(folder)); }
    catch (err) { console.warn('KiroPet Hook migration failed:', err.message); }
  }
  sessionMonitor = new SessionMonitor({
    root, workspaces, showReply,
    onActivity: activity => {
      sessionActivity = activity;
      if (activity) { persistSessionActivity(activity); refresh(); }
      else writeActivity('idle', '', '等待当前项目的新会话记录');
    }
  }).start();
}
async function checkSessions() {
  if (!sessionMonitor) return vscode.window.showInformationMessage('本地会话监听已关闭。可在设置中开启 kiroWhalePet.localSessions.enabled。');
  await sessionMonitor.poll();
  const status = sessionMonitor.status();
  const channel = vscode.window.createOutputChannel('鲸鱼娘 · 本地会话诊断');
  extContext.subscriptions.push(channel);
  channel.appendLine(`监听目录：${status.root}\n目录存在：${status.rootExists}\n当前本地项目：${getProjectFolders().length}\n匹配会话：${status.matched}\n不支持的格式：${status.unsupported}\n启动后事件：${status.records}\n读取失败：${status.errors}\n无效记录：${status.malformed}\n超大记录：${status.oversized}`);
  channel.appendLine(`文件通知：${status.watching ? '已连接' : '不可用，使用低频补偿'}；补偿间隔：${status.fallbackMs}ms。通知合并窗口 250ms，只读取已落盘记录，不保证逐 token 实时。`);
  channel.appendLine('只监听当前工作区。启动时跳过已有历史；没有新记录不代表已完成。');
  channel.appendLine('近期事件（不含聊天正文）：');
  for (const event of status.recent) channel.appendLine(`${new Date(event.at).toLocaleString()}  ${event.event} → ${event.state}`);
  channel.show(true);
}
function isRunning() { return !!child && child.exitCode === null && !child.killed; }
function stopDesktop() {
  if (child) {
    try { child.kill(); } catch (_) { /* already exited */ }
    child = null;
  }
  refresh();
}
function showErrorAndPanel(detail) {
  lastDesktopError = detail;
  vscode.window.showWarningMessage('桌面悬浮窗无法启动，已打开兼容的 Kiro 桌宠面板。' +
    (detail ? ' 详情：' + detail.slice(0, 150) : ''));
  openPanel();
}
function spawnPet(command, args, onFail, isRetry = false) {
  let stderr = '';
  let handled = false;
  try {
    const proc = spawn(command, args, {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
    child = proc;
    proc.stderr.on('data', chunk => { if (stderr.length < 1500) stderr += String(chunk); });
    proc.on('error', err => {
      if (handled) return;
      handled = true;
      if (child === proc) child = null;
      onFail(err.message);
    });
    proc.on('exit', code => {
      if (child === proc) child = null;
      if (!handled && code !== 0 && code !== null) {
        handled = true;
        onFail((stderr || `退出码 ${code}`).trim());
      }
      refresh();
    });
    return proc;
  } catch (err) { onFail(err.message); return null; }
}
function startDesktop(forceDesktop = false) {
  if (!forceDesktop && settings().get('desktopMode', 'auto') === 'panel') { openPanel(); return; }
  if (isRunning()) { vscode.window.showInformationMessage('鲸鱼娘已经在桌面上啦～'); return; }
  // Reopening a companion must retain the AI's current work event.
  lastDesktopError = '';
  const size = Math.max(100, Math.min(320, Number(settings().get('size', 140)) || 140));
  const image = path.join(assetsDir(), 'whale-girl.png');
  const state = localStateFile();
  const preferences = activityStore.preferencesFile(getProjectFolders().map(folder => folder.uri.fsPath));
  if (process.platform === 'win32') {
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA',
      '-File', path.join(extContext.extensionPath, 'scripts', 'WhalePet.ps1'),
      '-AssetPath', image, '-StatePath', state, '-InitialSize', String(size),
      '-PreferencesPath', preferences,
      '-ParentProcessId', String(process.pid)];
    spawnPet('powershell.exe', args, (err) => showErrorAndPanel(err));
  } else {
    const args = [path.join(extContext.extensionPath, 'scripts', 'WhalePet.py'),
      '--image', image, '--state', state, '--size', String(size), '--preferences', preferences, '--parent', String(process.pid)];
    spawnPet('python3', args, (err) => {
      // A missing Python/Tk falls back to a fully self-contained Kiro Webview.
      spawnPet('python', args, (err2) => showErrorAndPanel(`${err}; ${err2}`));
    });
  }
}
function getProjectFolders() {
  return (vscode.workspace.workspaceFolders || []).filter(w => w.uri.scheme === 'file');
}
function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function psQuote(s) { return '"' + String(s).replace(/"/g, '`"') + '"'; }
function safeProjectLabel(name) {
  return String(name).replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 45);
}
function hookCommand(state, projectName, phase = 'continue', workspace) {
  const project = safeProjectLabel(projectName);
  const stateFile = activityStore.hookFile(workspace);
  if (process.platform === 'win32') {
    return `powershell.exe -NoLogo -NoProfile -NonInteractive -File ${psQuote(path.join(dataDir(), 'HookSignal.ps1'))} -StatePath ${psQuote(stateFile)} -State ${state} -Project ${psQuote(project)} -Phase ${phase}`;
  }
  return `/bin/sh ${shellQuote(path.join(dataDir(), 'HookSignal.sh'))} ${shellQuote(stateFile)} ${shellQuote(state)} ${shellQuote(project)} ${shellQuote(phase)}`;
}
function hookPath(folder) { return path.join(folder.uri.fsPath, '.kiro', 'hooks', 'whale-pet.json'); }
function buildHooks(projectName, workspace) {
  const pairs = [
    ['开始工作', 'PromptSubmit', 'working'],
    ['准备使用工具', 'PreToolUse', 'tool'],
    ['工具调用结束', 'PostToolUse', 'working'],
    ['修改文件', 'PostFileSave', 'editing'],
    ['回答完成', 'AgentStop', 'done']
  ];
  return {version:'v1', hooks:pairs.map(([label, trigger, state]) => ({
    name: `Whale Pet - ${label}`, trigger, timeout: 5,
    action: {type:'command', command:hookCommand(state, projectName, trigger==='PromptSubmit'?'start':trigger==='AgentStop'?'finish':'continue', workspace)}
  }))};
}
function recognizedHook(data) { return isManagedHook(data); }
async function installForFolders(folders, silent = false) {
  if (settings().get('localSessions.enabled', true)) {
    if (!silent) vscode.window.showInformationMessage('当前使用无钩子的本地会话监听，无需安装智能体事件联动。');
    return;
  }
  if (!folders.length) return vscode.window.showWarningMessage('请先在 Kiro 打开一个本地项目文件夹。');
  if (!silent) {
    const answer = await vscode.window.showInformationMessage(
      `将在 ${folders.length} 个已打开项目下安装或更新鲸鱼娘 Hook，显示工作事件、工具名称与文件名。`,
      {modal:true}, '安装联动');
    if (answer !== '安装联动') return;
  }
  let installed = 0, skipped = 0;
  for (const folder of folders) {
    const target = hookPath(folder);
    try {
      fs.mkdirSync(path.dirname(target), {recursive:true});
      if (fs.existsSync(target)) {
        const previous = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (!recognizedHook(previous) || !previous.hooks.every(h => h.action?.type === 'command' &&
            /HookSignal\.(ps1|sh)/.test(h.action.command || ''))) { skipped++; continue; }
        fs.copyFileSync(target, target + '.bak');
      }
      fs.writeFileSync(target, JSON.stringify(buildHooks(folder.name, folder.uri.fsPath), null, 2) + '\n');
      installed++;
    } catch (err) {
      vscode.window.showErrorMessage(`${folder.name} Hook 安装失败：${err.message}`);
    }
  }
  if (!silent) vscode.window.showInformationMessage(
    `鲸鱼娘联动：新安装 ${installed} 个，跳过已有文件 ${skipped} 个。打开新 Agent 会话后生效。`);
}
// Upgrade only configs the user previously installed through KiroPet.
// Never touch project hooks created by other extensions or the user.
function upgradeOwnedHooks() {
  let updated = 0;
  for (const folder of getProjectFolders()) {
    const target = hookPath(folder);
    if (!fs.existsSync(target)) continue;
    try {
      const old = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!isManagedHook(old)) continue;
      const next = buildHooks(folder.name, folder.uri.fsPath);
      if (JSON.stringify(old.hooks) === JSON.stringify(next.hooks)) continue;
      fs.copyFileSync(target, target + '.bak');
      fs.writeFileSync(target, JSON.stringify(next, null, 2) + '\n');
      updated++;
    } catch (err) { console.warn('[KiroPet] managed Hook upgrade skipped:', err.message); }
  }
  if (updated) vscode.window.showInformationMessage(
    `鲸鱼娘已升级 ${updated} 个项目的 Agent Hooks（已保留 .bak）。请在 Kiro 新开一轮对话验证 AgentStop。`);
}
async function checkLink() {
  const folders = getProjectFolders();
  if (!folders.length) return vscode.window.showWarningMessage('当前没有打开的本地项目，无法检查 Hook。');
  const rows = inspectHooks(folders, folder => {
    const target = hookPath(folder);
    return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null;
  });
  const labels = {'ok':'已包含 AgentStop','missing':'未安装','custom':'非桌宠 Hook（不会覆盖）',
    'no-stop':'缺少完成事件','invalid':'配置无效'};
  const current = readActivity();
  const progress = eventProgress(current);
  const text = rows.map(item => `${item.folder.name}: ${labels[item.status]}`).join('；');
  const choice = await vscode.window.showInformationMessage(
    `鲸鱼娘联动诊断：${text}。最近事件：${current.event || '暂无'} / ${current.state}；${progress.label}，累计 ${progress.eventCount} 条。`,
    '修复项目联动', '取消');
  if (choice === '修复项目联动') await installForFolders(folders);
}
async function installHooks() { await installForFolders(getProjectFolders().slice(0,1)); }
async function installHooksAll() { await installForFolders(getProjectFolders()); }
async function removeHooks() {
  const folder = getProjectFolders()[0];
  if (!folder) return vscode.window.showWarningMessage('请先在 Kiro 打开项目。');
  const file = hookPath(folder);
  if (!fs.existsSync(file)) return vscode.window.showInformationMessage('当前项目没有鲸鱼娘 Hook。');
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!recognizedHook(json)) return vscode.window.showWarningMessage('文件包含非鲸鱼娘 Hook，为安全起见不会删除。');
  } catch (_) { return vscode.window.showWarningMessage('Hook 文件不是有效 JSON，已保留。'); }
  const answer = await vscode.window.showWarningMessage(`删除 ${folder.name} 的鲸鱼娘 Hook？`, {modal:true}, '删除');
  if (answer !== '删除') return;
  fs.unlinkSync(file);
  writeActivity('idle');
  vscode.window.showInformationMessage('已移除当前项目 Hook。');
}
async function toggleAutoStart() {
  const value = !settings().get('autoStart', true);
  await settings().update('autoStart', value, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(value ? '已开启：以后启动 Kiro 自动显示鲸鱼娘。' : '已关闭：下次启动 Kiro 不自动显示鲸鱼娘；仍可手动打开。');
}
function htmlFor(webview) {
  const uri = webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir(), 'whale-girl.png')));
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir(), 'animations', 'manifest.json'), 'utf8'));
  for (const clip of Object.values(manifest.clips)) {
    clip.frames = clip.frames.map(file => String(webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir(), 'animations', file)))));
  }
  const playerSource = fs.readFileSync(path.join(extContext.extensionPath, 'src', 'animation-player.js'), 'utf8');
  const nonce = crypto.randomBytes(16).toString('hex');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; font-family: var(--vscode-font-family,system-ui); }
  body {margin:0;padding:12px; color:var(--vscode-foreground); background:var(--vscode-editor-background);}
  header{display:flex;justify-content:space-between;align-items:center;gap:6px;font-weight:700;font-size:15px}
  .tag{border:1px solid var(--vscode-panel-border);padding:4px 8px;border-radius:99px;font-size:11px;font-weight:500}
  #stage{position:relative;height:350px;max-height:55vh;min-height:250px;display:flex;align-items:end;justify-content:center;overflow:hidden;cursor:pointer}
  #pet{height:98%;max-width:100%;object-fit:contain;object-position:center bottom;user-select:none;filter:drop-shadow(0 5px 6px rgba(49,136,202,.22));}
  #bubble{position:absolute;top:5px;z-index:2;max-width:88%;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:14px;padding:8px 12px;text-align:center;font-size:12px;box-shadow:0 4px 12px #0002}
  .buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
  button{border:1px solid var(--vscode-button-border,transparent);border-radius:7px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:9px;cursor:pointer}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  #activity{font-size:12px;opacity:.78;text-align:center;min-height:20px}
  details{margin-top:16px}summary{cursor:pointer;font-size:12px;opacity:.8}
  p{font-size:11px;opacity:.72;line-height:1.5}
</style></head><body>
<header><span>🐋 鲸鱼娘</span><span class="tag" id="status">待机中</span></header>
<div id="stage" title="点击摸摸头"><div id="bubble">嗨～一起写代码吧！</div><img id="pet" src="${uri}" alt="鲸鱼娘"></div>
<div id="activity">正在准备…</div><div id="events" style="font-size:12px;text-align:center;opacity:.8;margin:6px 0">等待 Kiro 本地事件…</div>
<div class="buttons">
<button data-action="showDesktop">打开桌面悬浮窗</button>
<button class="secondary" data-action="hideDesktop">关闭悬浮窗</button>
<button class="secondary" data-action="behavior">活跃度与动作设置</button>
<button class="secondary" data-action="openSettings">设置</button>
<button class="secondary" data-state="sleep">休息</button>
</div>
<details><summary>手动演示与诊断</summary><div class="buttons">
<button class="secondary" data-state="working">工作中</button>
<button class="secondary" data-state="tool">调用工具</button>
<button class="secondary" data-state="editing">修改文件</button>
<button class="secondary" data-state="done">完成啦</button>
<button class="secondary" data-state="idle">待机</button>
<button data-action="checkSessions">诊断本地会话监听</button>
 <button class="secondary" data-action="checkLink">诊断事件联动</button>
</div></details>
<label>全部动作 <select id="animationChoice"><option value="">选择动作…</option></select></label>
<p>关闭这个面板后，随时按 Ctrl/Cmd + Shift + P，运行「鲸鱼娘：打开编辑器内桌宠面板」。状态来自 Agent 事件，不代表真实 token 数量或 AI 内部思考进度。</p>
<script nonce="${nonce}">
${playerSource}
const vscode=acquireVsCodeApi();const stage=document.getElementById('stage'),bubble=document.getElementById('bubble');
const phrases=['在呢～','呼噜呼噜～','摸摸头～','你写代码，我负责卖萌！'];let until=0;
const manifest=${JSON.stringify(manifest)};const pet=document.getElementById('pet');
const player=new WhaleAnimation.AnimationPlayer(manifest);const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const loaded=new Map();let frameTimer=null;let lastFrame='';let assetsReady=false;
function preload(name,index=0){const clip=manifest.clips[name];if(!clip)return;for(let n=index;n<Math.min(clip.frames.length,index+12);n++){const src=clip.frames[n];if(loaded.has(src))continue;const img=new Image();const entry={img,ready:false};loaded.set(src,entry);entry.promise=new Promise(resolve=>{img.onload=async()=>{try{await img.decode();entry.ready=true;}catch{}resolve();};img.onerror=()=>resolve();});img.src=src;}while(loaded.size>240){loaded.delete(loaded.keys().next().value);}}
let loadingFrame=false;
function animate(){clearTimeout(frameTimer);if(document.hidden||!assetsReady||loadingFrame)return;const frame=player.sample(reduced.matches);preload(frame.name,frame.index);const entry=loaded.get(frame.path);if(!entry.ready){loadingFrame=true;player.pause('loading');entry.promise.then(()=>{loadingFrame=false;player.resume('loading');if(entry.ready)animate();else frameTimer=setTimeout(animate,250);});return;}if(frame.path!==lastFrame){pet.src=frame.path;lastFrame=frame.path;}frameTimer=setTimeout(animate,player.nextDelay);}
document.addEventListener('visibilitychange',()=>{clearTimeout(frameTimer);if(document.hidden){player.pause();}else{player.resume();animate();draw();}});
player.pause('loading');if(document.hidden)player.pause();
preload('idle');
Promise.all([...loaded.values()].map(entry=>entry.promise)).then(()=>{assetsReady=true;player.resume('loading');animate();});
const choice=document.getElementById('animationChoice');for(const action of manifest.catalog||[]){const option=document.createElement('option');option.value=action.id;option.textContent=action.nameZh;choice.appendChild(option);}choice.addEventListener('change',()=>{if(!choice.value)return;player.cancelReaction();player.react(choice.value);animate();choice.value='';});
reduced.addEventListener('change',()=>animate());
function say(text,ms=2800){bubble.textContent=text;until=Date.now()+ms;bubble.style.display='block'}
pet.draggable=false;stage.style.touchAction='none';stage.style.userSelect='none';let press=null;
stage.addEventListener('pointerdown',e=>{if(e.button!==0||press)return;press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};stage.setPointerCapture(e.pointerId);});
stage.addEventListener('pointermove',e=>{if(!press||press.id!==e.pointerId)return;if(!press.moved&&Math.abs(e.clientX-press.x)+Math.abs(e.clientY-press.y)>=8){press.moved=true;player.beginDrag();animate();}});
function releasePet(e,canceled=false){if(!press||press.id!==e.pointerId)return;const moved=press.moved;press=null;player.endDrag();if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);if(!moved&&!canceled){say(phrases[Math.floor(Math.random()*phrases.length)]);player.react('hug');}animate();}
stage.addEventListener('pointerup',e=>releasePet(e));stage.addEventListener('pointercancel',e=>releasePet(e,true));stage.addEventListener('lostpointercapture',e=>releasePet(e,true));
document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:el.dataset.action})));
document.querySelectorAll('[data-state]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:'setState',state:el.dataset.state})));
let current={state:'idle',project:'',at:0};let seenAt=0;
function draw(){if(document.hidden)return;let label={idle:'💤 待机中',working:'💻 正在处理',tool:'🛠️ 正在调用工具',editing:'📝 已修改文件',done:'✨ 完成啦',sleep:'🌙 休息中'}[current.state]||'待机中';
 document.getElementById('status').textContent=current.presentation?.label||label;stage.className=current.state;
 let elapsed=(Date.now()-Number(current.at))/1000;
 const age=Number.isFinite(elapsed)&&elapsed>=0?Math.floor(elapsed):0;
 const active=['working','tool','editing'].includes(current.state);
 const stale=active&&age>180;
 const started=Number(current.startedAt)||Number(current.at);
 const elapsedTask=started>0?Math.max(0,Math.floor((Date.now()-started)/1000)):0;
 document.getElementById('activity').textContent=(current.detail?current.detail+' · ':'')+(current.project?'项目：'+current.project+' · ':'')+
   (current.at?'上次事件 '+age+' 秒前':'等待 Agent 事件');
 document.getElementById('events').textContent=(current.source==='session'?'本地会话：':'事件：')+(current.event||'暂无')+
   ' · 本轮 '+(current.eventCount||0)+' 次 · 已用 '+elapsedTask+' 秒'+(stale?' · 完成状态未确认':'')+
   (typeof current.contextUsage==='number'?' · 上下文 '+current.contextUsage.toFixed(1)+'%':'')+
   (current.activeSessions>1?' · '+current.activeSessions+' 个会话处理中':'');
 if(active&&Date.now()>until){bubble.textContent=stale?'暂未收到新的 Kiro 记录 · 不代表 AI 已完成':(current.detail||label); bubble.style.display='block';}
 else if(Date.now()>until)bubble.style.display='none';}
window.addEventListener('message',evt=>{const data=evt.data;if(!data||data.type!=='activity')return;
 let next=data.activity;const transition=next.presentation ? next.presentation.seq!==current.presentation?.seq||next.state!==current.state : next.at!==current.at||next.state!==current.state||next.session!==current.session;const key=JSON.stringify([next.at,next.state,next.session,next.reply,next.replyUntil]);const newEvent=key!==seenAt;if(newEvent){seenAt=key;let map={working:'正在处理你的请求',tool:'调用工具中…',editing:'正在更新文件',done:'大功告成！',idle:'随时待命～',sleep:'呼噜呼噜～'};const reply=next.reply&&next.replyUntil>Date.now();say(reply?'回答 · '+next.reply:next.detail||map[next.state]||'嗨～',reply?Math.min(8000,next.replyUntil-Date.now()):2800)}
 current=next;player.setPresentation(next.presentation);if(transition)player.setState(next.presentation?.intent==='idle'?'idle':next.state,next.state==='done'||next.phase==='start');animate();draw();});
setInterval(draw,500);vscode.postMessage({type:'ready'});
</script></body></html>`;
}
function openPanel() {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside); refresh(); return; }
  panel = vscode.window.createWebviewPanel('kiroWhalePet', '🐋 鲸鱼娘桌宠',
    {viewColumn: vscode.ViewColumn.Beside, preserveFocus: true},
    {enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots:[vscode.Uri.file(assetsDir())]});
  panel.webview.html = htmlFor(panel.webview);
  panel.onDidDispose(() => {panel=null;}, null, extContext.subscriptions);
  panel.webview.onDidReceiveMessage(async msg => {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready': refresh(); break;
      case 'showDesktop': startDesktop(true); break;
      case 'hideDesktop': stopDesktop(); break;
      case 'installHooks': await installHooks(); break;
      case 'checkLink': await checkLink(); break;
      case 'checkSessions': await checkSessions(); break;
      case 'openSettings': openSettings(); break;
      case 'behavior': openBehaviorMenu(); break;
      case 'setState': if (STATES.has(msg.state)) writeActivity(msg.state); break;
      default: break;
    }
  }, null, extContext.subscriptions);
  refresh();
}
function configureBehavior() {
  behaviorPolicy.configure({mode:settings().get('behavior.mode','balanced'),
    pools:settings().get('behavior.pools',{}),excluded:settings().get('behavior.excluded',[])});
}
async function chooseBehaviorMode() {
  const picked=await vscode.window.showQuickPick(Object.entries(MODES).map(([id,value])=>({id,label:value.label,
    description:id===settings().get('behavior.mode','balanced')?'当前模式':'',
    detail:`随机动作播完后休息 ${value.restMinMs/1000}～${value.restMaxMs/1000} 秒`})),{placeHolder:'选择桌宠活跃度'});
  if(picked) await settings().update('behavior.mode',picked.id,vscode.ConfigurationTarget.Global);
}
async function chooseActionPool() {
  const picked=await vscode.window.showQuickPick(Object.entries(INTENTS).map(([id,value])=>({id,label:value.label})),{placeHolder:'选择要配置动作的状态'});
  if(!picked)return;
  const pools=settings().get('behavior.pools',{});
  const current=new Set(pools[picked.id] || behaviorPolicy.pools[picked.id].map(id=>behaviorPolicy.manifest.clips[id].sourceId||id));
  const excluded=new Set(settings().get('behavior.excluded',[]));
  const actions=behaviorPolicy.manifest.catalog.filter(a=>!excluded.has(a.id)).map(a=>({id:a.id,label:a.nameZh,
    description:behaviorPolicy.manifest.categoryLabels[a.category],picked:current.has(a.id)}));
  const selected=await vscode.window.showQuickPick(actions,{canPickMany:true,placeHolder:`${picked.label}：勾选动作；全不选则恢复默认（被排除的动作不参与）`});
  if(!selected)return;
  const next={...pools}; if(selected.length)next[picked.id]=selected.map(a=>a.id);else delete next[picked.id];
  await settings().update('behavior.pools',next,vscode.ConfigurationTarget.Global);
}
async function chooseExcludedActions() {
  const excluded=new Set(settings().get('behavior.excluded',[]));
  const selected=await vscode.window.showQuickPick(behaviorPolicy.manifest.catalog.map(a=>({id:a.id,label:a.nameZh,
    description:behaviorPolicy.manifest.categoryLabels[a.category],picked:excluded.has(a.id)})),
    {canPickMany:true,placeHolder:'勾选不希望自动播放的动作；手动预览仍可使用，呼吸是空池保底动作'});
  if(selected)await settings().update('behavior.excluded',selected.map(a=>a.id),vscode.ConfigurationTarget.Global);
}
async function openBehaviorMenu() {
  const picked=await vscode.window.showQuickPick([
    {label:'活跃度：'+MODES[behaviorPolicy.mode].label,run:chooseBehaviorMode},
    {label:'配置各状态的动作池',run:chooseActionPool},
    {label:'排除不喜欢的自动动作',run:chooseExcludedActions},
    {label:'恢复默认动作池',run:async()=>{await settings().update('behavior.pools',{},vscode.ConfigurationTarget.Global);await settings().update('behavior.excluded',[],vscode.ConfigurationTarget.Global);}},
  ],{placeHolder:'鲸鱼娘 · 活跃度与动作设置（自动保存，立即生效）'});
  if(picked)await picked.run();
}
function consumeBehaviorRequest() {
  const file=localStateFile()+'.request.json';
  if(!fs.existsSync(file))return;
  let request;try{request=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return;}
  fs.unlinkSync(file);
  if(request.type==='mode' && MODES[request.mode]) settings().update('behavior.mode',request.mode,vscode.ConfigurationTarget.Global);
  else if(request.type==='state' && STATES.has(request.state))writeActivity(request.state);
  else if(request.type==='configure')openBehaviorMenu();
}
function openSettings() { return vscode.commands.executeCommand('workbench.action.openSettings', 'kiroWhalePet'); }
async function openAdvancedMenu() {
  const choices = [
    {label:'$(sync) 工作中', fn:()=>writeActivity('working')},
    {label:'$(check) 完成啦', fn:()=>writeActivity('done')},
    {label:'$(coffee) 待机', fn:()=>writeActivity('idle')},
    {label:'$(tools) 调用工具', fn:()=>writeActivity('tool')},
    {label:'$(edit) 修改文件', fn:()=>writeActivity('editing')},
    {label:'$(moon) 休息', fn:()=>writeActivity('sleep')},
    {label:'$(pulse) 检查联动与完成事件', fn:checkLink},
    {label:'$(eye) 诊断本地会话监听（本地记录）', fn:checkSessions},
    {label:'$(plug) 为当前项目安装智能体联动', fn:installHooks},
    {label:'$(files) 为所有已打开项目安装智能体联动', fn:installHooksAll},
    {label:'$(trash) 移除当前项目联动', fn:removeHooks}
  ];
  const chosen = await vscode.window.showQuickPick(choices, {placeHolder:'鲸鱼娘 · 手动演示与诊断'});
  if (chosen) await chosen.fn();
}
async function openMenu() {
  const autoStart = settings().get('autoStart', true);
  const choices = [
    {label:'$(window) 显示桌面悬浮窗', fn:()=>startDesktop(true)},
    {label:'$(preview) 打开编辑器内桌宠面板', fn:openPanel},
    {label:'$(close) 关闭桌面悬浮窗', fn:stopDesktop},
    {label:'$(heart) 活跃度与动作设置', fn:openBehaviorMenu},
    {label:'$(settings-gear) 设置', fn:openSettings},
    {label:`$(play) ${autoStart?'关闭':'开启'} 编辑器启动时自动显示`, fn:toggleAutoStart},
    {label:'$(tools) 手动演示与诊断…', fn:openAdvancedMenu}
  ];
  const chosen = await vscode.window.showQuickPick(choices, {placeHolder:'鲸鱼娘桌宠 · 选择操作'});
  if (chosen) await chosen.fn();
}
function activate(context) {
  extContext=context;
  activityStore = new ActivityStore(dataDir());
  behaviorPolicy = new BehaviorPolicy(JSON.parse(fs.readFileSync(path.join(assetsDir(),'animations/manifest.json'),'utf8')));
  configureBehavior();
  writeSnapshot = activityStore.write.bind(activityStore);
  activityStore.write = activity => { behaviorPolicy.submit(activity); writeSnapshot({...activity,presentation:behaviorPolicy.sample()}); };
  lastHookSignature = undefined;
  try { writableFiles(); } catch (e) { vscode.window.showWarningMessage('鲸鱼娘初始化配置目录失败：'+e.message); }
  const prev = readActivity();
  if (Date.now()-prev.at>15*60*1000) writeActivity('idle');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  statusItem.command = P+'openMenu'; statusItem.show(); context.subscriptions.push(statusItem);
  const register=(name,fn)=>context.subscriptions.push(vscode.commands.registerCommand(P+name,fn));
  register('openMenu', openMenu);
  register('behavior', openBehaviorMenu);
  register('show', ()=>startDesktop(true));
  register('openPanel', openPanel);
  register('hide', stopDesktop);
  register('working', ()=>writeActivity('working'));
  register('done', ()=>writeActivity('done'));
  register('idle', ()=>writeActivity('idle'));
  register('sleep', ()=>writeActivity('sleep'));
  register('tool', ()=>writeActivity('tool'));
  register('editing', ()=>writeActivity('editing'));
  register('reportActivity', event => {
    if (event && STATES.has(event.state)) writeActivity(event.state, String(event.project || ''), event.detail || '', event.phase || '');
  });
  register('installHooks', installHooks);
  register('checkLink', checkLink);
  register('checkSessions', checkSessions);
  register('installHooksAll', installHooksAll);
  register('removeHooks', removeHooks);
  register('toggleAutoStart', toggleAutoStart);
  refreshTimer = setInterval(refresh, 250);
  context.subscriptions.push({dispose:()=>{clearInterval(refreshTimer);refreshTimer=null;}});
  startSessionMonitor();
  context.subscriptions.push({dispose:()=>sessionMonitor?.dispose()});
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('kiroWhalePet.behavior')) { configureBehavior(); refresh(); }
    if (event.affectsConfiguration('kiroWhalePet.localSessions')) startSessionMonitor();
  }));
  // Existing generated hooks can be older than the extension itself.
  if (!settings().get('localSessions.enabled', true)) upgradeOwnedHooks();
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(evt => {
    startSessionMonitor();
    if (!settings().get('localSessions.enabled', true) && settings().get('autoInstallHooksNewProjects',false)) installForFolders(evt.added.filter(w=>w.uri.scheme==='file'), true);
  }));
  refresh();
  if (settings().get('autoStart',true)) startDesktop();
}
function deactivate() {
  sessionMonitor?.dispose(); stopDesktop();
  if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}
  activityStore?.dispose();
}
module.exports={activate,deactivate};
