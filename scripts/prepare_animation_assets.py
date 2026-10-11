"""Package ImageGen sprite sheets into transparent, fixed-canvas animation frames.

This does not invent motion: every pose is drawn in the source sprite sheet.
Requires Pillow only for asset preparation, never for the installed companion.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets' / 'animations'
STATES = ('idle', 'working', 'tool', 'editing', 'done', 'hug', 'sleep')
DURATIONS = {
    'idle': [640, 160, 160, 160, 160, 320, 160, 240],
    'working': [240, 160, 240, 160, 160, 240, 160, 240],
    'tool': [240, 160, 160, 160, 240, 240, 160, 240],
    'editing': [160] * 8,
    'done': [160, 160, 160, 240, 160, 160, 240, 640],
    'hug': [240, 240, 240, 240, 240, 240, 240, 320],
    'sleep': [400, 240, 240, 400, 240, 240, 240, 400],
}


def prepare():
    manifest = {'version': 1, 'frameSize': [256, 342], 'clips': {}}
    for state in STATES:
        source = DEST / 'source' / f'{state}.webp'
        if not source.exists():
            source = DEST / 'source' / f'{state}.png'
        sheet = Image.open(source).convert('RGBA')
        if sheet.width % 4 or sheet.height % 2:
            raise ValueError(f'{state}: sprite sheet must divide into a 4 by 2 grid')
        width, height = sheet.width // 4, sheet.height // 2
        if sheet.getchannel('A').getextrema()[0] != 0:
            raise ValueError(f'{state}: source has no transparent pixels')
        clip_dir = DEST / state
        clip_dir.mkdir(parents=True, exist_ok=True)
        native_dir = DEST / 'tk' / '190' / state
        native_dir.mkdir(parents=True, exist_ok=True)
        paths, checksums = [], []
        for index in range(8):
            col, row = index % 4, index // 4
            frame = sheet.crop((col * width, row * height, (col + 1) * width, (row + 1) * height))
            if not frame.getchannel('A').getbbox():
                raise ValueError(f'{state} frame {index}: blank frame')
            # One fixed transform for every cell: preserve drawn motion and alpha.
            # Margin prevents the texture edge touching the desktop window bounds.
            scaled = frame.resize((240, 320), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (256, 342))
            canvas.alpha_composite(scaled, (8, 11))
            relative = f'{state}/{index:02}.png'
            canvas.save(DEST / relative, optimize=True)
            canvas.resize((142, 190), Image.Resampling.LANCZOS).save(native_dir / f'{index:02}.png', optimize=True)
            paths.append(relative)
            checksums.append(hashlib.sha256(canvas.tobytes()).hexdigest())
        if len(set(checksums)) != 8:
            raise ValueError(f'{state}: repeated poses instead of eight distinct frames')
        manifest['clips'][state] = {
            'frames': paths, 'durations': DURATIONS[state],
            'loop': state not in ('done', 'hug'),
        }
    (DEST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Default and legacy mood paths now use the approved complete-body character.
    legacy = {'idle': 'idle', 'happy': 'working', 'hug': 'hug', 'sleep': 'sleep', 'done': 'done'}
    for name, state in legacy.items():
        Image.open(DEST / state / '00.png').save(ROOT / 'assets' / 'moods' / f'{name}.png')
    Image.open(DEST / 'idle' / '00.png').save(ROOT / 'assets' / 'whale-girl.png')
    icon = Image.new('RGBA', (256, 256))
    icon.alpha_composite(Image.open(DEST / 'idle' / '00.png').resize((192, 256), Image.Resampling.LANCZOS), (32, 0))
    icon.save(ROOT / 'assets' / 'icon.png', optimize=True)
    print('Prepared 7 clips, 56 unique RGBA frames, and 56 native Tk frames.')


if __name__ == '__main__':
    prepare()
