"""Dependency-free frame timing shared by the Tk companion and tests."""
import random


def frame_delay(clip, elapsed_ms):
    remaining = max(0, elapsed_ms)
    total = sum(clip['durations'])
    if clip.get('loop'):
        remaining %= total
    elif remaining >= total:
        return 250
    for duration in clip['durations']:
        if remaining < duration:
            return max(16, min(250, duration - remaining))
        remaining -= duration
    return 250


def timed_frame(director, clip, elapsed_ms):
    director.next_delay = frame_delay(clip, elapsed_ms)
    return frame_at(clip, elapsed_ms)


class DragDirector:
    """Loop the held-collar pose while freezing the underlying task/idle clock."""
    def __init__(self, manifest):
        self.manifest = manifest
        self.started = None
        self.offset = 0

    def begin(self, now_ms):
        if self.started is None:
            self.started = now_ms

    def end(self, now_ms):
        if self.started is not None:
            self.offset += now_ms-self.started
            self.started = None

    def timeline(self, now_ms):
        return (self.started if self.started is not None else now_ms)-self.offset

    def sample(self, now_ms):
        if self.started is None:
            return None
        return 'drag', timed_frame(self, self.manifest['clips']['drag'],now_ms-self.started)


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
            weights = self.manifest.get('idleBehavior',{}).get('weights',{})
            pool = [name for name in names for _ in range(weights.get(name,1))]
            self.name = self.rng.choice(pool) if pool else 'idle'
            self.started = now_ms
            behavior=self.manifest.get('idleBehavior', {})
            self.next_at = now_ms + sum(self.manifest['clips'][self.name]['durations']) + self.rng.uniform(
                behavior.get('restMinMs',18000), behavior.get('restMaxMs',45000))
        clip = dict(self.manifest['clips'][self.name], loop=False)
        index = 0 if self.started is None else timed_frame(self, clip, now_ms-self.started)
        self.next_delay = max(16, min(250 if self.started is None else self.next_delay, self.next_at-now_ms))
        return self.name, index


class WorkDirector:
    """One setup per task, continuing loops and occasional desk-side breaks."""
    def __init__(self, manifest, rng=None):
        self.manifest = manifest
        self.rng = rng or random.Random()
        self.started = None
        self.accent = None
        self.next_at = float('inf')
        self.loop_started = 0

    def set_state(self, previous, current, now_ms, restart=False):
        active = ('working','tool','editing')
        if previous != current or restart: self.loop_started = now_ms
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
            return 'work_start', timed_frame(self, intro,now_ms-self.started)
        if self.accent and now_ms-self.accent >= sum(self.manifest['clips']['work_pause']['durations']):
            self.accent = None
        if state!='tool' and self.accent is None and now_ms>=self.next_at and 'work_pause' in self.manifest['clips']:
            self.accent = now_ms
            self.next_at = now_ms + sum(self.manifest['clips']['work_pause']['durations']) + self.rng.uniform(18000,35000)
        name = 'tool' if state=='tool' else 'work_pause' if self.accent is not None else state
        clip = self.manifest['clips'][name]
        if self.accent is not None and state!='tool':
            return name, timed_frame(self, dict(clip,loop=False),now_ms-self.accent)
        index = timed_frame(self, clip,
                            now_ms-max(self.loop_started,self.started+total))
        if state != 'tool':
            self.next_delay = max(16, min(self.next_delay, self.next_at-now_ms))
        return name, index


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
