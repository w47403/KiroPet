'use strict';
// Metadata-only event stream shared by the extension, diagnostics and tests.
// Hook events are discrete notifications, not model tokens or raw chat text.
const ACTIVE_STATES = new Set(['working', 'tool', 'editing']);
function eventProgress(activity, now = Date.now()) {
  const since = Number(activity?.startedAt) || Number(activity?.at) || 0;
  const last = Number(activity?.at) || 0;
  const active = ACTIVE_STATES.has(activity?.state);
  const durationSeconds = since && now >= since ? Math.floor((now - since) / 1000) : 0;
  const stale = !!(active && last && now - last > 180000);
  return {
    active, stale, durationSeconds,
    eventCount: Math.max(0, Number(activity?.eventCount) || 0),
    label: stale ? '暂未收到新的 Hook 事件，是否完成尚未确认' :
      activity?.state === 'done' ? 'AgentStop 已确认任务完成' :
      active ? '等待 Kiro 后续事件' : '等待新任务'
  };
}
function isManagedHook(data) {
  if (!data || data.version !== 'v1' || !Array.isArray(data.hooks) || !data.hooks.length) return false;
  const allowed = new Set(['PromptSubmit','PreToolUse','PostToolUse','PostFileSave','FileSave','AgentStop']);
  return data.hooks.every(h => allowed.has(h.trigger) &&
    typeof h.name === 'string' &&
    (h.name.startsWith('Whale Pet - ') || h.name.startsWith('鲸鱼娘 · ')) &&
    h.action?.type === 'command' && /HookSignal\.(ps1|sh)/.test(h.action.command || ''));
}
function inspectHooks(folders, readConfig) {
  return folders.map(folder => {
    try {
      const data = readConfig(folder);
      if (!data) return {folder, status:'missing'};
      if (!isManagedHook(data)) return {folder, status:'custom'};
      if (!data.hooks.some(h => h.trigger === 'AgentStop' && /-State done |'done'/.test(h.action.command || '')))
        return {folder,status:'no-stop'};
      return {folder,status:'ok'};
    } catch (_) { return {folder,status:'invalid'}; }
  });
}
module.exports={eventProgress,isManagedHook,inspectHooks};
