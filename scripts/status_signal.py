"""Normalize actual Hook metadata; never persist prompts, tool results or file contents."""
import json
import os
import re
import sys
import time

LABELS = {'idle': '待机中', 'working': '正在处理你的请求', 'tool': '正在调用工具',
          'editing': '正在更新文件', 'done': '任务完成', 'sleep': '休息中'}


def clean(value, limit=100):
    return re.sub(r'[\x00-\x1f\x7f]', ' ', str(value or ''))[:limit]


def activity(state, project='', event=None):
    event = event if isinstance(event, dict) else {}
    tool = clean(event.get('tool_name') or event.get('toolName'), 80)
    inputs = event.get('tool_input') or event.get('toolInput') or {}
    inputs = inputs if isinstance(inputs, dict) else {}
    filename = clean(event.get('file_path') or inputs.get('file_path') or inputs.get('path'), 240)
    filename = filename.replace('\\', '/').rstrip('/').rsplit('/', 1)[-1][:80]
    label = LABELS.get(state, LABELS['idle'])
    if state == 'tool' and tool:
        lower = tool.lower()
        label = ('正在读取文件' if re.search('read|view|open', lower) else
                 '正在搜索' if re.search('search|grep|find', lower) else
                 '正在更新文件' if re.search('write|edit|patch|replace', lower) else
                 '正在运行命令' if re.search('shell|exec|bash|terminal', lower) else '正在调用工具')
        label += ' · ' + (filename or tool)
    elif state == 'editing' and filename:
        label += ' · ' + filename
    elif state == 'working' and str(event.get('hook_event_name', '')).lower() == 'posttooluse':
        label = '工具已返回，继续处理' + (' · ' + tool if tool else '')
    event_name = str(event.get('hook_event_name','')).lower()
    phase = 'start' if event_name=='promptsubmit' else 'finish' if event_name=='agentstop' else 'continue'
    return {'state': state, 'phase':phase, 'project': clean(project, 80), 'detail': label,
            'tool': tool, 'file': filename, 'at': time.time_ns() // 1_000_000}


def main():
    target, state, project = sys.argv[1:4]
    try:
        event = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except (ValueError, OSError):
        event = {}
    payload = activity(state, project, event)
    if len(sys.argv)>4 and sys.argv[4] in ('start','continue','finish'):
        payload['phase']=sys.argv[4]
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    temporary = target + '.' + str(os.getpid()) + '.tmp'
    try:
        with open(temporary, 'w', encoding='utf8') as file:
            json.dump(payload, file, ensure_ascii=False)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass  # A pet must not break the agent's Hook or print into its context.
