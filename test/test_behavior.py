import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from animation_runtime import IdleDirector, WorkDirector, DragDirector, frame_delay
from dock_runtime import snap, hidden_position, ease_out, TAB_EXPOSURE
from status_signal import activity, merge_activity


class BehaviorTest(unittest.TestCase):
    def test_adaptive_frame_deadlines(self):
        clip = {'durations': [160, 320], 'loop': True}
        for elapsed, expected in [(80,80), (160,250), (470,16), (480,160)]:
            self.assertEqual(frame_delay(clip, elapsed), expected)
        self.assertEqual(frame_delay(dict(clip, loop=False), 1000), 250)
        manifest=json.loads((ROOT/'assets/animations/manifest.json').read_text())
        idle=IdleDirector(manifest,0)
        idle.sample(21950)
        self.assertEqual(idle.next_delay,50)

    def test_drag_continues_loop_and_freezes_underlying_work_clock(self):
        manifest=json.loads((ROOT/'assets/animations/manifest.json').read_text())
        drag=DragDirector(manifest)
        work=WorkDirector(manifest)
        work.set_state('idle','working',0)
        before=work.sample('working',2000)
        drag.begin(2000)
        self.assertEqual(drag.sample(2160),('drag',1))
        self.assertEqual(drag.sample(2160+sum(manifest['clips']['drag']['durations'])),('drag',1))
        self.assertEqual(work.sample('working',drag.timeline(30000)),before)
        drag.end(30000)
        self.assertIsNone(drag.sample(30000))
        self.assertEqual(work.sample('working',drag.timeline(30000)),before)
        drag.begin(31000);drag.begin(32000)
        work.set_state('working','working',drag.timeline(33000),True)
        drag.end(34000)
        self.assertEqual(work.sample('working',drag.timeline(34000)),('work_start',0))

    def test_task_intro_continues_across_tools_and_work_break_is_one_shot(self):
        manifest=json.loads((ROOT/'assets/animations/manifest.json').read_text())
        director=WorkDirector(manifest,random.Random(2))
        director.set_state('idle','working',0)
        self.assertEqual(director.sample('working',0),('work_start',0))
        before=director.sample('working',1000)
        director.set_state('working','tool',1000)
        self.assertEqual(director.sample('tool',1000),before)
        total=sum(manifest['clips']['work_start']['durations'])
        self.assertEqual(director.sample('working',total+1)[0],'working')
        self.assertEqual(director.sample('working',24000)[0],'work_pause')
        end=24000+sum(manifest['clips']['work_pause']['durations'])
        self.assertEqual(director.sample('working',end)[0],'working')
        director.set_state('working','done',end)
        self.assertIsNone(director.started)
        director.set_state('done','working',end+100)
        self.assertEqual(director.sample('working',end+100),('work_start',0))
        director.set_state('working','working',end+1000,True)
        self.assertEqual(director.sample('working',end+1000),('work_start',0))

    def test_quiet_idle_interruption_and_nonrepetition(self):
        manifest = json.loads((ROOT/'assets/animations/manifest.json').read_text())
        director = IdleDirector(manifest, 0, random.Random(12))
        for now in (0,1000,21999): self.assertEqual(director.sample(now),('idle',0))
        first = director.sample(22000)[0]
        self.assertNotEqual(first,'idle')
        self.assertEqual(director.sample(22000+sum(manifest['clips'][first]['durations'])),(first,len(manifest['clips'][first]['frames'])-1))
        second = director.sample(director.next_at)[0]
        self.assertNotEqual(first,second)
        director.reset(100000)
        self.assertEqual(director.sample(121999),('idle',0))

    def test_docking_corners_and_negative_monitor_coordinates(self):
        area = (-1920,-100,0,980)
        self.assertEqual(snap(-1910,-90,232,266,area),('left',-1920,-100))
        self.assertIsNone(snap(-900,300,232,266,area))
        self.assertEqual(hidden_position('left',-1920,50,232,266,area),(-2096,50))
        self.assertEqual(hidden_position('right',-232,50,232,266,area),(-56,50))
        self.assertEqual(hidden_position('top',-500,-100,232,266,area),(-500,-310))
        self.assertEqual(hidden_position('bottom',-500,714,232,266,area),(-500,924))
        self.assertEqual(TAB_EXPOSURE, 56)
        # Every edge exposes the exact same clickable face strip.
        for edge in ('left', 'right', 'top', 'bottom'):
            result = hidden_position(edge, -1920, 0, 232, 266, area)
            if edge == 'left': self.assertEqual(result[0]+232, -1920+TAB_EXPOSURE)
            elif edge == 'right': self.assertEqual(result[0], 0-TAB_EXPOSURE)
            elif edge == 'top': self.assertEqual(result[1]+266, -100+TAB_EXPOSURE)
            else: self.assertEqual(result[1], 980-TAB_EXPOSURE)
        self.assertEqual(ease_out(0),0); self.assertEqual(ease_out(1),1)
        self.assertGreater(ease_out(.5),.5)

    def test_metadata_shows_work_without_retaining_contents_or_commands(self):
        event = {'tool_name':'read_file','tool_input':{'path':'C:\\project\\README.md',
                 'command':'secret-shell-argument'},'prompt':'private chat','tool_response':'private content'}
        payload=activity('tool','demo',event)
        self.assertEqual(payload['detail'],'正在读取文件 · README.md')
        self.assertEqual(payload['file'],'README.md')
        self.assertNotIn('private',json.dumps(payload)); self.assertNotIn('secret',json.dumps(payload))
        self.assertEqual(activity('working','',dict(event,hook_event_name='PostToolUse'))['detail'],
                         '工具已返回，继续处理 · read_file')

    def test_agent_stop_survives_late_tool_callbacks_and_restarts_on_new_prompt(self):
        start = activity('working', 'demo', {'hook_event_name':'PromptSubmit','session_id':'one'})
        start['at'] = 1000
        current = merge_activity({}, start)
        self.assertEqual(current['eventCount'], 1)
        self.assertEqual(current['startedAt'], 1000)
        tool = activity('tool', 'demo', {'hook_event_name':'PreToolUse','tool_name':'remote_web_search','session_id':'one'})
        tool['at'] = 2000
        current = merge_activity(current, tool)
        self.assertEqual((current['state'],current['eventCount'],current['startedAt']), ('tool',2,1000))
        done = activity('done','demo',{'hook_event_name':'AgentStop','session_id':'one'})
        done['at'] = 3000
        current = merge_activity(current, done)
        self.assertEqual(current['phase'], 'finish')
        self.assertEqual(current['eventCount'], 3)
        late = activity('working','demo',{'hook_event_name':'PostToolUse','session_id':'one'})
        late['at'] = 4000
        self.assertEqual(merge_activity(current,late),current)
        other = activity('working','different',{'hook_event_name':'PreToolUse','session_id':'two'})
        other['at'] = 5000
        self.assertEqual(merge_activity(current,other)['state'],'working')
        restart = activity('working','demo',{'hook_event_name':'PromptSubmit','session_id':'one'})
        restart['at'] = 6000
        result = merge_activity(current,restart)
        self.assertEqual((result['state'],result['startedAt'],result['eventCount']),('working',6000,1))
        self.assertNotEqual(current['session'], 'one')  # raw session ID is never persisted

    def test_real_hook_exit_does_not_overwrite_done(self):
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory)/'activity.json')
            script = str(ROOT/'scripts/status_signal.py')
            for kind, name in [('working','PromptSubmit'),('done','AgentStop'),('tool','PreToolUse')]:
                data = json.dumps({'hook_event_name':name, 'session_id':'abc123', 'tool_name':'remote_web_search'})
                proc = subprocess.run([sys.executable,script,target,kind,'demo'],input=data,text=True,capture_output=True)
                self.assertEqual(proc.returncode,0)
            data = json.loads(Path(target).read_text(encoding='utf8'))
            self.assertEqual(data['state'],'done')
            self.assertEqual(data['eventCount'],2)

    def test_hook_reader_handles_real_stdin_and_malformed_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            target=str(Path(directory)/'activity.json')
            for raw in ('{"tool_name":"read_file","tool_input":{"path":"/a/main.py"}}','invalid'):
                proc=subprocess.run([sys.executable,str(ROOT/'scripts/status_signal.py'),target,'tool','demo'],
                                    input=raw, text=True,capture_output=True)
                self.assertEqual(proc.returncode,0); self.assertEqual(proc.stdout,'')
                payload=json.loads(Path(target).read_text(encoding='utf8'))
                self.assertEqual(payload['state'],'tool')
            subprocess.run([sys.executable,str(ROOT/'scripts/status_signal.py'),target,'working','demo','start'],
                           input='{}',text=True,check=True)
            self.assertEqual(json.loads(Path(target).read_text(encoding='utf8'))['phase'],'start')
            if sys.platform=='win32':
                proc=subprocess.run(['powershell.exe','-NoLogo','-NoProfile','-File',
                    str(ROOT/'scripts/HookSignal.ps1'),'-StatePath',target,'-State','tool','-Project','demo'],
                    input='{"tool_name":"read_file","tool_input":{"path":"/a/main.py"}}',
                    text=True,capture_output=True)
                self.assertEqual(proc.returncode,0,proc.stderr)
                payload=json.loads(Path(target).read_text(encoding='utf8'))
                self.assertEqual(payload['detail'],'正在读取文件 · main.py')
                subprocess.run(['powershell.exe','-NoLogo','-NoProfile','-File',str(ROOT/'scripts/HookSignal.ps1'),
                    '-StatePath',target,'-State','working','-Phase','start'],input='{}',text=True,check=True,capture_output=True)
                self.assertEqual(json.loads(Path(target).read_text(encoding='utf8'))['phase'],'start')


if __name__=='__main__': unittest.main()
