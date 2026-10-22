"""Build registered, motion-compensated animation frames offline.

Runtime needs no Pillow/OpenCV. Original drawings are retained so a build never
filters an already filtered frame. Pixel motion uses bidirectional DIS flow;
premultiplied alpha prevents dark fringes on the transparent desktop window.
"""
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from lock_work_desk import table_mask
from stabilize_work_frames import desk_anchor

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/animations'
SIZE = (256, 342)
STEP = 40
MAX_MOTION = 200
REVISION = 'registered-dis-v2'


def rgba(path):
    with Image.open(path) as image:
        result = np.array(image.convert('RGBA'))
    # Source sheets contain faint, disconnected remnants of adjacent cells.
    # Keep meaningful sprite components and their original antialiased fringe.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(np.uint8(result[:, :, 3] >= 32))
    largest = max(stats[1:, cv2.CC_STAT_AREA], default=1)
    keep = np.zeros(result.shape[:2], np.uint8)
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] >= max(20, largest*.0015):
            keep[labels == index] = 255
    keep = cv2.dilate(keep, np.ones((5, 5), np.uint8))
    result[keep == 0] = 0
    return result


def premultiply(image):
    result = image.astype(np.float32) / 255
    result[:, :, :3] *= result[:, :, 3:4]
    return result


def unpremultiply(image):
    result = image.copy()
    result[:, :, :3] /= np.maximum(result[:, :, 3:4], 1 / 255)
    result = np.uint8(np.clip(np.rint(result * 255), 0, 255))
    result[result[:, :, 3] < 2] = 0
    # The window must not clip any antialiased edge.
    result[:3] = 0; result[-3:] = 0; result[:, :3] = 0; result[:, -3:] = 0
    return result


def transform(image, profile, anchor):
    image = image.copy()
    for x0,y0,x1,y1 in profile.get('dropComponents', []):
        image[y0:y1,x0:x1] = 0
    scale = profile.get('scale', 1)
    dx, dy = profile.get('dx', 0), profile.get('dy', 0)
    matrix = np.float32([[scale, 0, anchor[0] * (1-scale) + dx],
                         [0, scale, anchor[1] * (1-scale) + dy]])
    floating = cv2.warpAffine(premultiply(image), matrix, SIZE, flags=cv2.INTER_CUBIC)
    upper = profile.get('upper')
    if upper:
        yy, xx = np.mgrid[:SIZE[1], :SIZE[0]].astype(np.float32)
        cutoff = upper.get('cutoffY', 185)
        feather = upper.get('feather', 29)
        weight = np.clip((cutoff + feather - yy) / max(feather, 1), 0, 1)
        floating = cv2.remap(floating, xx-weight*upper.get('dx', 0),
                             yy-weight*upper.get('dy', 0), cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_CONSTANT)
    return unpremultiply(floating)


def save_sizes(relative, array):
    image = Image.fromarray(array)
    for prefix, size in (('', SIZE), ('tk/190/', (142, 190)), ('tk/140/', (105, 140))):
        path = ASSETS / (prefix + relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        image.resize(size, Image.Resampling.LANCZOS).save(path, optimize=True)


def flow_gray(image):
    # Composite on neutral grey rather than treating invisible RGB as black.
    a = image[:, :, 3:4].astype(np.float32) / 255
    rgb = image[:, :, :3] * a + 216 * (1-a)
    return cv2.cvtColor(np.uint8(rgb), cv2.COLOR_RGB2GRAY)


def motion_pair(a, b):
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0)
    dis.setGradientDescentIterations(32)
    dis.setVariationalRefinementIterations(8)
    ag, bg = flow_gray(a), flow_gray(b)
    forward = dis.calc(ag, bg, None)
    backward = dis.calc(bg, ag, None)
    return forward, backward


def interpolate(a, b, forward, backward, t):
    yy, xx = np.mgrid[:a.shape[0], :a.shape[1]].astype(np.float32)
    def warp(source, flow, distance):
        mx, my = xx.copy(), yy.copy()
        # Invert the forward warp, rather than applying a flow at wrong pixels.
        for _ in range(4):
            offset = cv2.remap(flow, mx, my, cv2.INTER_LINEAR,
                               borderMode=cv2.BORDER_REPLICATE)
            mx, my = xx-distance*offset[:, :, 0], yy-distance*offset[:, :, 1]
        return cv2.remap(premultiply(source), mx, my, cv2.INTER_LINEAR,
                         borderMode=cv2.BORDER_CONSTANT)
    left = warp(a, forward, t)
    right = warp(b, backward, 1-t)
    # Both images now occupy the intermediate geometry; blend colour only there.
    return unpremultiply(left*(1-t) + right*t)


