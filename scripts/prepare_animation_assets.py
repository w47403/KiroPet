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
STATES = ('idle', 'working', 'tool', 'editing', 'done', 'hug', 'sleep', 'sit', 'nap', 'stretch', 'walk', 'work_start', 'work_pause')
DURATIONS = {
    'idle': [640, 160, 160, 160, 160, 320, 160, 240],
    'working': [480, 320, 320, 480, 240, 480, 320, 480],
    'tool': [800, 700, 900, 1200, 900, 1200, 700, 800],
    'editing': [320, 240, 240, 320, 240, 320, 240, 320],
    'done': [800, 600, 600, 700, 600, 600, 700, 1600],
    'hug': [240, 240, 240, 240, 240, 240, 240, 320],
    'sleep': [1200, 1200, 16000, 1200, 1200, 14000, 1200, 1200],
    'sit': [1200, 200, 320, 400, 240, 400, 320, 1000],
    'nap': [800, 500, 1200, 500, 500, 1200, 500, 800],
    'stretch': [500, 320, 500, 500, 500, 500, 320, 800],
    'walk': [500, 400, 400, 400, 400, 400, 400, 700],
    'work_start': [500, 600, 750, 600, 750, 600, 600, 1000],
    'work_pause': [800, 700, 900, 1200, 900, 1200, 700, 800],
}


def cells_for(sheet, adaptive=False):
    """Find transparent gutters near the grid, so slight generator drift cannot cut a pose."""
    width, height = sheet.width//4, sheet.height//2
    if not adaptive:
        return [sheet.crop((i%4*width,i//4*height,(i%4+1)*width,(i//4+1)*height)) for i in range(8)]
    mask = sheet.getchannel('A').point(lambda value: 255 if value >= 64 else 0)
    def gutter(axis, nominal, lo, hi):
        limit_lo,limit_hi = (lo,hi) if axis=='y' else (1,sheet.width-1)
        candidates = range(max(limit_lo,nominal-64),min(limit_hi,nominal+65))
        def score(value):
            strip = mask.crop((0,value,sheet.width,value+1) if axis=='y' else (value,lo,value+1,hi))
            return strip.histogram()[255],abs(value-nominal)
        return min(candidates,key=score)
    divider = gutter('y',height,1,sheet.height-1)
    result=[]
    for row,(top,bottom) in enumerate(((0,divider),(divider,sheet.height))):
        edges=[0]+[gutter('x',width*i,top,bottom) for i in range(1,4)]+[sheet.width]
        for col in range(4):
            result.append(sheet.crop((edges[col],top,edges[col+1],bottom)))
    return result


def prepare():
    manifest = {'version': 2, 'frameSize': [256, 342],
                'idleBehavior': {'clips': ['idle','sit','nap','stretch','walk'], 'initialHoldMs': 22000,
                                 'restMinMs': 18000, 'restMaxMs': 45000}, 'clips': {}}
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
        cells = cells_for(sheet, state in ('sit','nap','working','tool','sleep','editing','done','work_start','work_pause','walk'))
        # A single scale per sheet retains drawn motion; equal canvas and baseline.
        scale = min(240/max(cell.width for cell in cells),320/max(cell.height for cell in cells))
        for index in range(8):
            frame = cells[index]
            if not frame.getchannel('A').getbbox():
                raise ValueError(f'{state} frame {index}: blank frame')
            # One fixed transform for every cell: preserve drawn motion and alpha.
            # Margin prevents the texture edge touching the desktop window bounds.
            scaled = frame.resize((round(frame.width*scale),round(frame.height*scale)), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (256, 342))
            canvas.alpha_composite(scaled, ((256-scaled.width)//2,331-scaled.height))
            relative = f'{state}/{index:02}.png'
            canvas.save(DEST / relative, optimize=True)
            canvas.resize((142, 190), Image.Resampling.LANCZOS).save(native_dir / f'{index:02}.png', optimize=True)
            paths.append(relative)
            checksums.append(hashlib.sha256(canvas.tobytes()).hexdigest())
        if len(set(checksums)) != 8:
            raise ValueError(f'{state}: repeated poses instead of eight distinct frames')
        manifest['clips'][state] = {
            'frames': paths, 'durations': DURATIONS[state],
            'loop': state in ('working','tool','editing','sleep'),
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
    print(f'Prepared {len(STATES)} clips, {len(STATES)*8} RGBA frames and matching native Tk frames.')


if __name__ == '__main__':
    prepare()
