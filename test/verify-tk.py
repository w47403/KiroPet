"""Decode and exercise the actual Tk window without showing it. Linux needs Xvfb."""
import json
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))


with tempfile.TemporaryDirectory(prefix='kiropet-tk-') as directory:
    state_file = Path(directory)/'activity.json'
    preferences_file = Path(directory)/'preferences.json'
    from preferences import save_preferences, read_preferences
    save_preferences(str(preferences_file), dict(size=190, configuredSize=190, left=110, top=140,
                                               mute=True, dockEnabled=False, notifyOnDone=False))
    sys.argv = ['WhalePet.py', '--image', str(ROOT/'assets/whale-girl.png'),
                '--state', str(state_file), '--preferences', str(preferences_file)]
    source = (ROOT/'scripts/WhalePet.py').read_text(encoding='utf-8')
    setup = source[:source.rindex("say('嗨～一起写代码吧！')")]
    namespace = {'__name__': '__main__'}
    began = time.perf_counter()
    exec(compile(setup, str(ROOT/'scripts/WhalePet.py'), 'exec'), namespace)
    root = namespace['root']
    try:
        root.update_idletasks()
        assert namespace['mute'] is True and namespace['dock_enabled'] is False and namespace['notify_on_done'] is False
        assert namespace['size'] == namespace['configured_size'] == 140, 'legacy preferences overrode the small default'
        assert namespace['photo'].height() == 140, 'default Tk frame does not use the 140px asset'
        unique = {p for clip in namespace['manifest']['clips'].values() for p in clip['frames']}
        assert len(namespace['image_cache']) == len(unique)
        for name, clip in namespace['manifest']['clips'].items():
            frames = namespace['frames_for'](name)
            assert len(frames) == len(clip['frames'])
            assert all(image.width() > 0 and image.height() > 0 for image in frames)
        state_file.write_text(json.dumps(dict(state='working', phase='start', at=1000)), encoding='utf-8')
        namespace['monitor']()
        started = namespace['work'].started
        namespace['interaction'].begin(time.monotonic()*1000)
        state_file.write_text(json.dumps(dict(state='tool', phase='continue', at=2000)), encoding='utf-8')
        namespace['monitor']()
        namespace['interaction'].end(time.monotonic()*1000)
        assert namespace['work'].started == started
        state_file.write_text(json.dumps(dict(state='done', phase='finish', at=3000)), encoding='utf-8')
        namespace['monitor']()
        assert namespace['state'] == 'done' and namespace['work'].started is None
        done_started = namespace['clip_start']
        state_file.write_text(json.dumps(dict(state='done', phase='finish', at=3000, reply='', replyUntil=0)), encoding='utf-8')
        namespace['monitor']()
        assert namespace['clip_start'] == done_started, 'preview changes replayed completion'
        animation_now=namespace['animation_now']
        clock=[100.0]
        namespace['animation_now']=lambda: clock[0]
        try:
            def event(state, at, phase='continue'):
                state_file.write_text(json.dumps(dict(state=state,at=at,phase=phase)),encoding='utf-8')
                namespace['monitor']()
            event('working',4000,'start')
            namespace['react']()
            assert namespace['reaction_start'] is None, 'registered idle entry pose allowed a pat during setup'
            clips=namespace['manifest']['clips']
            total=lambda name: sum(clips[name]['durations'])
            clock[0]+=(total('work_start')+.63*total('working'))/1000
            event('editing',5000)
            work=namespace['work']
            assert abs((clock[0]*1000-work.loop_started)/total('editing')-.63)<1e-9
            namespace['reaction_name']='work_pet'
            namespace['reaction_start']=clock[0]
            before=work.loop_started
            clock[0]+=.6
            event('editing',6000)
            assert namespace['reaction_start'] is None
            assert abs(work.loop_started-before-600)<1e-6, 'same-state event skipped reaction background time'
            phase=(clock[0]*1000-work.loop_started)/total('editing')
            event('tool',7000)
            clock[0]+=.7
            event('working',8000)
            assert abs((clock[0]*1000-work.loop_started)/total('working')-phase)<1e-9
        finally:
            namespace['animation_now']=animation_now
        namespace['toggle_mute']()
        namespace['toggle_dock']()
        # Exercise the actual Tk face strip and hover callback on both supported sides.
        positions = []
        smooth_to, pointerxy = namespace['smooth_to'], root.winfo_pointerxy
        namespace['smooth_to'] = lambda x, y: positions.append((x, y))
        root.winfo_pointerxy = lambda: (-10000, -10000)
        try:
            width, height, screenw, tab = (namespace[name] for name in ('W', 'H', 'screenw', 'TAB_EXPOSURE'))
            for edge, x, hidden_x in (('left', 0, -width+tab), ('right', screenw-width, screenw-tab)):
                namespace['dock_edge'] = edge
                namespace['dock_position'] = (x, 173)
                namespace['fold']()
                assert namespace['folded'] is True and positions[-1] == (hidden_x, 173)
                canvas = namespace['canvas']
                assert canvas.itemcget(namespace['tab_avatar'], 'state') == 'normal'
                bounds = canvas.coords(namespace['tab_id'])
                assert bounds[2]-bounds[0] == tab and bounds[3]-bounds[1] == 74
                assert canvas.bind('<Enter>'), 'mouse entry must expand the folded pet'
                namespace['unfold']()
                assert namespace['folded'] is False and positions[-1] == (x, 173)
                assert canvas.itemcget(namespace['tab_avatar'], 'state') == 'hidden'
            for edge in ('top', 'bottom'):
                namespace['dock_edge'] = edge
                before = len(positions)
                namespace['fold']()
                assert namespace['folded'] is False and len(positions) == before
        finally:
            namespace['smooth_to'], root.winfo_pointerxy = smooth_to, pointerxy
            namespace['dock_edge'] = None
        namespace['save_window']()
        saved = read_preferences(str(preferences_file))
        assert saved['mute'] is False and saved['dockEnabled'] is True and saved['notifyOnDone'] is False
        assert saved['size'] == saved['configuredSize'] == 140
        print(f'Tk decoded {len(unique)} shared images at 140px and verified side folding, hover expansion, task handoff, completion and saved preferences in {time.perf_counter()-began:.2f}s.')
    finally:
        root.destroy()