def smooth():
    cv2.setNumThreads(1)  # deterministic asset build, independent of CPU count
    manifest = json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('smoothing'):
        raise ValueError('Compile the original sequence manifest before smoothing')
    profiles = json.loads((ROOT/'scripts/animation-registration.json').read_text(encoding='utf-8'))
    # Interleaving a separately drawn sheet added position and proportion jumps.
    for name in ('working', 'editing'):
        clip = manifest['clips'][name]
        clip['frames'] = clip['frames'][::2]
        clip['durations'] = [sum(clip['durations'][i:i+2]) for i in range(0,len(clip['durations']),2)]
    for name, first, last in (('work_start', 'idle/00.png', 'working/00.png'),
                               ('done', 'working/00.png', 'idle/00.png'),
                               ('hug', 'idle/00.png', 'idle/00.png')):
        clip = manifest['clips'][name]
        clip['frames'] = [first] + clip['frames'] + [last]
        clip['durations'] = [160] + clip['durations'] + [160]
    originals = sorted({p for c in manifest['clips'].values() for p in c['frames']})
    fingerprint = hashlib.sha256(json.dumps([REVISION, manifest, profiles],sort_keys=True).encode())
    fingerprint.update(Path(__file__).read_bytes())
    helper = ROOT/'scripts/animation_flow.py'
    if helper.exists():
        fingerprint.update(helper.read_bytes())
    for path in originals:
        fingerprint.update((ASSETS/path).read_bytes())
    fingerprint = fingerprint.hexdigest()
    cache = ROOT/'output/smoothing-cache.json'
    if cache.exists():
        cached = json.loads(cache.read_text(encoding='utf-8'))
        if cached['fingerprint'] == fingerprint and all((ASSETS/prefix/path).exists()
                for c in cached['manifest']['clips'].values() for path in c['frames']
                for prefix in ('', 'tk/140', 'tk/190')):
            (ASSETS/'manifest.json').write_text(json.dumps(cached['manifest'],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print('Reused verified motion assets (source fingerprint unchanged).')
            return
    registered = {}
    for relative in originals:
        pose, file = relative.split('/')
        group = profiles['poses'].get(pose, {})
        frames = group.get('frames', [{}]*8)
        image = transform(rgba(ASSETS/relative), frames[int(Path(file).stem)], group.get('anchor', [128, 331]))
        registered[relative] = image
        save_sizes('registered/'+relative, image)
    desk = registered['working/00.png']
    desk_mask = np.array(table_mask(*desk_anchor(Image.fromarray(desk)))) > 0
    stationary = {'working', 'editing', 'work_pause'}
    for relative in registered:
        if relative.split('/')[0] in stationary:
            registered[relative][desk_mask] = desk[desk_mask]
            save_sizes('registered/'+relative, registered[relative])
    pairs = {}; metrics = {}; generated = set()
    for name, clip in manifest['clips'].items():
        sources, durations = clip['frames'], clip['durations']
        result, times, source_labels = [], [], []
        before_steps, after_steps = [], []
        for i, (source, duration) in enumerate(zip(sources, durations)):
            result.append('registered/'+source); source_labels.append(source)
            target = sources[(i+1) % len(sources)]
            if i == len(sources)-1 and not clip['loop']:
                times.append(duration); continue
            a, b = registered[source], registered[target]
            before_steps.append(float(np.abs(premultiply(a)-premultiply(b)).mean()))
            motion = min(duration, MAX_MOTION)
            count = max(2, math.ceil(motion/STEP))
            segments = [round(motion*(j+1)/count)-round(motion*j/count) for j in range(count)]
            times.append(duration-motion+segments[0])
            key = source+'>'+target
            if key not in pairs:
                pairs[key] = motion_pair(a, b)
            forward, backward = pairs[key]
            last = a
            for j in range(1, count):
                t = j/count
                image = interpolate(a, b, forward, backward, t)
                if source.split('/')[0] in stationary and target.split('/')[0] in stationary:
                    image[desk_mask] = desk[desk_mask]
                digest = hashlib.sha256(image.tobytes()).hexdigest()[:16]
                relative = f'tween/{source.split("/")[0]}/{digest}.png'
                if relative not in generated:
                    save_sizes(relative, image); generated.add(relative)
                after_steps.append(float(np.abs(premultiply(last)-premultiply(image)).mean()))
                last = image
                result.append(relative); times.append(segments[j]); source_labels.append(source)
            after_steps.append(float(np.abs(premultiply(last)-premultiply(b)).mean()))
        clip.update(frames=result, durations=times, sources=source_labels)
        metrics[name] = {'sourceFrames':len(sources), 'frames':len(result), 'durationMs':sum(times),
                         'largestKeyframeChange':round(max(before_steps, default=0),6),
                         'largestOutputChange':round(max(after_steps, default=0),6)}
    manifest['version'] = 4
    manifest['smoothing'] = {'method':'registered-bidirectional-optical-flow', 'revision':REVISION,
                             'motionStepMs':STEP, 'maxMotionWindowMs':MAX_MOTION,
                             'originalsPreserved':True}
    (ASSETS/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Remove only obsolete derivatives owned by this compiler. Source drawings
    # and user assets never enter this list, and runtime packaging is manifest-led.
    referenced = {p for c in manifest['clips'].values() for p in c['frames']}
    root = ASSETS.resolve()
    for prefix in ('', 'tk/140/', 'tk/190/'):
        for derived in ('registered', 'tween'):
            folder = (root/(prefix+derived)).resolve()
            if not folder.is_relative_to(root):
                raise ValueError('Derivative cleanup escaped animation folder')
            for path in folder.rglob('*.png'):
                relative = path.relative_to(root/prefix).as_posix()
                if relative not in referenced:
                    path.unlink()
    (ROOT/'output').mkdir(exist_ok=True)
    cache.write_text(json.dumps({'fingerprint':fingerprint,'manifest':manifest},ensure_ascii=False),encoding='utf-8')
    (ROOT/'output/animation-smoothness.json').write_text(json.dumps(metrics,indent=2)+'\n',encoding='utf-8')
    print(f'Stabilized {len(registered)} drawings; generated {len(generated)} unique motion frames across {len(metrics)} clips.')


if __name__ == '__main__':
    smooth()
