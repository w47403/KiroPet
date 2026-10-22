"""Local desktop preferences; independent of Tk and animation state."""
import json
import math
import os
from pathlib import Path


def read_preferences(filename, configured_size=140):
    defaults = dict(size=configured_size, configuredSize=configured_size,
                    mute=False, dockEnabled=True, notifyOnDone=True)
    try:
        value = json.loads(Path(filename).read_text(encoding='utf-8-sig'))
        if not isinstance(value, dict) or value.get('version') != 1:
            return defaults
        if value.get('configuredSize') == configured_size and type(value.get('size')) in (int, float) and 100 <= value['size'] <= 320:
            defaults['size'] = round(value['size'])
        for key in ('mute', 'dockEnabled', 'notifyOnDone'):
            if type(value.get(key)) is bool:
                defaults[key] = value[key]
        for key in ('left', 'top'):
            if type(value.get(key)) in (int, float) and math.isfinite(value[key]):
                defaults[key] = value[key]
    except (OSError, ValueError, TypeError):
        pass
    return defaults


def save_preferences(filename, value):
    if not filename:
        return
    target = Path(filename)
    temporary = target.with_name(target.name + f'.{os.getpid()}.tmp')
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_text(json.dumps(dict(value, version=1), ensure_ascii=False, allow_nan=False), encoding='utf-8')
        os.replace(temporary, target)
    except (OSError, ValueError, TypeError):
        pass
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def restore_position(left, top, width, height, areas):
    """Keep the entire window in the nearest available screen working area."""
    candidates = []
    for x1, y1, x2, y2 in areas:
        x = max(x1, min(max(x1, x2-width), left))
        y = max(y1, min(max(y1, y2-height), top))
        candidates.append(((x-left)**2+(y-top)**2, x, y))
    _, x, y = min(candidates)
    return x, y
