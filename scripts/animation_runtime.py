"""Dependency-free frame timing shared by the Tk companion and tests."""
import random


class IdleDirector:
    """Play an occasional one-shot, then quietly hold its resting pose."""
    def __init__(self, manifest, now_ms=0, rng=None):
        self.manifest = manifest
        self.rng = rng or random.Random()
        self.reset(now_ms)

    def reset(self, now_ms):
        self.name = 'idle'
        self.started = None
        self.next_at = now_ms + self.manifest.get('idleBehavior', {}).get('initialHoldMs',22000)

    def sample(self, now_ms):
        if now_ms >= self.next_at:
            names = [n for n in self.manifest.get('idleBehavior', {}).get('clips', ['idle'])
                     if n in self.manifest['clips'] and n != self.name]
            self.name = self.rng.choice(names) if names else 'idle'
            self.started = now_ms
            behavior=self.manifest.get('idleBehavior', {})
            self.next_at = now_ms + sum(self.manifest['clips'][self.name]['durations']) + self.rng.uniform(
                behavior.get('restMinMs',18000), behavior.get('restMaxMs',45000))
        clip = dict(self.manifest['clips'][self.name], loop=False)
        return self.name, 0 if self.started is None else frame_at(clip, now_ms-self.started)


class WorkDirector:
    """One setup per task, continuing loops and occasional desk-side breaks."""
    def __init__(self, manifest, rng=None):
        self.manifest = manifest
        self.rng = rng or random.Random()
        self.started = None
        self.accent = None
        self.next_at = float('inf')

    def set_state(self, previous, current, now_ms, restart=False):
        active = ('working','tool','editing')
        if current in active and (previous not in active or restart):
            self.started = now_ms
            self.accent = None
            self.next_at = now_ms + sum(self.manifest['clips'].get('work_start',{}).get('durations',[])) + 18000
        elif current not in active:
            self.started = None
            self.accent = None

    def sample(self, state, now_ms):
        intro = self.manifest['clips'].get('work_start')
        total = sum(intro['durations']) if intro else 0
        if intro and now_ms-self.started < total:
            return 'work_start', frame_at(intro,now_ms-self.started)
        if self.accent and now_ms-self.accent >= sum(self.manifest['clips']['work_pause']['durations']):
            self.accent = None
        if state!='tool' and self.accent is None and now_ms>=self.next_at and 'work_pause' in self.manifest['clips']:
            self.accent = now_ms
            self.next_at = now_ms + sum(self.manifest['clips']['work_pause']['durations']) + self.rng.uniform(18000,35000)
        name = 'work_pause' if (state=='tool' and 'work_pause' in self.manifest['clips']) or self.accent is not None else state
        clip = self.manifest['clips'][name]
        if self.accent is not None and state!='tool':
            return name, frame_at(dict(clip,loop=False),now_ms-self.accent)
        return name, frame_at(dict(clip,loop=True) if state=='tool' and name=='work_pause' else clip,
                              now_ms-self.started-total)


def frame_at(clip, elapsed_ms):
    durations = clip['durations']
    total = sum(durations)
    remaining = max(0, elapsed_ms)
    if clip.get('loop'):
        remaining %= total
    elif remaining >= total:
        return len(durations) - 1
    for index, duration in enumerate(durations):
        if remaining < duration:
            return index
        remaining -= duration
    return len(durations) - 1
