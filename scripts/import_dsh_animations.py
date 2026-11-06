"""Import every upstream WebM as transparent PNGs for all three native players.

Usage: python scripts/import_dsh_animations.py ../output/dsh-whale-pet
Requires Pillow and imageio-ffmpeg only at build time.
"""
from concurrent.futures import ThreadPoolExecutor
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
SOURCE_SIZE = (640, 360)
FRAME_SIZE = (608, 342)
ART_SIZE = (598, 336)
CATEGORY_LABELS = {'idle': '待机', 'turn': '转身', 'moves': '移动', 'clicks': '点击互动', 'drag': '拖拽', 'daily': '日常', 'work': '工作', 'games': '游戏', 'music': '音乐', 'food': '美食', 'festivals': '节日', 'seasonal': '四季', 'magic': '魔术', 'fun': '趣味', 'special': '特别动作', 'memes': '趣味梗图'}
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
    def import_clip(item):
        number, (name, label, category) = item
        label = label.replace('Token', '词元')
        video = source / 'assets/thumb' / category / (name + '.webm')
        reader = imageio_ffmpeg.read_frames(str(video), pix_fmt='rgba', bits_per_pixel=32,
                                            input_params=['-threads', '2', '-c:v', 'libvpx-vp9'])
        meta = next(reader)
        assert meta['size'] == SOURCE_SIZE
        fps = meta['fps']
        folder = OUT / 'dsh' / name
        folder.mkdir(parents=True, exist_ok=True)
        paths, durations = [], []
        # Preserve the entire source canvas and use the same scale for every action.
        for index, raw in enumerate(reader):
            frame = Image.frombytes('RGBA', SOURCE_SIZE, raw)
            frame.putalpha(frame.getchannel('A').point(lambda value: 0 if value <= 8 else value))
            result = Image.new('RGBA', FRAME_SIZE)
            result.paste(frame.resize(ART_SIZE, Image.Resampling.LANCZOS), (5, 3))
            relative = f'dsh/{name}/{index:04}.png'
            result.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT / relative)
            for height in (140, 190):
                target = OUT / 'tk' / str(height) / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                result.resize((round(FRAME_SIZE[0] * height / FRAME_SIZE[1]), height), Image.Resampling.LANCZOS).quantize(
                    colors=256, method=Image.Quantize.FASTOCTREE).save(target)
            paths.append(relative)
            durations.append(round((index + 1) * 1000 / fps) - round(index * 1000 / fps))
        assert len(paths) > 1, name
        clip = {'frames': paths, 'durations': durations, 'loop': False,
                'sourceId': name, 'nameZh': label, 'category': category}
        entry = {'id': name, 'nameZh': label, 'category': category,
                 'source': video.relative_to(source).as_posix(),
                 'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
                 'fps': fps, 'frameCount': len(paths)}
        print(f'[{number}/95] {name}: {len(paths)} frames at {fps} fps', flush=True)
        return name, clip, entry

    clips = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for name, clip, entry in pool.map(import_clip, enumerate(entries, 1)):
            clips[name] = clip
            catalog.append(entry)
    for alias, name in ALIASES.items():
        clips[alias] = dict(clips[name], loop=alias in ('working', 'editing', 'tool', 'sleep', 'drag'))
    clips['work_start'] = dict(clips['coding'], frames=clips['coding']['frames'][:12],
                               durations=clips['coding']['durations'][:12])
    idle = ['sit', 'nap', 'stretch', 'walk', 'rice_scoop', 'rice_hug', 'rice_full']
    idle += [entry['id'] for entry in catalog if entry['category'] not in ('idle', 'work', 'drag', 'clicks')]
    manifest = {'version': 6, 'frameSize': list(FRAME_SIZE), 'continuousIdle': True,
                'sourceFrameSize': list(SOURCE_SIZE), 'artSize': list(ART_SIZE),
                'peekCrop': [196, 12, 216, 216],
                'assetSource': {'repository': 'https://github.com/luweiyabo/dsh-whale-pet',
                                'commit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
                                'licenseNotice': 'THIRD_PARTY_ASSETS.md'},
                'catalog': catalog, 'categoryLabels': CATEGORY_LABELS,
                'idleBehavior': {'clips': idle, 'initialHoldMs': 22000, 'restMinMs': 22000,
                                 'restMaxMs': 45000, 'weights': {name: 1 for name in idle}},
                'reactions': {'working': 'work_pet', 'editing': 'work_pet', 'tool': 'work_pet',
                              'sleep': 'sleep_pet', 'nap': 'sleep_pet', 'sit': 'sit_pet'},
                'clips': clips}
    # Publish the manifest last; interrupted imports never activate partial assets.
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    notice = (ROOT / 'docs/ASSET_ATTRIBUTION.md').read_text(encoding='utf-8')
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
