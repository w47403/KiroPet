"""Pin desk-based animation poses to one fixed tabletop baseline.

The eight source drawings aren't registered to each other: their desk is several
pixels higher/lower in each frame, which looks like a shaking workspace when
played quickly. Translate the entire RGBA pose in whole pixels, preserving the
original anatomy, transparency, and hand-drawn motion. This does not redraw
props, change expressions, or invent intermediate frames.

Run after sprite extraction and before packaging. The operation is idempotent.
Pillow is a build-time dependency only; the shipped plugin needs no Pillow.
"""
from __future__ import annotations

from pathlib import Path
from statistics import median

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ANIMATIONS = ROOT / 'assets' / 'animations'
DESK_CLIPS = ('working', 'editing', 'tool', 'work_pause')
# Last setup frame and first three completion frames still show the full desk.
# Later completion frames intentionally remove/move the desk, so leave them alone.
TRANSITIONS = (('work_start', 7), ('done', 0), ('done', 1), ('done', 2))


def is_wood(rgba):
    r, g, b, a = rgba
    # Restrict to wood's golden-brown palette, not peach skin or blue clothing.
    return (a >= 180 and 95 <= r <= 250 and 55 <= g <= 205
            and 20 <= b <= 155 and r >= g + 28 and g >= b + 18
            and r >= b + 65)


def desk_anchor(image):
    """(horizontal tabletop centre, top edge), or None for no full desk.

    Look for a wide band of wood in the lower half, not hands, hair, or tail.
    """
    rgba = image.convert('RGBA')
    w, h = rgba.size
    pix = rgba.load()
    rows = []
    for y in range(int(h * .57), int(h * .85)):
        xs = [x for x in range(int(w * .07), int(w * .93)) if is_wood(pix[x, y])]
        if len(xs) >= int(w * .36) and xs[-1] - xs[0] >= int(w * .57):
            rows.append((y, xs[0], xs[-1], len(xs)))
    if not rows:
        return None
    top = rows[0][0]
    # Sample inside the tabletop, ignoring fingers and isolated edge pixels.
    inner = [row for row in rows if top + 3 <= row[0] <= top + 14]
    if not inner:
        inner = rows[:5]
    cx = median((left + right) / 2 for _, left, right, _ in inner)
    return int(round(cx)), top


def safe_shift(image, dx, dy, padding=3):
    """Keep every nontransparent source pixel within the tested 3px margin."""
    bounds = image.getchannel('A').getbbox()
    if bounds is None:
        raise ValueError('Empty animation frame')
    w, h = image.size
    dx = min(max(dx, padding - bounds[0]), w - padding - bounds[2])
    dy = min(max(dy, padding - bounds[1]), h - padding - bounds[3])
    return dx, dy


def stabilize_frames(folder=ANIMATIONS, *, verbose=True):
    """Align settled-desk poses and regenerate corresponding Tk thumbnails.

    Use the highest naturally drawn tabletop so vertical alignment moves
    art upward rather than pushing shoes below the canvas.
    """
    entries = [(name, i) for name in DESK_CLIPS for i in range(8)] + list(TRANSITIONS)
    detected = []
    for name, index in entries:
        path = folder / name / f'{index:02d}.png'
        with Image.open(path) as raw:
            frame = raw.convert('RGBA')
        anchor = desk_anchor(frame)
        if anchor is None:
            if (name, index) in TRANSITIONS:
                continue
            raise ValueError(f'{path}: could not find a full tabletop')
        detected.append((path, frame, anchor))
    if not detected:
        raise ValueError('No animation frames containing a desk were found')
    target_x = int(round(median(anchor[0] for _, _, anchor in detected)))
    target_y = min(anchor[1] for _, _, anchor in detected)
    shifts = []
    for path, frame, (cx, top) in detected:
        want_dx, want_dy = target_x - cx, target_y - top
        # A large offset usually indicates that the detected object is wrong.
        if abs(want_dx) > 24 or abs(want_dy) > (40 if path.parent.name == 'done' else 30):
            if path.parent.name in DESK_CLIPS:
                raise ValueError(f'{path}: suspicious desk displacement: {(want_dx, want_dy)}')
            continue
        dx, dy = safe_shift(frame, want_dx, want_dy)
        if dx or dy:
            moved = Image.new('RGBA', frame.size)
            moved.paste(frame, (dx, dy))
            moved.save(path, optimize=True)
            tk_path = folder / 'tk' / '190' / path.parent.name / path.name
            if tk_path.exists():
                moved.resize((142, 190), Image.Resampling.LANCZOS).save(tk_path, optimize=True)
        shifts.append((path.parent.name, path.stem, dx, dy, want_dx - dx, want_dy - dy))
    if verbose:
        print(f'Stabilized {len(shifts)} work frames around tabletop ({target_x}, {target_y}).')
        for name, index, dx, dy, rest_x, rest_y in shifts:
            if dx or dy or rest_x or rest_y:
                print(f'  {name}/{index}: shift=({dx:+d},{dy:+d}), residual=({rest_x:+d},{rest_y:+d})')
    return shifts


if __name__ == '__main__':
    stabilize_frames()
