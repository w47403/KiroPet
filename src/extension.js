'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

let extContext;
let child = null;
let statusItem = null;
let panel = null;
let activityPath = null;
let refreshTimer = null;
let lastDesktopError = '';
const P = 'kiroWhalePet.';
const STATES = new Set(['idle', 'working', 'tool', 'editing', 'done', 'sleep']);
const EMOJI = {idle: '$(smiley)', working: '$(sync~spin)', tool: '$(tools)', editing: '$(edit)', done: '$(check)', sleep: '$(moon)'};

function dataDir() { return extContext.globalStorageUri.fsPath; }
function localStateFile() { return path.join(dataDir(), 'activity.json'); }
function assetsDir() { return path.join(extContext.extensionPath, 'assets'); }
function settings() { return vscode.workspace.getConfiguration('kiroWhalePet'); }
function writableFiles() {
  const dir = dataDir();
  fs.mkdirSync(dir, {recursive: true});
  for (const item of ['HookSignal.ps1', 'HookSignal.sh']) {
    const target = path.join(dir, item);
    const source = path.join(extContext.extensionPath, 'scripts', item);
    fs.copyFileSync(source, target); // Stable path across VSIX upgrades.
    if (process.platform !== 'win32') fs.chmodSync(target, 0o700);
  }
}
function readActivity() {
  try {
    const obj = JSON.parse(fs.readFileSync(localStateFile(), 'utf8'));
    return {state: STATES.has(obj.state) ? obj.state : 'idle',
      project: String(obj.project || '').slice(0, 80), at: Number(obj.at) || 0};
  } catch (_) { return {state: 'idle', project: '', at: 0}; }
}
function writeActivity(state, project = '') {
  if (!STATES.has(state)) return;
  const dir = dataDir();
  try {
    fs.mkdirSync(dir, {recursive: true});
    const tmp = path.join(dir, `activity.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify({state, project, at: Date.now()}), 'utf8');
    fs.renameSync(tmp, localStateFile());
    refresh();
  } catch (err) { vscode.window.showWarningMessage('鲸鱼娘状态写入失败：' + err.message); }
}
function refresh() {
  const activity = readActivity();
  const text = EMOJI[activity.state] || EMOJI.idle;
  if (statusItem) {
    statusItem.text = `${text} 鲸鱼娘`;
    statusItem.tooltip = `鲸鱼娘 · ${activity.state}${activity.project ? ' · ' + activity.project : ''}\n点击打开控制菜单`;
  }
  if (panel) panel.webview.postMessage({type: 'activity', activity});
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
  writeActivity('idle');
  lastDesktopError = '';
  const size = Math.max(100, Math.min(320, Number(settings().get('size', 190)) || 190));
  const image = path.join(assetsDir(), 'whale-girl.png');
  const state = localStateFile();
  if (process.platform === 'win32') {
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA',
      '-File', path.join(extContext.extensionPath, 'scripts', 'WhalePet.ps1'),
      '-AssetPath', image, '-StatePath', state, '-InitialSize', String(size),
      '-ParentProcessId', String(process.pid)];
    spawnPet('powershell.exe', args, (err) => showErrorAndPanel(err));
  } else {
    const args = [path.join(extContext.extensionPath, 'scripts', 'WhalePet.py'),
      '--image', image, '--state', state, '--size', String(size), '--parent', String(process.pid)];
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
function hookCommand(state, projectName) {
  const project = safeProjectLabel(projectName);
  const stateFile = localStateFile();
  if (process.platform === 'win32') {
    return `powershell.exe -NoLogo -NoProfile -NonInteractive -File ${psQuote(path.join(dataDir(), 'HookSignal.ps1'))} -StatePath ${psQuote(stateFile)} -State ${state} -Project ${psQuote(project)}`;
  }
  return `/bin/sh ${shellQuote(path.join(dataDir(), 'HookSignal.sh'))} ${shellQuote(stateFile)} ${shellQuote(state)} ${shellQuote(project)}`;
}
function hookPath(folder) { return path.join(folder.uri.fsPath, '.kiro', 'hooks', 'whale-pet.json'); }
function buildHooks(projectName) {
  const pairs = [
    ['开始工作', 'PromptSubmit', 'working'],
    ['准备使用工具', 'PreToolUse', 'tool'],
    ['修改文件', 'PostFileSave', 'editing'],
    ['回答完成', 'AgentStop', 'done']
  ];
  return {version:'v1', hooks:pairs.map(([label, trigger, state]) => ({
    name: `Whale Pet - ${label}`, trigger, timeout: 5,
    action: {type:'command', command:hookCommand(state, projectName)}
  }))};
}
function recognizedHook(data) {
  return data && data.version === 'v1' && Array.isArray(data.hooks) && data.hooks.length >= 2 &&
    data.hooks.every(h => typeof h.name === 'string' &&
      (h.name.startsWith('Whale Pet - ') || h.name.startsWith('鲸鱼娘 · ')));
}
async function installForFolders(folders, silent = false) {
  if (!folders.length) return vscode.window.showWarningMessage('请先在 Kiro 打开一个本地项目文件夹。');
  if (!silent) {
    const answer = await vscode.window.showInformationMessage(
      `将在 ${folders.length} 个已打开项目下创建独立 .kiro/hooks/whale-pet.json，记录事件状态，不读取聊天内容。`,
      {modal:true}, '安装联动');
    if (answer !== '安装联动') return;
  }
  let installed = 0, skipped = 0;
  for (const folder of folders) {
    const target = hookPath(folder);
    if (fs.existsSync(target)) { skipped++; continue; }
    try {
      fs.mkdirSync(path.dirname(target), {recursive:true});
      fs.writeFileSync(target, JSON.stringify(buildHooks(folder.name), null, 2) + '\n', {flag:'wx'});
      installed++;
    } catch (err) {
      vscode.window.showErrorMessage(`${folder.name} Hook 安装失败：${err.message}`);
    }
  }
  if (!silent) vscode.window.showInformationMessage(
    `鲸鱼娘联动：新安装 ${installed} 个，跳过已有文件 ${skipped} 个。打开新 Agent 会话后生效。`);
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
  #pet{height:98%;max-width:100%;object-fit:contain;user-select:none;filter:drop-shadow(0 5px 6px rgba(49,136,202,.22));}
  #bubble{position:absolute;top:5px;z-index:2;max-width:88%;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:14px;padding:8px 12px;text-align:center;font-size:12px;box-shadow:0 4px 12px #0002}
  .buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
  button{border:1px solid var(--vscode-button-border,transparent);border-radius:7px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:9px;cursor:pointer}
  button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  #activity{font-size:12px;opacity:.78;text-align:center;min-height:20px}
  p{font-size:11px;opacity:.72;line-height:1.5}
</style></head><body>
<header><span>🐋 鲸鱼娘</span><span class="tag" id="status">待机中</span></header>
<div id="stage" title="点击摸摸头"><div id="bubble">嗨～一起写代码吧！</div><img id="pet" src="${uri}" alt="原创鲸鱼娘立绘"></div>
<div id="activity">正在准备…</div>
<div class="buttons">
<button data-action="showDesktop">打开桌面悬浮窗</button>
<button class="secondary" data-action="hideDesktop">关闭悬浮窗</button>
<button class="secondary" data-state="working">工作中</button>
<button class="secondary" data-state="tool">调用工具</button>
<button class="secondary" data-state="editing">修改文件</button>
<button class="secondary" data-state="done">完成啦</button>
<button class="secondary" data-state="idle">待机</button>
<button class="secondary" data-state="sleep">休息</button>
<button data-action="installHooks">开启项目联动</button>
</div>
<p>关闭这个面板后，随时按 Ctrl/Cmd + Shift + P，运行「鲸鱼娘：打开 Kiro 内桌宠面板」。状态来自 Agent 事件，不代表真实 token 数量或 AI 内部思考进度。</p>
<script nonce="${nonce}">
${playerSource}
const vscode=acquireVsCodeApi();const stage=document.getElementById('stage'),bubble=document.getElementById('bubble');
const phrases=['在呢～','呼噜呼噜～','摸摸头～','你写代码，我负责卖萌！'];let until=0;
const manifest=${JSON.stringify(manifest)};const pet=document.getElementById('pet');
const player=new WhaleAnimation.AnimationPlayer(manifest);const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const loaded=new Set();let frameTimer=null;let lastFrame='';
function preload(name){const clip=manifest.clips[name];if(!clip)return;for(const src of clip.frames){if(loaded.has(src))continue;loaded.add(src);const img=new Image();img.src=src;}}
function animate(){if(document.hidden)return;const frame=player.sample(reduced.matches);preload(frame.name);if(frame.path!==lastFrame){pet.src=frame.path;lastFrame=frame.path;}frameTimer=setTimeout(animate,80);}
document.addEventListener('visibilitychange',()=>{clearTimeout(frameTimer);if(document.hidden){player.pause();}else{player.resume();animate();draw();}});
preload('idle');animate();
function say(text){bubble.textContent=text;until=Date.now()+2800;bubble.style.display='block'}
stage.addEventListener('click',()=>{say(phrases[Math.floor(Math.random()*phrases.length)]);player.react('hug');preload('hug');});
document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:el.dataset.action})));
document.querySelectorAll('[data-state]').forEach(el=>el.addEventListener('click',()=>vscode.postMessage({type:'setState',state:el.dataset.state})));
let current={state:'idle',project:'',at:0};let seenAt=0;
function draw(){if(document.hidden)return;let label={idle:'💤 待机中',working:'💻 正在处理',tool:'🛠️ 正在调用工具',editing:'📝 已修改文件',done:'✨ 完成啦',sleep:'🌙 休息中'}[current.state]||'待机中';
 document.getElementById('status').textContent=label;stage.className=current.state;
 let elapsed=(Date.now()-Number(current.at))/1000;
 document.getElementById('activity').textContent=(current.project?'项目：'+current.project+' · ':'')+
   (elapsed>0&&Number.isFinite(elapsed)&&elapsed<36000?'事件发生于 '+Math.floor(elapsed)+' 秒前':'等待 Agent 事件');
 if(Date.now()>until)bubble.style.display='none';}
window.addEventListener('message',evt=>{const data=evt.data;if(!data||data.type!=='activity')return;
 let next=data.activity;const newEvent=next.at!==seenAt;if(newEvent){seenAt=next.at;let map={working:'开始工作啦～',tool:'调用工具中…',editing:'文件更新成功！',done:'大功告成！',idle:'随时待命～',sleep:'呼噜呼噜～'};say(map[next.state]||'嗨～')}
 current=next;player.setState(next.state,newEvent&&next.state==='done');preload(next.state);draw();});
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
      case 'setState': if (STATES.has(msg.state)) writeActivity(msg.state); break;
      default: break;
    }
  }, null, extContext.subscriptions);
  refresh();
}
async function openMenu() {
  const autoStart = settings().get('autoStart', true);
  const choices = [
    {label:'$(window) 显示桌面悬浮窗', fn:()=>startDesktop(true)},
    {label:'$(preview) 打开 Kiro 内桌宠面板（所有系统）', fn:openPanel},
    {label:'$(close) 关闭桌面悬浮窗', fn:stopDesktop},
    {label:'$(sync) 工作中', fn:()=>writeActivity('working')},
    {label:'$(check) 完成啦', fn:()=>writeActivity('done')},
    {label:'$(coffee) 待机', fn:()=>writeActivity('idle')},
    {label:'$(tools) 调用工具', fn:()=>writeActivity('tool')},
    {label:'$(edit) 修改文件', fn:()=>writeActivity('editing')},
    {label:'$(moon) 休息', fn:()=>writeActivity('sleep')},
    {label:'$(plug) 为当前项目安装 Agent 联动', fn:installHooks},
    {label:'$(files) 为所有已打开项目安装 Agent 联动', fn:installHooksAll},
    {label:'$(trash) 移除当前项目联动', fn:removeHooks},
    {label:`$(settings-gear) ${autoStart?'关闭':'开启'} Kiro 启动时自动显示`, fn:toggleAutoStart}
  ];
  const chosen = await vscode.window.showQuickPick(choices, {placeHolder:'鲸鱼娘桌宠 · 选择操作'});
  if (chosen) await chosen.fn();
}
function activate(context) {
  extContext=context;
  try { writableFiles(); } catch (e) { vscode.window.showWarningMessage('鲸鱼娘初始化配置目录失败：'+e.message); }
  const prev = readActivity();
  if (Date.now()-prev.at>15*60*1000) writeActivity('idle');
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20);
  statusItem.command = P+'openMenu'; statusItem.show(); context.subscriptions.push(statusItem);
  const register=(name,fn)=>context.subscriptions.push(vscode.commands.registerCommand(P+name,fn));
  register('openMenu', openMenu);
  register('show', ()=>startDesktop(true));
  register('openPanel', openPanel);
  register('hide', stopDesktop);
  register('working', ()=>writeActivity('working'));
  register('done', ()=>writeActivity('done'));
  register('idle', ()=>writeActivity('idle'));
  register('sleep', ()=>writeActivity('sleep'));
  register('tool', ()=>writeActivity('tool'));
  register('editing', ()=>writeActivity('editing'));
  register('installHooks', installHooks);
  register('installHooksAll', installHooksAll);
  register('removeHooks', removeHooks);
  register('toggleAutoStart', toggleAutoStart);
  refreshTimer = setInterval(refresh, 900);
  context.subscriptions.push({dispose:()=>{clearInterval(refreshTimer);refreshTimer=null;}});
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(evt => {
    if (settings().get('autoInstallHooksNewProjects',false)) installForFolders(evt.added.filter(w=>w.uri.scheme==='file'), true);
  }));
  refresh();
  if (settings().get('autoStart',true)) startDesktop();
}
function deactivate() { stopDesktop(); if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;} }
module.exports={activate,deactivate};
