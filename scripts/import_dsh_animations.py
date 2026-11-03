"""Import every upstream WebM as transparent PNGs for all three native players.

Usage: python scripts/import_dsh_animations.py ../output/dsh-whale-pet
Requires Pillow and imageio-ffmpeg only at build time.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path
from PIL import Image
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/animations'
ALIASES = {
    'idle': 'breathing', 'working': 'coding', 'editing': 'taking_notes',
    'tool': 'deep_thought', 'done': 'happy_hop', 'sleep': 'quick_nap',
    'hug': 'ticklish_giggle', 'drag': 'dragged_in_midair', 'land': 'arrival_wave',
    'sit': 'attentive_listening', 'nap': 'quick_nap', 'stretch': 'big_stretch',
    'walk': 'floating_steps', 'rice_scoop': 'eating_rice',
    'rice_hug': 'eating_lunch', 'rice_full': 'eating_dinner',
    'work_pause': 'sleepy_yawn', 'work_pet': 'shy_surprise',
    'sit_pet': 'cheerful_wave', 'sleep_pet': 'startled_awake',
}


def import_assets(source):
    catalog_text = (source / 'src/client/animations.js').read_text(encoding='utf-8')
    catalog = []
    pattern = r"id: '([^']+)'.*?nameZh: '([^']+)'.*?category: '([^']+)'"
    entries = re.findall(pattern, catalog_text, re.S)
    videos = list((source / 'assets/thumb').rglob('*.webm'))
    assert len(entries) == len(videos) == 95, 'Upstream catalog changed; review before importing'
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    clips = {}
    for number, (name, label, category) in enumerate(entries, 1):
        video = source / 'assets/thumb' / category / (name + '.webm')
        reader = imageio_ffmpeg.read_frames(str(video), pix_fmt='rgba', bits_per_pixel=32,
                                            input_params=['-c:v', 'libvpx-vp9'])
        meta = next(reader)
        assert meta['size'] == (640, 360)
        fps = meta['fps']
        # A single crop per clip prevents frame-to-frame resizing and preserves props.
        frames = []
        bounds = None
        for raw in reader:
            frame = Image.frombytes('RGBA', meta['size'], raw)
            alpha = frame.getchannel('A').point(lambda value: 0 if value <= 8 else value)
            frame.putalpha(alpha)
            box = alpha.getbbox()
            if box:
                bounds = box if bounds is None else (min(bounds[0], box[0]), min(bounds[1], box[1]),
                                                      max(bounds[2], box[2]), max(bounds[3], box[3]))
            frames.append(frame)
        assert bounds and len(frames) > 1, name
        half = min(320, max(125, 320 - bounds[0] + 6, bounds[2] - 320 + 6))
        crop = (320 - half, 0, 320 + half, 360)
        factor = min(250 / (half * 2), 336 / 360)
        size = (round(half * 2 * factor), round(360 * factor))
        folder = OUT / 'dsh' / name
        folder.mkdir(parents=True, exist_ok=True)
        paths, durations = [], []
        for index, frame in enumerate(frames):
            result = Image.new('RGBA', (256, 342))
            result.paste(frame.crop(crop).resize(size, Image.Resampling.LANCZOS),
                         ((256 - size[0]) // 2, 342 - size[1] - 3))
            relative = f'dsh/{name}/{index:04}.png'
            result.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT / relative)
            for height in (140, 190):
                target = OUT / 'tk' / str(height) / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                result.resize((round(256 * height / 342), height), Image.Resampling.LANCZOS).quantize(
                    colors=256, method=Image.Quantize.FASTOCTREE).save(target)
            paths.append(relative)
            durations.append(round((index + 1) * 1000 / fps) - round(index * 1000 / fps))
        clips[name] = {'frames': paths, 'durations': durations, 'loop': False,
                       'sourceId': name, 'nameZh': label, 'category': category}
        catalog.append({'id': name, 'nameZh': label, 'category': category,
                        'source': video.relative_to(source).as_posix(),
                        'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
                        'fps': fps, 'frameCount': len(frames), 'crop': list(crop)})
        print(f'[{number}/95] {name}: {len(frames)} frames at {fps} fps', flush=True)
    for alias, name in ALIASES.items():
        clips[alias] = dict(clips[name], loop=alias in ('working', 'editing', 'tool', 'sleep', 'drag'))
    clips['work_start'] = dict(clips['coding'], frames=clips['coding']['frames'][:12],
                               durations=clips['coding']['durations'][:12])
    idle = ['sit', 'nap', 'stretch', 'walk', 'rice_scoop', 'rice_hug', 'rice_full']
    idle += [entry['id'] for entry in catalog if entry['category'] not in ('idle', 'work', 'drag', 'clicks')]
    manifest = {'version': 5, 'frameSize': [256, 342], 'continuousIdle': True,
                'assetSource': {'repository': 'https://github.com/luweiyabo/dsh-whale-pet',
                                'commit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
                                'licenseNotice': 'THIRD_PARTY_ASSETS.md'},
                'catalog': catalog,
                'idleBehavior': {'clips': idle, 'initialHoldMs': 22000, 'restMinMs': 22000,
                                 'restMaxMs': 45000, 'weights': {name: 1 for name in idle}},
                'reactions': {'working': 'work_pet', 'editing': 'work_pet', 'tool': 'work_pet',
                              'sleep': 'sleep_pet', 'nap': 'sleep_pet', 'sit': 'sit_pet'},
                'clips': clips}
    # Publish the manifest last; interrupted imports never activate partial assets.
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    notice = ('# 本地自用动画来源\n\n'
              '本扩展的 95 个动作来自 https://github.com/luweiyabo/dsh-whale-pet ，'
              '已转换为透明 PNG 供本地逐帧播放器使用。导入版本与逐文件 SHA-256 '
              '记录于 assets/animations/manifest.json。\n\n'
              '源代码许可不覆盖第三方动画。请保留以下原始资源说明；本安装包用于个人非商业使用。\n\n---\n\n')
    (ROOT / 'THIRD_PARTY_ASSETS.md').write_text(
        notice + (source / 'THIRD_PARTY_ASSETS.md').read_text(encoding='utf-8'), encoding='utf-8')
    shutil.copyfile(source / 'LICENSE', ROOT / 'assets/animations/DSH-LICENSE.txt')
    # Replace static placeholders too, so startup and fallback never show old art.
    shutil.copyfile(OUT / clips['idle']['frames'][0], ROOT / 'assets/whale-girl.png')
    for mood, clip in {'idle': 'idle', 'happy': 'working', 'hug': 'hug',
                       'sleep': 'sleep', 'done': 'done'}.items():
        shutil.copyfile(OUT / clips[clip]['frames'][0], ROOT / 'assets/moods' / (mood + '.png'))
    icon = Image.new('RGBA', (256, 256))
    with Image.open(OUT / clips['idle']['frames'][0]) as image:
        artwork = image.convert('RGBA')
        artwork = artwork.crop(artwork.getbbox())
        artwork.thumbnail((248,248), Image.Resampling.LANCZOS)
        icon.paste(artwork, ((256-artwork.width)//2,(256-artwork.height)//2))
    icon.save(ROOT / 'assets/icon.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    import_assets(parser.parse_args().source.resolve())
