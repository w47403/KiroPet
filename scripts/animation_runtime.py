"""Dependency-free frame timing shared by the Tk companion and tests."""


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
